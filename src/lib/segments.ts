import type { SupabaseClient } from "@supabase/supabase-js";
import { getResend } from "@/lib/resend";

export type EligibleAddress = {
  id: string;
  email: string;
  resendContactId: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type SegmentMember = { id: string; email: string; unsubscribed: boolean };

/** Pure diff between the provider Segment and the locally eligible addresses. */
export function planSegmentReconciliation<T extends EligibleAddress>(members: SegmentMember[], eligible: T[]) {
  const eligibleEmails = new Set(eligible.map((address) => address.email.toLowerCase()));
  const membersByEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]));
  return {
    toRemove: members.filter((member) => !eligibleEmails.has(member.email.toLowerCase())),
    toAdd: eligible.filter((address) => !membersByEmail.has(address.email.toLowerCase())),
    unsubscribedEmails: new Set(
      eligible
        .filter((address) => membersByEmail.get(address.email.toLowerCase())?.unsubscribed)
        .map((address) => address.email.toLowerCase()),
    ),
  };
}

type ProviderResult<T> = { data: T | null; error: { message: string; statusCode?: number | null; name?: string } | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries Resend calls that were rate limited (HTTP 429), with linear backoff. */
export async function withResendRetry<T>(call: () => Promise<ProviderResult<T>>, attempts = 5): Promise<ProviderResult<T>> {
  let last: ProviderResult<T> = { data: null, error: { message: "Resend request failed." } };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      last = await call();
    } catch (error) {
      last = { data: null, error: { message: error instanceof Error ? error.message : "Resend request failed." } };
    }
    const limited = last.error && (last.error.statusCode === 429 || last.error.name === "rate_limit_exceeded");
    if (!limited || attempt === attempts) return last;
    await sleep(1000 * attempt);
  }
  return last;
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }));
}

export async function listSegmentMembers(segmentId: string) {
  const resend = getResend();
  const members: SegmentMember[] = [];
  let after: string | undefined;
  for (;;) {
    const { data, error } = await withResendRetry(() => resend.contacts.list(after ? { segmentId, limit: 100, after } : { segmentId, limit: 100 }));
    if (error) throw new Error(`Could not list Resend Segment contacts: ${error.message}`);
    const page = data?.data ?? [];
    members.push(...page.map((contact) => ({ id: contact.id, email: contact.email, unsubscribed: contact.unsubscribed })));
    if (!data?.has_more || !page.length) break;
    after = page[page.length - 1].id;
  }
  return members;
}

export type ReconcileResult = {
  added: number;
  removed: number;
  addFailures: string[];
  removeFailures: string[];
  failedAddEmails: Set<string>;
  unsubscribedEmails: Set<string>;
};

/**
 * Makes the Resend Segment contain exactly the eligible addresses: adds
 * missing ones and removes anyone no longer eligible (unsubscribed locally,
 * deleted, moved to another audience, or lacking consent).
 */
export async function reconcileSegment<T extends EligibleAddress>(
  segmentId: string,
  eligible: T[],
  onContactCreated?: (address: T, contactId: string) => Promise<void>,
): Promise<ReconcileResult> {
  const resend = getResend();
  const members = await listSegmentMembers(segmentId);
  const plan = planSegmentReconciliation(members, eligible);
  const result: ReconcileResult = {
    added: 0,
    removed: 0,
    addFailures: [],
    removeFailures: [],
    failedAddEmails: new Set(),
    unsubscribedEmails: plan.unsubscribedEmails,
  };

  await runPool(plan.toRemove, 4, async (member) => {
    const { error } = await withResendRetry(() => resend.contacts.segments.remove({ contactId: member.id, segmentId }));
    if (error) result.removeFailures.push(`${member.email}: ${error.message}`);
    else result.removed++;
  });

  await runPool(plan.toAdd, 4, async (address) => {
    const { error: addError } = await withResendRetry(() => resend.contacts.segments.add(
      address.resendContactId ? { contactId: address.resendContactId, segmentId } : { email: address.email, segmentId },
    ));
    if (!addError) {
      result.added++;
      return;
    }
    // The contact does not exist in Resend yet (or its stored ID is stale): create it inside the Segment.
    const { data, error: createError } = await withResendRetry(() => resend.contacts.create({
      email: address.email,
      firstName: address.firstName ?? undefined,
      lastName: address.lastName ?? undefined,
      unsubscribed: false,
      segments: [{ id: segmentId }],
    }));
    if (createError) {
      result.failedAddEmails.add(address.email.toLowerCase());
      result.addFailures.push(`${address.email}: ${addError.message}; create failed: ${createError.message}`);
      return;
    }
    result.added++;
    if (data?.id && onContactCreated) {
      try {
        await onContactCreated(address, data.id);
      } catch (error) {
        console.error("Could not store Resend contact ID:", error instanceof Error ? error.message : error);
      }
    }
  });

  return result;
}

export type AudienceAddress = EligibleAddress & { contactId: string; isPrimary: boolean };

type EmbeddedContact = { id: string; first_name: string | null; last_name: string | null };

/**
 * Loads every address in an audience that may receive marketing email:
 * subscribed, with recorded consent, owned by the user.
 */
export async function loadEligibleAddresses(
  supabase: SupabaseClient,
  userId: string,
  audienceId: string,
): Promise<{ addresses: AudienceAddress[]; error: string | null }> {
  const addresses: AudienceAddress[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("contact_emails")
      .select("id,email,resend_contact_id,is_primary,contact_id,contacts!inner(id,user_id,audience_id,first_name,last_name)")
      .eq("user_id", userId)
      .eq("status", "subscribed")
      .not("consent_at", "is", null)
      .eq("contacts.user_id", userId)
      .eq("contacts.audience_id", audienceId)
      .order("id")
      .range(offset, offset + 999);
    if (error) return { addresses, error: error.message };
    for (const row of data ?? []) {
      // PostgREST returns a many-to-one embed as an object; tolerate arrays too.
      const embedded = row.contacts as unknown as EmbeddedContact | EmbeddedContact[] | null;
      const contact = Array.isArray(embedded) ? embedded[0] : embedded;
      addresses.push({
        id: row.id,
        email: String(row.email).toLowerCase(),
        resendContactId: row.resend_contact_id ?? null,
        firstName: contact?.first_name ?? null,
        lastName: contact?.last_name ?? null,
        contactId: row.contact_id,
        isPrimary: !!row.is_primary,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return { addresses, error: null };
}

/** Persists the Resend contact ID created during reconciliation. */
export async function storeResendContactId(supabase: SupabaseClient, userId: string, address: AudienceAddress, resendContactId: string) {
  const { error } = await supabase.from("contact_emails").update({ resend_contact_id: resendContactId }).eq("id", address.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (address.isPrimary) {
    const { error: primaryError } = await supabase.from("contacts").update({ resend_contact_id: resendContactId }).eq("id", address.contactId).eq("user_id", userId);
    if (primaryError) throw new Error(primaryError.message);
  }
}
