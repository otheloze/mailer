import { PageHeading } from "@/components/app-shell";
import { PerformanceChart } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { formatNumber, formatPercent } from "@/lib/utils";
import { BarChart3, CircleHelp } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function AnalyticsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Analytics" description="Connect Supabase to view campaign activity." />;
  const eventTypes = ["email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained", "contact.updated"];
  const [eventResult, ...totals] = await Promise.all([
    supabase.from("campaign_events").select("event_type,occurred_at,campaign_id").eq("user_id", user.id).order("occurred_at", { ascending: false }).range(0, 9999),
    ...eventTypes.map((type) => supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", type)),
  ]);
  const events = eventResult.data;
  const counts = new Map(eventTypes.map((type, index) => [type, totals[index]?.count ?? 0]));
  const error = eventResult.error || totals.find((item) => item.error)?.error;
  const delivered = counts.get("email.delivered") ?? 0;
  const rows = [
    { label: "Delivered", type: "email.delivered", color: "bg-[#22a476]" },
    { label: "Opens", type: "email.opened", color: "bg-[#438ad6]" },
    { label: "Clicks", type: "email.clicked", color: "bg-[#1d4ed8]" },
    { label: "Bounces", type: "email.bounced", color: "bg-[#e3755d]" },
    { label: "Complaints", type: "email.complained", color: "bg-[#d64e4e]" },
    { label: "Unsubscribes", type: "contact.updated", color: "bg-[#92928b]" },
  ];
  const chartData = groupByMonth((events ?? []).filter((item) => item.event_type === "email.delivered").map((item) => item.occurred_at));
  return <div><PageHeading eyebrow="Performance" title="Analytics" description="Engagement totals from verified Resend webhook events. Opens may be inflated or obscured by mail privacy protection." />
    {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error.message}</div>}
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#e7e5d7] bg-[#fffdf3] p-3 text-[14px] leading-5 text-[#7b7144]"><CircleHelp size={15} className="mt-0.5 shrink-0" />API accepted/sent events are separate from delivery. Delivery and engagement appear only after Resend confirms each event through the signed webhook.</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <div key={row.type} className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><div className="flex items-center gap-2 text-[14px] text-muted"><span className={`size-2 rounded-full ${row.color}`} />{row.label}</div><div className="mt-3 text-[25px] font-semibold tracking-[-.04em]">{formatNumber(counts.get(row.type) ?? 0)}</div>{row.label !== "Delivered" && <div className="mt-1 text-[13px] text-muted">{row.type === "contact.updated" ? "Resend contact unsubscribe events" : `${formatPercent(delivered ? ((counts.get(row.type) ?? 0) / delivered) * 100 : null)} of delivered`}</div>}</div>)}</div>
    <div className="mt-4 rounded-xl border border-line bg-white p-5 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><div className="mb-3"><h2 className="text-[13px] font-semibold">Delivered emails</h2><p className="mt-1 text-[14px] text-muted">Verified delivery events per month</p></div><PerformanceChart data={chartData} /></div>
    <div className="mt-4 rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><div className="flex items-center gap-2 border-b border-line px-5 py-4 dark:border-[#2a2a27]"><BarChart3 size={15} className="text-[#1d4ed8]" /><h2 className="text-[13px] font-semibold">Recent events</h2></div>
      {(events ?? []).length ? <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left"><thead className="text-[13px] uppercase text-muted"><tr><th className="px-5 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Campaign</th><th className="px-5 py-3 text-right font-medium">Time</th></tr></thead><tbody className="divide-y divide-line dark:divide-[#2a2a27]">{events?.slice(0, 20).map((event, index) => <tr key={`${event.event_type}-${event.occurred_at}-${index}`}><td className="px-5 py-3 text-[14px]">{event.event_type}</td><td className="px-4 py-3 text-[14px] text-muted">{event.campaign_id ? `Campaign ${event.campaign_id.slice(0, 8)}` : "Contact update"}</td><td className="px-5 py-3 text-right text-[14px] text-muted">{new Date(event.occurred_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="px-5 py-12 text-center text-xs text-muted">No verified events yet. Configure the Resend webhook to populate your analytics.</div>}
    </div></div>;
}
function groupByMonth(dates: string[]) {
  const buckets = new Map<string, number>(); const now = new Date();
  for (let month = 5; month >= 0; month--) { const date = new Date(now.getFullYear(), now.getMonth() - month, 1); buckets.set(date.toLocaleString("en", { month: "short" }), 0); }
  dates.forEach((value) => { const date = new Date(value); const key = date.toLocaleString("en", { month: "short" }); if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1); });
  return [...buckets].map(([date, value]) => ({ date, value }));
}
