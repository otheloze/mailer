import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { refundSettledCredits } from "@/lib/credits";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const { data: campaign, error } = await supabase.from("campaigns").select("status,resend_broadcast_id,credit_reservation_key").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.status !== "scheduled" || !campaign.resend_broadcast_id) return NextResponse.json({ error: "Only scheduled campaigns can be canceled." }, { status: 409 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Configure RESEND_API_KEY before canceling." }, { status: 503 });
  const { error: resendError } = await getResend().broadcasts.cancel(campaign.resend_broadcast_id);
  if (resendError) return NextResponse.json({ error: resendError.message }, { status: 502 });

  // Delivery state is server-managed (clients cannot write campaign status).
  const admin = createAdminClient();
  const { data: canceled, error: updateError } = await admin.from("campaigns")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).eq("status", "scheduled")
    .select("id").maybeSingle();
  if (updateError) return NextResponse.json({ error: `Resend canceled the broadcast, but local state could not be saved: ${updateError.message}` }, { status: 500 });
  if (!canceled) return NextResponse.json({ error: "The campaign changed while it was being canceled. Refresh and check its status." }, { status: 409 });
  const { error: jobError } = await admin.from("scheduled_jobs").update({ status: "canceled" }).eq("campaign_id", id).eq("user_id", user.id);
  if (jobError) return NextResponse.json({ error: `Resend canceled the broadcast, but local schedule tracking failed: ${jobError.message}` }, { status: 500 });
  if (campaign.credit_reservation_key) {
    const refundError = await refundSettledCredits(
      user.id,
      campaign.credit_reservation_key,
      `scheduled-cancel:${id}:${campaign.credit_reservation_key}`,
      "Scheduled campaign canceled before delivery.",
    );
    if (refundError) return NextResponse.json({ error: `Resend canceled the broadcast, but reserved credits could not be refunded: ${refundError}` }, { status: 500 });
  }
  return NextResponse.json({ canceled: true });
}
