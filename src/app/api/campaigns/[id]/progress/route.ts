import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECIPIENT_STATUSES, summarizeProgress } from "@/lib/send-progress";

export const dynamic = "force-dynamic";

/** Live per-status recipient counts for one campaign, used by the sending progress view. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: campaign, error: campaignError } = await supabase.from("campaigns")
    .select("id,status,sent_at,scheduled_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  // One head-only count per status: no rows are transferred, even for 10,000 recipients.
  const results = await Promise.all(RECIPIENT_STATUSES.map((status) =>
    supabase.from("campaign_recipients").select("id", { count: "exact", head: true })
      .eq("campaign_id", id).eq("status", status)));
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  const byStatus = Object.fromEntries(RECIPIENT_STATUSES.map((status, index) => [status, results[index].count ?? 0]));

  return NextResponse.json({
    campaignStatus: campaign.status,
    sentAt: campaign.sent_at,
    scheduledAt: campaign.scheduled_at,
    ...summarizeProgress(byStatus),
  }, { headers: { "cache-control": "no-store" } });
}
