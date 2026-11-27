import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";
import { removeAddressesFromSegment } from "@/lib/segments";

const schema = z.object({
  firstName: z.string().max(100).nullable(),
  lastName: z.string().max(100).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid contact details." }, { status: 400 });
  const { id } = await params;
  const { data: contact, error } = await supabase.from("contacts").update({
    first_name: input.data.firstName?.trim() || null,
    last_name: input.data.lastName?.trim() || null,
    tags: input.data.tags,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id).select("id,email,first_name,last_name,status,tags,created_at,audience_id,consent_at,consent_source,resend_contact_id,contact_emails(id,email,resend_contact_id,status,consent_at,consent_source,is_primary)").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  if (process.env.RESEND_API_KEY) {
    const addresses = contact.contact_emails ?? [];
    for (const address of addresses) {
      if (!address.resend_contact_id) continue;
      const { error: syncError } = await getResend().contacts.update({
        id: address.resend_contact_id,
        firstName: contact.first_name ?? undefined,
        lastName: contact.last_name ?? undefined,
      });
      if (syncError) return NextResponse.json({ contact, warning: `Saved in MYMAILMARKET; Resend sync failed for ${address.email}: ${syncError.message}` }, { status: 200 });
    }
  }
  return NextResponse.json({ contact });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const { data: contact, error: contactError } = await supabase.from("contacts")
    .select("id,email,resend_contact_id,audience_id,contact_emails(id,email,resend_contact_id,is_primary)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  if (contact.audience_id) {
    const { data: audience, error: audienceError } = await supabase.from("audiences")
      .select("resend_segment_id")
      .eq("id", contact.audience_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
    if (audience?.resend_segment_id && contact.contact_emails?.length) {
      if (!process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: "Configure RESEND_API_KEY to remove this contact from its connected audience before deletion." }, { status: 503 });
      }
      const [failure] = await removeAddressesFromSegment(audience.resend_segment_id, contact.contact_emails);
      if (failure) {
        return NextResponse.json({ error: `Could not remove ${failure.email} from its Resend Segment: ${failure.error}. The contact was not deleted.` }, { status: 502 });
      }
    }
  }

  const { error: deleteError } = await supabase.from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: activityError } = await supabase.from("activity_logs").insert({
    user_id: user.id,
    action: "contacts.deleted",
    entity_type: "contact",
    entity_id: id,
    details: { email: contact.email },
  });
  return NextResponse.json({
    deleted: true,
    warning: activityError ? `Contact deleted, but activity logging failed: ${activityError.message}` : undefined,
  });
}
