import Link from "next/link";
import Image from "next/image";
import { ArrowDownRight, ArrowUpRight, ContactRound, MailCheck, MousePointer2, Plus, Send, UsersRound } from "lucide-react";
import { GrowthChart, PerformanceChart } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { formatNumber, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return <SetupNotice />;

  const [contacts, activeContacts, subscriberContacts, campaigns, sentCampaigns, events, deliveredEvents, openedEvents, clickedEvents, bouncedEvents, recentCampaigns, recentContacts] = await Promise.all([
    supabase.from("contacts").select("id,created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).range(0, 9999),
    supabase.from("contact_emails").select("id,contacts!inner(user_id)", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "subscribed").not("consent_at", "is", null).eq("contacts.user_id", user.id),
    supabase.from("contact_emails").select("created_at,contacts!inner(user_id)").eq("user_id", user.id).eq("status", "subscribed").not("consent_at", "is", null).eq("contacts.user_id", user.id).order("created_at", { ascending: false }).range(0, 9999),
    supabase.from("campaigns").select("id,status,sent_at", { count: "exact" }).eq("user_id", user.id),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "sent"),
    supabase.from("campaign_events").select("event_type,occurred_at,campaign_id").eq("user_id", user.id).order("occurred_at", { ascending: false }).range(0, 9999),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "email.delivered"),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "email.opened"),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "email.clicked"),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "email.bounced"),
    supabase.from("campaigns").select("id,name,subject,status,sent_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("contacts").select("id,email,first_name,last_name,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(4),
  ]);
  const failure = contacts.error || activeContacts.error || subscriberContacts.error || campaigns.error || sentCampaigns.error || events.error || deliveredEvents.error || openedEvents.error || clickedEvents.error || bouncedEvents.error || recentCampaigns.error || recentContacts.error;
  const subscriberRows = subscriberContacts.data ?? [];
  const eventRows = events.data ?? [];
  const active = activeContacts.count ?? 0;
  const sentCount = sentCampaigns.count ?? 0;
  const delivered = deliveredEvents.count ?? 0;
  const opened = openedEvents.count ?? 0;
  const clicked = clickedEvents.count ?? 0;
  const bounced = bouncedEvents.count ?? 0;
  const percent = (part: number, total: number) => total ? (part / total) * 100 : null;

  const growth = monthlyCounts(subscriberRows.map((item) => item.created_at));
  const performance = monthlyCounts(eventRows.filter((item) => item.event_type === "email.delivered").map((item) => item.occurred_at));
  const metrics = [
    { label: "Total contacts", value: formatNumber(contacts.count ?? 0), sub: `${formatNumber(active)} subscribed`, icon: ContactRound, color: "bg-[#eaf0ff] text-[#4562d1]" },
    { label: "Campaigns sent", value: formatNumber(sentCount), sub: `${formatNumber(campaigns.count ?? 0)} total campaigns`, icon: Send, color: "bg-[#f0edff] text-[#725cc9]" },
    { label: "Delivered emails", value: formatNumber(delivered), sub: `${formatNumber(bounced)} bounced`, icon: MailCheck, color: "bg-[#fbf0e5] text-[#b77742]" },
    { label: "Open rate", value: formatPercent(percent(opened, delivered)), sub: `${formatNumber(opened)} tracked opens`, icon: MousePointer2, color: "bg-[#e8f3f5] text-[#43838b]" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return <div>
    <section className="relative mb-6 min-h-[218px] overflow-hidden rounded-[26px] bg-[#16213a] shadow-[0_28px_75px_-45px_rgba(13,28,58,.55)] sm:min-h-[235px]">
      <Image
        src="/images/dashboard-team.jpg"
        alt="A team collaborating around a laptop in a bright workspace"
        fill
        sizes="(max-width: 1440px) 100vw, 1180px"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#101a31]/95 via-[#101a31]/77 to-[#101a31]/20" />
      <div className="relative flex min-h-[218px] flex-col justify-between gap-6 p-5 text-white sm:min-h-[235px] sm:flex-row sm:items-end sm:p-8">
        <div className="max-w-[620px]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[.08] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.15em] text-white/75 backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-[#9dbbff]" /> {today}
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-.055em] sm:text-[38px]">{greeting}</h1>
          <p className="mt-2 max-w-md text-[14px] leading-5 text-white/70 sm:text-[14px]">A clear view of your audience, campaigns, and what to do next.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[.08] px-4 text-[13px] font-semibold text-white backdrop-blur-md transition hover:bg-white/[.15]"><UsersRound size={14} /> Find prospects</Link>
          <Link href="/campaigns/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#1b2b4d] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#edf2ff]"><Plus size={14} /> Create campaign</Link>
        </div>
      </div>
    </section>
    {failure && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">Couldn’t load all workspace data: {failure.message}</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, sub, icon: Icon, color }, index) => <div key={label} className="card-lift rounded-2xl border border-white/80 bg-white/90 p-4 shadow-soft dark:border-[#2a3955] dark:bg-[#17233d] sm:p-5">
        <div className="flex items-center justify-between"><span className="text-[14px] text-muted">{label}</span><span className={`grid size-8 place-items-center rounded-lg ${color}`}><Icon size={16} /></span></div>
        <div className="mt-3 flex items-baseline gap-2"><span className="text-[26px] font-semibold tracking-[-.05em]">{value}</span>{index === 0 && active > 0 && <span className="inline-flex items-center text-[13px] text-[#4866cb]"><ArrowUpRight size={12} /> active</span>}</div>
        <div className="mt-1 text-[14px] text-muted">{sub}</div>
      </div>)}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <ChartCard title="Subscriber growth" subtitle="New subscribed contacts over time"><GrowthChart data={growth} /></ChartCard>
      <ChartCard title="Campaign performance" subtitle="Delivered emails over time"><PerformanceChart data={performance} /></ChartCard>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-soft dark:border-[#2a3955] dark:bg-[#17233d]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-[#2a2a27]"><div><h2 className="text-[13px] font-semibold">Recent campaigns</h2><p className="mt-0.5 text-[14px] text-muted">A look at your latest sends</p></div><Link href="/campaigns" className="text-[14px] font-medium text-[#1d4ed8]">View all</Link></div>
        {(recentCampaigns.data ?? []).length ? <div className="divide-y divide-line dark:divide-[#2a2a27]">{recentCampaigns.data?.map((campaign) => <div key={campaign.id} className="flex items-center gap-3 px-5 py-3.5"><span className="grid size-8 place-items-center rounded-lg bg-[#eaf0fb] text-[#1d4ed8] dark:bg-[#172b4d]"><Send size={14} /></span><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{campaign.name}</div><div className="truncate text-[14px] text-muted">{campaign.subject || "No subject"}</div></div><Status value={campaign.status} /></div>)}</div> : <div className="px-5 py-7 text-center text-[14px] text-muted">No campaigns yet. Your real campaign data will appear here after you create one.</div>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-soft dark:border-[#2a3955] dark:bg-[#17233d]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-[#2a2a27]"><div><h2 className="text-[13px] font-semibold">New contacts</h2><p className="mt-0.5 text-[14px] text-muted">Recently added to your audience</p></div><Link href="/contacts" className="text-[14px] font-medium text-[#1d4ed8]">View all</Link></div>
        {(recentContacts.data ?? []).length ? <div className="divide-y divide-line dark:divide-[#2a2a27]">{recentContacts.data?.map((contact) => <div key={contact.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-8 place-items-center rounded-full bg-[#f1eee8] text-[13px] font-semibold text-[#726a58]">{(contact.first_name?.[0] ?? contact.email[0]).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email}</div><div className="truncate text-[14px] text-muted">{contact.email}</div></div><Status value={contact.status} /></div>)}</div> : <div className="px-5 py-7 text-center text-[14px] text-muted">Contacts you add will appear here.</div>}
      </div>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <QuickMetric icon={UsersRound} label="Active subscribers" value={formatNumber(active)} />
      <QuickMetric icon={ArrowUpRight} label="Click rate" value={formatPercent(percent(clicked, delivered))} />
      <QuickMetric icon={ArrowDownRight} label="Bounce rate" value={formatPercent(percent(bounced, delivered + bounced))} />
    </div>
  </div>;
}

function monthlyCounts(dates: string[]) {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let month = 5; month >= 0; month--) {
    const date = new Date(now.getFullYear(), now.getMonth() - month, 1);
    buckets.set(date.toLocaleString("en", { month: "short" }), 0);
  }
  dates.forEach((value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toLocaleString("en", { month: "short" });
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  });
  return [...buckets].map(([date, value]) => ({ date, value }));
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="card-lift rounded-2xl border border-white/80 bg-white/90 px-4 pt-4 shadow-soft dark:border-[#2a3955] dark:bg-[#17233d] sm:px-5"><div><h2 className="text-[13px] font-semibold">{title}</h2><p className="mt-0.5 text-[14px] text-muted">{subtitle}</p></div><div className="mt-3">{children}</div></div>;
}
function QuickMetric({ icon: Icon, label, value }: { icon: typeof MailCheck; label: string; value: string }) {
  return <div className="card-lift flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3.5 shadow-soft dark:border-[#2a3955] dark:bg-[#17233d]"><span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#eef2ff] to-[#e0e9ff] text-[#526dd0] dark:from-[#263d68] dark:to-[#1d3157]"><Icon size={15} /></span><div className="flex-1 text-[14px] text-muted">{label}</div><div className="text-[15px] font-semibold">{value}</div></div>;
}
function Status({ value }: { value: string }) {
  const style = value === "sent" || value === "subscribed" ? "bg-[#eaf0ff] text-[#4562d1]" : value === "scheduled" ? "bg-[#f0edff] text-[#725cc9]" : value === "failed" || value === "bounced" || value === "complained" ? "bg-[#fff0ef] text-[#c35a52]" : "bg-[#edf0f5] text-[#65718a]";
  return <span className={`rounded-full px-2 py-1 text-[13px] capitalize ${style}`}>{value}</span>;
}
function SetupNotice() {
  return <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-line bg-white p-8 text-center shadow-soft"><h1 className="text-xl font-semibold">Connect your workspace</h1><p className="mt-2 text-sm leading-6 text-muted">Add your Supabase project credentials to enable sign-in and load live campaign and contact data.</p><Link className="mt-5 inline-flex rounded-lg bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white" href="/settings">Open setup</Link></div>;
}
