import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";

const emailSchema = z.string().email().max(254).transform((value) => value.trim().toLowerCase());
const contactFields = z.object({
  email: emailSchema.optional(),
  emails: z.array(emailSchema).min(1).max(100).optional(),
  firstName: z.string().max(100).optional().default(""),
  lastName: z.string().max(100).optional().default(""),
  audienceId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional().default([]),
});
const contactInputSchema = contactFields.refine(
  (contact) => Boolean(contact.email || contact.emails?.length),
  "Add at least one email address.",
);

const requestSchema = z.union([
  contactFields.extend({
    consent: z.literal(true),
    consentSource: z.string().trim().min(2).max(200),
  }).refine((contact) => Boolean(contact.email || contact.emails?.length), "Add at least one email address."),
  z.object({
    contacts: z.array(contactInputSchema).min(1).max(500),
    consent: z.literal(true),
    consentSource: z.string().trim().min(2).max(200),
  }),
]);

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
  const { data, error, count } = await supabase.from("contacts")
    .select("id,email,first_name,last_name,status,tags,created_at,audience_id,consent_at,consent_source,contact_emails(id,email,status,consent_at,consent_source,is_primary)", { count: "exact" })
    .eq("user_id", user.id).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [], total: count ?? 0 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid contact data." }, { status: 400 });
  const contacts = "contacts" in parsed.data ? parsed.data.contacts : [parsed.data];
  const consentSource = parsed.data.consentSource;
  const groupedContacts = contacts.map((contact) => ({
    ...contact,
    emails: [...new Set([...(contact.emails ?? []), ...(contact.email ? [contact.email] : [])])],
  }));
  if (groupedContacts.some((contact) => contact.emails.length > 100)) {
    return NextResponse.json({ error: "A contact can have at most 100 email addresses." }, { status: 400 });
  }

  const audienceIds = [...new Set(contacts.map((contact) => contact.audienceId).filter((id): id is string => !!id))];
  if (audienceIds.length) {
    const { data: ownedAudiences, error } = await supabase.from("audiences").select("id,resend_segment_id").eq("user_id", user.id).in("id", audienceIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((ownedAudiences ?? []).length !== audienceIds.length) return NextResponse.json({ error: "Selected audience does not belong to this workspace." }, { status: 403 });
  }

  const emails = [...new Set(groupedContacts.flatMap((contact) => contact.emails))];
  const { data: existing, error: existingError } = await supabase.from("contact_emails")
    .select("email")
    .eq("user_id", user.id)
    .in("email", emails);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const existingEmails = new Set((existing ?? []).map((item) => item.email));
  let duplicateAddresses = 0;
  const claimedEmails = new Set(existingEmails);
  const unique = groupedContacts.flatMap((contact) => {
    const newEmails = contact.emails.filter((email) => {
      if (claimedEmails.has(email)) {
        duplicateAddresses++;
        return false;
      }
      claimedEmails.add(email);
      return true;
    });
    return newEmails.length ? [{ ...contact, emails: newEmails }] : [];
  });
  if (!unique.length) return NextResponse.json({ created: 0, duplicates: duplicateAddresses, contacts: [] });

  const rows = unique.map((contact) => ({
    user_id: user.id,
    email: contact.emails[0],
    first_name: contact.firstName?.trim() || null,
    last_name: contact.lastName?.trim() || null,
    audience_id: contact.audienceId ?? null,
    tags: contact.tags ?? [],
    status: "subscribed" as const,
    consent_at: new Date().toISOString(),
    consent_source: consentSource,
  }));
  const { data: inserted, error } = await supabase.from("contacts")
    .insert(rows)
    .select("id,email,first_name,last_name,status,tags,created_at,audience_id,consent_at,consent_source");
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A contact with that email already exists." : error.message }, { status: 409 });

  const contactsByPrimaryEmail = new Map((inserted ?? []).map((contact) => [contact.email, contact]));
  const addressRows = unique.flatMap((contact) => {
    const parent = contactsByPrimaryEmail.get(contact.emails[0]);
    if (!parent) return [];
    return contact.emails.map((email, index) => ({
      contact_id: parent.id,
      user_id: user.id,
      email,
      status: "subscribed" as const,
      consent_at: rows.find((row) => row.email === contact.emails[0])?.consent_at,
      consent_source: consentSource,
      is_primary: index === 0,
    }));
  });
  const { data: insertedAddresses, error: addressError } = await supabase.from("contact_emails")
    .insert(addressRows)
    .select("id,contact_id,email,status,consent_at,consent_source,resend_contact_id,is_primary");
  if (addressError) {
    const { error: cleanupError } = await supabase.from("contacts").delete().in("id", (inserted ?? []).map((contact) => contact.id)).eq("user_id", user.id);
    const cleanup = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : "";
    return NextResponse.json({ error: `Could not save contact email addresses: ${addressError.message}.${cleanup}` }, { status: 500 });
  }

  let syncWarning: string | undefined;
  if (process.env.RESEND_API_KEY) {
    const audienceResult = await supabase.from("audiences").select("id,name,resend_segment_id").eq("user_id", user.id);
    if (audienceResult.error) syncWarning = `Saved locally; could not check Resend Segment mappings: ${audienceResult.error.message}`;
    else {
      const audiences = new Map((audienceResult.data ?? []).map((audience) => [audience.id, audience.resend_segment_id]));
      const failures: string[] = [];
      for (let offset = 0; offset < (insertedAddresses ?? []).length; offset += 10) {
        const batch = (insertedAddresses ?? []).slice(offset, offset + 10);
        const results = await Promise.allSettled(batch.map(async (address) => {
          const contact = contactsByPrimaryEmail.get(address.email)
            ?? (inserted ?? []).find((item) => item.id === address.contact_id);
          if (!contact) throw new Error("Could not match an email address to its contact.");
          const segmentId = contact.audience_id ? audiences.get(contact.audience_id) : null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const { data, error: resendError } = await getResend().contacts.create({
              email: address.email,
              firstName: contact.first_name ?? undefined,
              lastName: contact.last_name ?? undefined,
              unsubscribed: false,
              ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
            });
            if (!resendError) {
              if (data?.id) {
                const { error: saveIdError } = await supabase.from("contact_emails").update({ resend_contact_id: data.id })
                  .eq("id", address.id)
                  .eq("user_id", user.id);
                if (saveIdError) throw new Error(saveIdError.message);
                if (address.is_primary) {
                  const { error: savePrimaryIdError } = await supabase.from("contacts").update({ resend_contact_id: data.id })
                    .eq("id", contact.id)
                    .eq("user_id", user.id);
                  if (savePrimaryIdError) throw new Error(savePrimaryIdError.message);
                }
              }
              return;
            }
            const retryable = /rate|429|temporar|timeout|unavailable|internal|5\d\d/i.test(resendError.message);
            if (!retryable || attempt === 2) throw new Error(resendError.message);
            await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
          }
        }));
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) failures.push(failure.reason instanceof Error ? failure.reason.message : "unknown Resend sync error");
      }
      if (failures.length) syncWarning = `Saved locally; Resend sync failed for ${failures.length} email address(es): ${failures[0]}`;
      const localOnlyCount = (inserted ?? []).filter((contact) => contact.audience_id && !audiences.get(contact.audience_id)).length;
      if (localOnlyCount) syncWarning = [syncWarning, `${localOnlyCount} contact(s) were added to a local-only audience; sync that audience to Resend before sending.`].filter(Boolean).join(" ");
    }
  }
  const { error: activityError } = await supabase.from("activity_logs").insert({ user_id: user.id, action: "contacts.created", entity_type: "contact", details: { count: inserted?.length ?? 0 } });
  const addressesByContact = new Map<string, typeof insertedAddresses>();
  for (const address of insertedAddresses ?? []) {
    const group = addressesByContact.get(address.contact_id) ?? [];
    group.push(address);
    addressesByContact.set(address.contact_id, group);
  }
  const contactsWithAddresses = (inserted ?? []).map((contact) => ({
    ...contact,
    contact_emails: addressesByContact.get(contact.id) ?? [],
  }));
  const duplicateWarning = duplicateAddresses
    ? `${duplicateAddresses} existing email address${duplicateAddresses === 1 ? " was" : "es were"} skipped.`
    : undefined;
  return NextResponse.json({
    created: inserted?.length ?? 0,
    duplicateAddresses,
    duplicates: duplicateAddresses,
    contacts: contactsWithAddresses,
    contact: "contacts" in parsed.data ? undefined : contactsWithAddresses[0],
    warning: [duplicateWarning, syncWarning, activityError ? `Saved contacts, but activity logging failed: ${activityError.message}` : undefined].filter(Boolean).join(" ") || undefined,
  }, { status: 201 });
}
