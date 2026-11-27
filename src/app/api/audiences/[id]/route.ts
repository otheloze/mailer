import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeSegment } from "@/lib/segments";

const schema = z.object({ deleteContacts: z.boolean().optional().default(false) });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Audience not found." }, { status: 404 });
  const { data: audience, error: audienceError } = await supabase.from("audiences")
    .select("id,name,resend_segment_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
  if (!audience) return NextResponse.json({ error: "Audience not found." }, { status: 404 });

  const { data: busyCampaign, error: campaignError } = await supabase.from("campaigns")
    .select("name,status").eq("user_id", user.id).eq("audience_id", id).in("status", ["scheduled", "sending"]).limit(1).maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (busyCampaign) {
    return NextResponse.json({ error: `Campaign "${busyCampaign.name}" is ${busyCampaign.status} to this audience. Cancel it or let it finish before deleting the audience.` }, { status: 409 });
  }

  if (audience.resend_segment_id) {
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Configure RESEND_API_KEY to delete the connected Resend Segment." }, { status: 503 });
    const segmentError = await removeSegment(audience.resend_segment_id);
    if (segmentError) return NextResponse.json({ error: `Resend could not delete the Segment: ${segmentError}. The audience was not deleted.` }, { status: 502 });
  }

  let deletedContacts = 0;
  if (input.data.deleteContacts) {
    const { error: contactsError, count } = await supabase.from("contacts")
      .delete({ count: "exact" }).eq("user_id", user.id).eq("audience_id", id);
    if (contactsError) return NextResponse.json({ error: `Could not delete this audience's contacts: ${contactsError.message}` }, { status: 500 });
    deletedContacts = count ?? 0;
  }

  const { error: deleteError } = await supabase.from("audiences").delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await supabase.from("activity_logs").insert({
    user_id: user.id, action: "audiences.deleted", entity_type: "audience", entity_id: id,
    details: { name: audience.name, deleted_contacts: deletedContacts },
  });
  return NextResponse.json({ deleted: true, deletedContacts });
}
