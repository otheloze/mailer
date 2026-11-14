import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Globe2,
  Mail,
  Search,
  Server,
  ShieldCheck,
  Target,
} from "lucide-react";
import { DomainSearchPreview } from "@/components/domain-search-preview";
import { HomePackagePricing } from "@/components/home-package-pricing";
import { SubscribeForm } from "@/components/subscribe-form";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionPackage } from "@/components/package-pricing-cards";

const products = [
  {
    id: "leads",
    number: "01",
    icon: Target,
    title: "Find the right people",
    description: "Discover companies, find business email addresses, and verify prospects before they reach your pipeline.",
    features: ["Company discovery", "Domain email search", "Email verification"],
    href: "/leads",
    cta: "Explore lead discovery",
    color: "bg-[#eaf2fd] text-[#1d4ed8]",
  },
  {
    id: "marketing",
    number: "02",
    icon: Mail,
    title: "Send with confidence",
    description: "Build thoughtful campaigns, manage audiences, and understand delivery from one focused workspace.",
    features: ["Visual campaign editor", "Audience management", "Delivery analytics"],
    href: "/login",
    cta: "Explore email marketing",
    color: "bg-[#eaf0fb] text-[#294b7a]",
  },
  {
    id: "hosting",
    number: "03",
    icon: Server,
    title: "Give your business a home",
    description: "A clear path from a first website to a more capable hosting plan as your business grows.",
    features: ["Simple plan choices", "Room to grow", "Help when you need it"],
    href: "https://my.mymailmarket.com/client/store",
    cta: "Browse hosting plans",
    color: "bg-[#edf2f7] text-[#334155]",
  },
  {
    id: "domains",
    number: "04",
    icon: Globe2,
    title: "Claim your corner of the web",
    description: "Find a memorable domain for your brand, then keep renewals and domain details together.",
    features: ["Truehost availability search", "USD and NGN quotes", "30% service markup"],
    href: "/domains/buy",
    cta: "Search domains",
    color: "bg-[#e7eef8] text-[#294b7a]",
  },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { packages, loadError } = await loadHomePackages();
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] text-[#101828]">
      <SiteHeader />

      <section className="relative mx-auto grid max-w-[1320px] items-center gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 md:grid-cols-[.9fr_1.1fr] md:gap-10 md:pb-24 md:pt-20 lg:px-10">
        <div className="pointer-events-none absolute -left-48 top-10 size-[520px] rounded-full bg-[#dfe8ff]/80 blur-3xl" />
        <div className="enter-up relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce4f4] bg-white/85 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.14em] text-[#334c88] shadow-sm">
            <span className="size-1.5 rounded-full bg-[#6489f4]" /> Tools for your next stage
          </div>
          <h1 className="max-w-[680px] text-[clamp(3rem,6.4vw,5.75rem)] font-semibold leading-[.96] tracking-[-.085em] text-[#111c34]">
            Find customers.<br />Build your <span className="relative inline-block">corner online.<span className="absolute -bottom-0.5 left-0 -z-0 h-[.17em] w-full -rotate-2 rounded-full bg-gradient-to-r from-[#658ef5] to-[#a7c7ff]" /></span>
          </h1>
          <p className="mt-6 max-w-[500px] text-[14px] leading-7 text-[#65718a] sm:text-[16px]">
            Discover business leads, send better email, and get the hosting and domains to bring your business online—all in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/pricing" className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#172746] to-[#263d70] px-6 text-[14px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(17,35,75,.7)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-15px_rgba(17,35,75,.5)]">
              View packages <ArrowRight size={15} />
            </Link>
            <Link href="/products" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dce3ee] bg-white/80 px-6 text-[14px] font-semibold text-[#33415f] shadow-sm transition hover:border-[#b8c8e8] hover:bg-white">
              Explore our products <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-medium text-[#68758e]">
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-[#5876db]" /> Leads and email tools</span>
            <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-[#5876db]" /> Hosting and domains</span>
          </div>
        </div>

        <div className="enter-up-delay relative mx-auto w-full max-w-[620px] md:justify-self-end">
          <div className="absolute -right-8 -top-8 size-40 rounded-full bg-[#b7cbff]/60 blur-3xl sm:size-56" />
          <div className="absolute -bottom-8 -left-8 size-40 rounded-full bg-[#d8b8aa]/35 blur-3xl" />
          <div className="image-zoom relative aspect-[1.08] overflow-hidden rounded-[28px] border border-white/80 bg-[#26395f] shadow-[0_38px_100px_-42px_rgba(19,35,74,.45)] sm:aspect-[1.14] sm:rounded-[34px]">
            <Image
              src="/images/team-workspace.jpg"
              alt="A diverse team of professionals collaborating around a laptop in a bright modern office"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101a31]/90 via-[#101a31]/10 to-[#101a31]/5" />
            <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-6 sm:right-6 sm:top-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#111b32]/35 px-3 py-2 text-[12px] font-semibold text-white backdrop-blur-md">
                <span className="size-1.5 rounded-full bg-[#9bb8ff]" /> The modern growth toolkit
              </span>
              <span className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur-md"><ArrowUpRight size={16} /></span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
              <div className="max-w-[410px] rounded-[20px] border border-white/20 bg-[#111a2e]/65 p-4 text-white shadow-2xl backdrop-blur-xl sm:p-5">
                <div className="text-[12px] font-semibold uppercase tracking-[.18em] text-[#bdcdf8]">A better way to grow</div>
                <h2 className="mt-2 text-[20px] font-semibold leading-tight tracking-[-.04em] sm:text-[25px]">From first prospect to lasting customer.</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Discover", "Connect", "Grow"].map((item) => <span key={item} className="rounded-full border border-white/15 bg-white/[.08] px-2.5 py-1 text-[11px] font-medium text-white/85">{item}</span>)}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-4 right-3 hidden items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-[0_20px_40px_-24px_rgba(15,35,75,.35)] sm:flex">
            <span className="grid size-9 place-items-center rounded-xl bg-[#e9efff] text-[#4c68c9]"><ShieldCheck size={17} /></span>
            <div><div className="text-[13px] font-semibold text-[#182544]">Built for better business</div><div className="mt-0.5 text-[11px] text-[#77829a]">Leads · marketing · domains</div></div>
          </div>
        </div>
      </section>

      <HostingSection packages={packages} loadError={loadError} />

      <section id="leads" className="scroll-mt-24 bg-[#0b1220] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-8 md:grid-cols-[.95fr_1.05fr] md:items-center md:gap-16 md:py-24 lg:px-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.14em] text-white/65"><Target size={12} className="text-[#3b82f6]" /> Lead generation</span>
            <h2 className="mt-5 max-w-xl text-[38px] font-semibold leading-[1.02] tracking-[-.07em] sm:text-[52px]">Build a better list before you send.</h2>
            <p className="mt-4 max-w-md text-[14px] leading-6 text-white/60">Find companies that fit, search business domains for contacts, and check email status in your prospecting workspace.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/lead-data" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1d4ed8] px-5 text-[14px] font-semibold text-white transition hover:bg-[#1e40af]">Buy verified lead data <ArrowRight size={14} /></Link>
              <Link href="/leads" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-[14px] font-semibold text-white transition hover:bg-white/10">Open lead discovery</Link>
            </div>
            <p className="mt-3 text-[12px] leading-4 text-white/40">Sign in required. Prospect records are separate from subscribed marketing contacts.</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-[#17243d] p-4 shadow-[0_30px_90px_-56px_rgba(0,0,0,.8)] sm:p-5">
            <div className="image-zoom relative mb-4 h-[190px] overflow-hidden rounded-[19px] sm:h-[220px]">
              <Image
                src="/images/team-meeting.jpg"
                alt="Colleagues discussing ideas together around a laptop"
                fill
                sizes="(max-width: 768px) 100vw, 45vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#101a31]/85 via-[#101a31]/10 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <div><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-white/65">Prospecting, with purpose</div><div className="mt-1 text-[16px] font-semibold text-white">Find your next conversation.</div></div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/15 text-white backdrop-blur-md"><Target size={16} /></span>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="text-[14px] font-semibold">Prospecting workflow</div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[.12em] text-white/55">Workspace preview</span></div>
            <div className="mt-5 space-y-3">
              {[["01", "Describe the companies you want", "Discover relevant businesses by industry, size, and location."], ["02", "Search a company domain", "Find business contacts associated with a selected domain."], ["03", "Verify and organize", "Review email status and keep prospect lists organized."]].map(([number, title, detail]) => (
                <div key={number} className="flex gap-3 rounded-xl bg-black/10 p-3.5 sm:p-4"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[12px] font-semibold text-[#bfdbfe]">{number}</span><div><div className="text-[14px] font-medium">{title}</div><div className="mt-1 text-[12px] leading-4 text-white/50">{detail}</div></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="marketing" className="scroll-mt-24 bg-[#e8edf4]">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center md:gap-16 md:py-24 lg:px-10">
          <div className="order-2 rounded-[26px] border border-white bg-white p-4 shadow-[0_28px_70px_-46px_rgba(25,39,76,.28)] sm:p-5 md:order-1">
            <div className="image-zoom relative h-[185px] overflow-hidden rounded-[19px] sm:h-[220px]">
              <Image
                src="/images/team-collaboration.jpg"
                alt="Business professionals reviewing their work together at a laptop"
                fill
                sizes="(max-width: 768px) 100vw, 45vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111b32]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 text-white"><div className="text-[11px] font-semibold uppercase tracking-[.16em] text-white/70">Thoughtful communication</div><div className="mt-1 text-[16px] font-semibold">Every campaign, on brand.</div></div>
            </div>
            <div className="flex items-center justify-between border-b border-[#e8edf4] pb-4"><span className="text-[14px] font-semibold">Campaign workspace</span><span className="rounded-full bg-[#eaf0fb] px-2.5 py-1 text-[11px] font-medium text-[#1e40af]">PREVIEW</span></div>
            <div className="mt-5 rounded-xl bg-[#f4f6fa] p-4">
              <div className="flex items-center justify-between"><span className="text-[12px] text-[#64748b]">Campaign setup</span><span className="text-[12px] text-[#64748b]">Draft</span></div>
              <div className="mt-3 h-2 w-3/4 rounded-full bg-[#d9e4f2]" /><div className="mt-2 h-2 w-1/2 rounded-full bg-[#e8edf4]" />
              <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-md bg-white px-2.5 py-1.5 text-[12px] text-[#475569]">Audience</span><span className="rounded-md bg-white px-2.5 py-1.5 text-[12px] text-[#475569]">Email design</span><span className="rounded-md bg-white px-2.5 py-1.5 text-[12px] text-[#475569]">Delivery</span></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">{["Build", "Send", "Measure"].map((item) => <div key={item} className="rounded-xl border border-[#e6eaf2] bg-[#fbfcfe] px-2 py-2.5 text-center text-[12px] font-medium text-[#53627e]">{item}</div>)}</div>
          </div>
          <div className="order-1 md:order-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d9e1d3] bg-white/70 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.14em] text-[#1e3a5f]"><Mail size={12} /> Email marketing</span>
            <h2 className="mt-5 max-w-xl text-[38px] font-semibold leading-[1.02] tracking-[-.07em] sm:text-[52px]">Campaigns that feel personal. Results you can understand.</h2>
            <p className="mt-4 max-w-md text-[14px] leading-6 text-[#64748b]">Create email campaigns, manage opted-in audiences, and follow delivery and engagement in your MYMAILMARKET workspace.</p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {["Drag-and-drop email editor", "Resend-powered delivery", "Audience and consent tools", "Campaign event analytics"].map((feature) => <div key={feature} className="flex items-center gap-2 text-[13px] text-[#475569]"><Check size={13} className="text-[#2563eb]" />{feature}</div>)}
            </div>
            <Link href="/login" className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#102a43] px-5 text-[14px] font-semibold text-white transition hover:bg-[#173b66]">Open your workspace <ArrowRight size={14} /></Link>
          </div>
        </div>
      </section>

      <ProductsSection />

      <section className="bg-white">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 sm:px-8 md:grid-cols-[1fr_auto] md:items-center md:py-20 lg:px-10">
          <div><p className="text-[13px] font-semibold uppercase tracking-[.16em] text-[#1d4ed8]">Combined packages</p><h2 className="mt-3 max-w-[600px] text-[34px] font-semibold leading-[1.04] tracking-[-.065em] sm:text-[44px]">One purchase. Both growth tools.</h2><p className="mt-3 max-w-lg text-[14px] leading-5 text-[#64748b]">Compare email-sending and verified-discovery credits, choose a package, and pay securely with PayPal or Paystack.</p></div>
          <div className="flex flex-wrap gap-3"><Link href="/pricing" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#102a43] px-5 text-[14px] font-semibold text-white transition hover:bg-[#173b66]">View packages and pricing <ArrowRight size={14} /></Link><Link href="/products" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d8e1eb] px-5 text-[14px] font-semibold text-[#334155] transition hover:bg-[#f4f6fa]">Browse products <ArrowRight size={13} /></Link></div>
        </div>
      </section>

      <section id="mailbox-membership" className="border-t border-[#e2e8f0] bg-[#f4f6fa]">
        <div className="mx-auto grid max-w-[1320px] gap-5 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-center lg:px-10">
          <div><p className="text-[12px] font-semibold uppercase tracking-[.15em] text-[#64748b]">Also available</p><h2 className="mt-2 text-[18px] font-semibold tracking-[-.04em]">MYMAILMARKET mailbox membership</h2><p className="mt-1 text-[13px] text-[#64748b]">A separate $5/month mailbox subscription, billed securely through Stripe.</p></div>
          <div className="w-full max-w-[400px]"><SubscribeForm /></div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

async function loadHomePackages(): Promise<{ packages: SubscriptionPackage[]; loadError?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("subscription_packages")
      .select("id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,duration_days,rollover_policy")
      .eq("enabled", true).order("price_cents")
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw error;
    return { packages: data ?? [] };
  } catch (reason) {
    console.error("Could not load homepage package pricing:", reason instanceof Error ? reason.message : "Database error.");
    return { packages: [], loadError: "Package pricing is temporarily unavailable. Please try again later." };
  }
}

function HostingSection({ packages, loadError }: { packages: SubscriptionPackage[]; loadError?: string }) {
  return (
    <section id="hosting" className="scroll-mt-24 border-y border-[#e4e9f1] bg-white">
      <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-8 md:py-20 lg:px-10">
        <div className="mx-auto max-w-[650px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#edf2f7] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.14em] text-[#334155]"><Globe2 size={14} /> Domains &amp; web hosting</span>
          <h2 className="mt-4 text-[36px] font-semibold leading-[1.04] tracking-[-.065em] sm:text-[48px]">Find your domain. Launch with web hosting.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-5 text-[#64748b]">Search popular domain extensions, compare live quotes, and find hosting for your website—all in one place.</p>
        </div>
        <div id="domain-search" className="mt-8 grid scroll-mt-28 gap-5 rounded-[26px] bg-gradient-to-br from-[#111b32] via-[#172849] to-[#263d70] p-5 text-white shadow-[0_28px_75px_-45px_rgba(13,28,58,.55)] sm:p-7 md:grid-cols-[.85fr_1.15fr] md:items-center">
          <div className="px-1 py-2 sm:px-2">
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.14em] text-[#b9ccff]"><Globe2 size={15} /> Domains for your business</span>
            <h3 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-.045em] sm:text-[32px]">Find a .com, .net, .org or .co.uk.</h3>
            <p className="mt-2 text-[14px] leading-6 text-white/75">Search available names and compare estimated registration quotes, then explore hosting and growth options below.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[".com", ".net", ".org", ".co.uk"].map((extension) => <span key={extension} className="rounded-full border border-white/20 bg-white/[.08] px-3 py-1.5 text-[13px] font-semibold text-white">{extension}</span>)}
            </div>
            <a href="https://my.mymailmarket.com/client/store" target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#172849] transition hover:-translate-y-0.5 hover:bg-[#edf2ff]">Browse web hosting <ArrowUpRight size={14} /></a>
          </div>
          <div className="rounded-[20px] border border-white/80 bg-white p-4 text-[#17233d] shadow-[0_20px_55px_-42px_rgba(0,0,0,.4)] sm:p-5">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#eaf0fb] text-[#1d4ed8]"><Search size={19} /></span><div><div className="text-[18px] font-semibold tracking-[-.02em] sm:text-[20px]">Search domain availability</div><div className="mt-0.5 text-[14px] text-[#64748b]">Check a name before choosing your hosting plan</div></div></div>
            <DomainSearchPreview />
            <p className="mt-3 text-[12px] leading-5 text-[#64748b]">Live availability and pricing from Truehost; registration checkout is not enabled yet. Quotes include a 30% service markup and may change.</p>
          </div>
        </div>
        <HomePackagePricing packages={packages} loadError={loadError} />
      </div>
    </section>
  );
}

function ProductsSection() {
  return (
    <section id="products" className="border-y border-[#e4e9f1] bg-white">
      <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-8 md:py-20 lg:px-10">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="text-[13px] font-semibold uppercase tracking-[.16em] text-[#1d4ed8]">One connected toolkit</p><h2 className="mt-3 max-w-[600px] text-[35px] font-semibold leading-[1.04] tracking-[-.065em] sm:text-[48px]">The essentials for growing online.</h2></div>
          <div className="max-w-[330px]"><p className="text-[14px] leading-5 text-[#64748b]">Start with the tool you need today. Add more when your business is ready.</p><Link href="/products" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1e40af] hover:text-[#102a43]">View all products <ArrowRight size={13} /></Link></div>
        </div>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {products.map(({ id, number, icon: Icon, title, description, features, href, cta, color }) => (
            <article key={id} id={`product-card-${id}`} className="card-lift scroll-mt-28 flex min-h-[310px] flex-col rounded-[22px] border border-[#e7ebf3] bg-gradient-to-br from-white to-[#f8faff] p-5 sm:p-6">
              <div className="flex items-center justify-between"><span className={`grid size-10 place-items-center rounded-xl ${color}`}><Icon size={18} /></span><span className="text-[13px] font-medium text-[#94a3b8]">{number}</span></div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-.035em]">{title}</h3>
              <p className="mt-2 text-[14px] leading-[1.7] text-[#64748b]">{description}</p>
              <ul className="mt-4 space-y-2">{features.map((feature) => <li key={feature} className="flex items-center gap-2 text-[13px] text-[#475569]"><Check size={12} className="shrink-0 text-[#2563eb]" />{feature}</li>)}</ul>
              {href.startsWith("http")
                ? <a href={href} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13px] font-semibold text-[#1e40af] hover:text-[#102a43]">{cta}<ArrowUpRight size={13} /></a>
                : <Link href={href} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13px] font-semibold text-[#1e40af] hover:text-[#102a43]">{cta}<ArrowRight size={13} /></Link>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
