import Link from "next/link";
import { CalendarClock, CheckCircle2, FileText, LayoutTemplate, PenSquare, Send } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const primaryButton = "inline-flex h-10 items-center gap-2 rounded-xl bg-[#1d4ed8] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#1e40af]";
const secondaryButton = "inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink transition hover:bg-[#f7f9fc] dark:border-[#30302d] dark:bg-[#17233d] dark:text-white";

export default async function CampaignsPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <PageHeading title="Campaigns" description="Connect Supabase to manage campaigns." />;
  const { data: campaigns, error } = await supabase.from("campaigns").select("id,name,subject,status,scheduled_at,sent_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const list = campaigns ?? [];
  const counts = {
    draft: list.filter((item) => item.status === "draft").length,
    scheduled: list.filter((item) => item.status === "scheduled" || item.status === "sending").length,
    sent: list.filter((item) => item.status === "sent").length,
  };

  const actions = <div className="flex flex-wrap gap-2">
    <Link href="/campaigns/new" className={secondaryButton}><LayoutTemplate size={15} /> Design campaign</Link>
    <Link href="/campaigns/compose" className={primaryButton}><PenSquare size={15} /> Compose</Link>
  </div>;

  return <div>
    <PageHeading eyebrow="Email marketing" title="Campaigns" description="Write a quick message or design a full campaign, then send it to a consented audience." action={actions} />
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error.message}</div>}

    {list.length ? <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat icon={<FileText size={16} />} label="Drafts" value={counts.draft} tone="bg-[#f3f4f6] text-[#4b5563]" />
        <Stat icon={<CalendarClock size={16} />} label="Scheduled / sending" value={counts.scheduled} tone="bg-[#eef2ff] text-[#4f46e5]" />
        <Stat icon={<CheckCircle2 size={16} />} label="Sent" value={counts.sent} tone="bg-[#ecfdf5] text-[#047857]" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft dark:border-[#2a3550] dark:bg-[#17233d]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="bg-[#f8fafc] text-[12px] uppercase tracking-[.08em] text-[#8a94a6] dark:bg-[#131d33]">
              <tr><th className="px-5 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Scheduled / sent</th><th className="px-5 py-3 text-right font-medium">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-[#2a3550]">
              {list.map((campaign) => <tr key={campaign.id} className="transition hover:bg-[#f8fafc] dark:hover:bg-[#1b2742]">
                <td className="px-5 py-3.5"><Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#3554c8] dark:bg-[#263d68] dark:text-[#bcd0ff]"><Send size={15} /></span>
                  <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{campaign.name}</span><span className="mt-0.5 block truncate text-[13px] text-muted">{campaign.subject || "No subject line"}</span></span>
                </Link></td>
                <td className="px-4 py-3"><Status value={campaign.status} /></td>
                <td className="px-4 py-3 text-[13px] text-muted">{campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : "—"}</td>
                <td className="px-5 py-3 text-right text-[13px] text-muted">{new Date(campaign.created_at).toLocaleDateString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </> : <EmptyState icon="campaign" title="Send your first email" description="Compose a message like regular email, or design a campaign with images and buttons. It goes to a consented audience through Resend." action={<div className="flex flex-wrap justify-center gap-2"><Link href="/campaigns/compose" className={primaryButton}><PenSquare size={15} /> Compose</Link><Link href="/campaigns/new" className={secondaryButton}><LayoutTemplate size={15} /> Design campaign</Link></div>} />}
  </div>;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft dark:border-[#2a3550] dark:bg-[#17233d]">
    <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>{icon}</span>
    <div><div className="text-[22px] font-semibold leading-none tracking-[-.03em]">{value}</div><div className="mt-1 text-[13px] text-muted">{label}</div></div>
  </div>;
}

function Status({ value }: { value: string }) {
  const color = value === "sent" ? "bg-[#ecfdf5] text-[#047857]" : value === "scheduled" || value === "sending" ? "bg-[#eef2ff] text-[#4f46e5]" : value === "failed" ? "bg-[#fef2f2] text-[#b91c1c]" : value === "canceled" ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#f3f4f6] text-[#4b5563]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium capitalize ${color}`}>{value}</span>;
}
