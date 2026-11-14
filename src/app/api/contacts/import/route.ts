import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const contactSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  firstName: z.string().trim().max(100).optional().default(""),
  lastName: z.string().trim().max(100).optional().default(""),
  audienceId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional().default([]),
});

const requestSchema = z.object({
  contacts: z.array(contactSchema).min(1).max(500),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid contact data." }, { status: 400 });
  const contacts = parsed.data.contacts;

  const audienceIds = [...new Set(contacts.map((contact) => contact.audienceId).filter((id): id is string => !!id))];
  if (audienceIds.length) {
    const { data: ownedAudiences, error } = await supabase.from("audiences")
      .select("id")
      .eq("user_id", user.id)
      .in("id", audienceIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((ownedAudiences ?? []).length !== audienceIds.length) {
      return NextResponse.json({ error: "Selected audience does not belong to this workspace." }, { status: 403 });
    }
  }

  const emails = [...new Set(contacts.map((contact) => contact.email))];
  const { data: existing, error: existingError } = await supabase.from("contact_emails")
    .select("email")
    .eq("user_id", user.id)
    .in("email", emails);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const existingEmails = new Set((existing ?? []).map((contact) => contact.email));
  const unique = contacts.filter((contact, index) =>
    !existingEmails.has(contact.email) && contacts.findIndex((item) => item.email === contact.email) === index);
  const duplicates = contacts.length - unique.length;
  if (!unique.length) return NextResponse.json({ created: 0, duplicates, contacts: [] });

  const rows = unique.map((contact) => ({
    user_id: user.id,
    email: contact.email,
    first_name: contact.firstName || null,
    last_name: contact.lastName || null,
    audience_id: contact.audienceId ?? null,
    tags: contact.tags ?? [],
    status: "pending_consent" as const,
    consent_at: null,
    consent_source: null,
  }));
  const { data: inserted, error } = await supabase.from("contacts")
    .insert(rows)
    .select("id,email,first_name,last_name,status,tags,created_at,audience_id,consent_at,consent_source");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const addressRows = (inserted ?? []).map((contact) => ({
    contact_id: contact.id,
    user_id: user.id,
    email: contact.email,
    status: "pending_consent" as const,
    consent_at: null,
    consent_source: null,
    is_primary: true,
  }));
  const { data: addresses, error: addressError } = await supabase.from("contact_emails")
    .insert(addressRows)
    .select("id,contact_id,email,status,consent_at,consent_source,is_primary");
  if (addressError) {
    const { error: cleanupError } = await supabase.from("contacts").delete().in("id", (inserted ?? []).map((contact) => contact.id)).eq("user_id", user.id);
    return NextResponse.json({ error: `Could not save imported email addresses: ${addressError.message}${cleanupError ? `; cleanup failed: ${cleanupError.message}` : ""}` }, { status: 500 });
  }

  const { error: activityError } = await supabase.from("activity_logs").insert({
    user_id: user.id,
    action: "contacts.csv_imported_pending_consent",
    entity_type: "contact",
    details: { count: inserted?.length ?? 0 },
  });
  return NextResponse.json({
    created: inserted?.length ?? 0,
    duplicates,
    contacts: (inserted ?? []).map((contact) => ({
      ...contact,
      contact_emails: (addresses ?? []).filter((address) => address.contact_id === contact.id),
    })),
    warning: activityError ? `Imported contacts, but activity logging failed: ${activityError.message}` : undefined,
  }, { status: 201 });
}
