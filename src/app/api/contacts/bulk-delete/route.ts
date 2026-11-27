import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeAddressesFromSegment } from "@/lib/segments";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Choose up to 100 contacts at a time." }, { status: 400 });
  const ids = [...new Set(input.data.ids)];

  const { data: contacts, error: contactsError } = await supabase.from("contacts")
    .select("id,email,audience_id,contact_emails(email,resend_contact_id)")
    .eq("user_id", user.id).in("id", ids);
  if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 });
  if (!contacts?.length) return NextResponse.json({ deleted: 0, deletedIds: [], failed: [] });

  const audienceIds = [...new Set(contacts.map((contact) => contact.audience_id).filter((id): id is string => !!id))];
  const segments = new Map<string, string>();
  if (audienceIds.length) {
    const { data: audiences, error: audienceError } = await supabase.from("audiences")
      .select("id,resend_segment_id").eq("user_id", user.id).in("id", audienceIds);
    if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
    for (const audience of audiences ?? []) if (audience.resend_segment_id) segments.set(audience.id, audience.resend_segment_id);
  }

  // Contacts in a Resend Segment leave it first; any that can't stay in place so the lists keep matching.
  const blocked = new Set<string>();
  const failed: { email: string; error: string }[] = [];
  const bySegment = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const segmentId = contact.audience_id ? segments.get(contact.audience_id) : undefined;
    if (!segmentId || !contact.contact_emails?.length) continue;
    bySegment.set(segmentId, [...(bySegment.get(segmentId) ?? []), contact]);
  }
  if (bySegment.size && !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Configure RESEND_API_KEY to remove these contacts from their Resend Segments before deletion." }, { status: 503 });
  }
  for (const [segmentId, group] of bySegment) {
    const addresses = group.flatMap((contact) => contact.contact_emails.map((address) => ({ ...address, contactId: contact.id })));
    const failures = await removeAddressesFromSegment(segmentId, addresses);
    for (const failure of failures) {
      failed.push(failure);
      const owner = addresses.find((address) => address.email === failure.email);
      if (owner) blocked.add(owner.contactId);
    }
  }

  const deletable = contacts.filter((contact) => !blocked.has(contact.id)).map((contact) => contact.id);
  if (deletable.length) {
    const { error: deleteError } = await supabase.from("contacts").delete().eq("user_id", user.id).in("id", deletable);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    await supabase.from("activity_logs").insert({
      user_id: user.id, action: "contacts.deleted", entity_type: "contact", details: { count: deletable.length, bulk: true },
    });
  }
  return NextResponse.json({ deleted: deletable.length, deletedIds: deletable, failed });
}
