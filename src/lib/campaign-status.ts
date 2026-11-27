import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { withResendRetry } from "@/lib/segments";

type BusyCampaign = { id: string; name: string; status: string; resend_broadcast_id: string | null };

/**
 * A campaign stays "sending" until Resend's webhooks report every recipient. When those
 * webhooks were missed (for example while the webhook secret was wrong), the campaign is
 * stuck even though Resend finished long ago. This asks Resend about each "sending"
 * campaign, marks the finished ones sent, and returns only the campaigns still in progress.
 */
export async function settleFinishedCampaigns(userId: string, campaigns: BusyCampaign[]): Promise<BusyCampaign[]> {
  if (!process.env.RESEND_API_KEY) return campaigns;
  const stillBusy: BusyCampaign[] = [];
  for (const campaign of campaigns) {
    if (campaign.status !== "sending" || !campaign.resend_broadcast_id) { stillBusy.push(campaign); continue; }
    const { data, error } = await withResendRetry(() => getResend().broadcasts.get(campaign.resend_broadcast_id!));
    if (error || data?.status !== "sent") { stillBusy.push(campaign); continue; }
    const sentAt = data.sent_at && !Number.isNaN(Date.parse(data.sent_at)) ? new Date(data.sent_at).toISOString() : new Date().toISOString();
    // Delivery state is server-managed (clients cannot write campaign status).
    const { error: updateError } = await createAdminClient().from("campaigns")
      .update({ status: "sent", sent_at: sentAt, updated_at: new Date().toISOString() })
      .eq("id", campaign.id).eq("user_id", userId).eq("status", "sending");
    if (updateError) stillBusy.push(campaign);
  }
  return stillBusy;
}
