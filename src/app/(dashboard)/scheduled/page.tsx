import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeading, EmptyState } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { CancelScheduledButton } from "@/components/scheduled-actions";

export const dynamic = "force-dynamic";
export default async function ScheduledPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Scheduled campaigns" description="Connect Supabase to manage schedules." />;
  const [campaigns, profile] = await Promise.all([
    supabase.from("campaigns").select("id,name,subject,scheduled_at,status,resend_broadcast_id").eq("user_id", user.id).eq("status", "scheduled").order("scheduled_at"),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
  ]);
  const data = campaigns.data;
  const error = campaigns.error || profile.error;
  const timeZone = profile.data?.timezone || "UTC";
  return <div><PageHeading eyebrow="Delivery" title="Scheduled campaigns" description="Resend handles scheduled delivery server-side—no browser timers required." />
    {error && <div role="alert" className="mb-4 text-xs text-red-700">{error.message}</div>}
    {(data ?? []).length ? <div className="space-y-2">{data?.map((campaign) => <div key={campaign.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><span className="grid size-9 place-items-center rounded-lg bg-[#eff2ff] text-[#5764bf]"><CalendarClock size={17} /></span><div className="min-w-[180px] flex-1"><Link href={`/campaigns/${campaign.id}`} className="text-[14px] font-semibold hover:text-[#1d4ed8]">{campaign.name}</Link><div className="mt-0.5 text-[14px] text-muted">{campaign.subject} · {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }) : "Schedule pending"} ({timeZone})</div></div><Link href={`/campaigns/${campaign.id}`} className="rounded-lg border border-line px-3 py-2 text-[14px] font-medium dark:border-[#30302d]">Edit / reschedule</Link><CancelScheduledButton id={campaign.id} /></div>)}</div> : <EmptyState icon="scheduled" title="Nothing on the calendar" description="Schedule a campaign for a future date and Resend will deliver it on time." />}
  </div>;
}
