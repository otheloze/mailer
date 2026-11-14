import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, Globe2, Inbox, Mail, Search, Server, type LucideIcon } from "lucide-react";
import { HOSTING_STORE_URL, SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Products and services | MYMAILMARKET",
  description: "Email marketing, verified email discovery, lead data, web hosting, domains and mailbox membership from MYMAILMARKET.",
};

type Service = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  price: string;
  primary: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string };
  tone: string;
};

const services: Service[] = [
  {
    id: "email-marketing",
    icon: Mail,
    eyebrow: "Email marketing",
    title: "Send campaigns your audience wants to read.",
    description: "Write a quick message like regular email or design a full campaign, then send it to your opted-in audiences and follow delivery, opens and clicks.",
    features: ["Webmail-style compose and visual designer", "Audiences, contacts and CSV import", "Scheduling and delivery analytics", "Automatic unsubscribe and compliance footer"],
    price: "From $5 per package",
    primary: { label: "See email packages", href: "/pricing" },
    secondary: { label: "Sign in to your workspace", href: "/login" },
    tone: "bg-[#eef3ff] text-[#1d4ed8]",
  },
  {
    id: "email-discovery",
    icon: Search,
    eyebrow: "Email discovery",
    title: "Find and verify business contacts yourself.",
    description: "Search for companies that fit your market, look up the business email addresses on their domain, and verify each one before you reach out.",
    features: ["Natural-language company discovery", "Domain email search", "Individual email verification", "Included in every email package"],
    price: "Included with email packages",
    primary: { label: "See email packages", href: "/pricing" },
    secondary: { label: "Open prospecting", href: "/leads" },
    tone: "bg-[#ecfdf5] text-[#047857]",
  },
  {
    id: "lead-data",
    icon: BadgeCheck,
    eyebrow: "Verified lead data",
    title: "Ready-made lists of verified email leads.",
    description: "Skip the research. Tell us who you want to reach and receive a verified lead file in packages from 10,000 to 100,000 contacts.",
    features: ["10,000 to 100,000 verified leads", "Targeted to your industry and location", "Delivered as a CSV file", "Pay with PayPal (USD) or Paystack (NGN)"],
    price: "10,000 leads from $5 / ₦6,000",
    primary: { label: "Buy lead data", href: "/lead-data" },
    tone: "bg-[#fff7ed] text-[#c2410c]",
  },
  {
    id: "hosting",
    icon: Server,
    eyebrow: "Web hosting",
    title: "A reliable home for your website.",
    description: "Choose a hosting plan that fits today and upgrade as your business grows, with help when you need it.",
    features: ["Plans for first sites and growing businesses", "Easy upgrades", "Managed in our client area"],
    price: "See plans in the store",
    primary: { label: "Browse hosting plans", href: HOSTING_STORE_URL, external: true },
    tone: "bg-[#f1f5f9] text-[#334155]",
  },
  {
    id: "domains",
    icon: Globe2,
    eyebrow: "Domains",
    title: "Claim the right name for your brand.",
    description: "Search popular extensions like .com, .net, .org and .co.uk and compare live quotes in USD and NGN.",
    features: ["Live availability search", "USD and NGN quotes", "Popular extensions"],
    price: "Live quotes",
    primary: { label: "Search domains", href: "/domains/buy" },
    tone: "bg-[#e7eef8] text-[#294b7a]",
  },
  {
    id: "mailbox",
    icon: Inbox,
    eyebrow: "Mailbox membership",
    title: "A MYMAILMARKET mailbox subscription.",
    description: "A separate monthly mailbox membership, billed securely by card.",
    features: ["$5 per month", "Billed monthly through Stripe"],
    price: "$5 / month",
    primary: { label: "Join the mailbox membership", href: "/#mailbox-membership" },
    tone: "bg-[#f5f3ff] text-[#6d28d9]",
  },
];

export default function ProductsPage() {
  return <div className="min-h-screen bg-[#f4f6fa] text-[#101828]">
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-[1180px] px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
        <div className="relative overflow-hidden rounded-[28px] bg-[#182746] shadow-[0_30px_90px_-48px_rgba(15,35,75,.48)]">
          <Image src="/images/team-workspace.jpg" alt="A team working together in a modern office" fill priority sizes="(max-width: 1180px) 100vw, 1120px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101a31]/95 via-[#101a31]/80 to-[#101a31]/30" />
          <div className="relative p-7 text-white sm:p-10">
            <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-[#c7d6ff]">Products and services</p>
            <h1 className="mt-3 max-w-[640px] text-[clamp(2rem,4.4vw,3.3rem)] font-semibold leading-[1.04] tracking-[-.06em]">Everything your business needs to grow online.</h1>
            <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-white/75">Find leads, send email that lands, and get your website and domain online, all from one provider.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {services.map((service) => <a key={service.id} href={`#${service.id}`} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium backdrop-blur transition hover:bg-white/20">{service.eyebrow}</a>)}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-4 px-5 pb-16 sm:px-8 md:grid-cols-2">
        {services.map(({ id, icon: Icon, eyebrow, title, description, features, price, primary, secondary, tone }) => (
          <article key={id} id={id} className="card-lift flex scroll-mt-28 flex-col rounded-[24px] border border-[#e2e8f0] bg-white p-6 shadow-[0_16px_44px_-34px_rgba(21,42,90,.3)] sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl ${tone}`}><Icon size={19} /></span><span className="text-[13px] font-semibold uppercase tracking-[.12em] text-[#64748b]">{eyebrow}</span></span>
              <span className="rounded-full bg-[#f4f6fa] px-3 py-1 text-[12px] font-semibold text-[#334155]">{price}</span>
            </div>
            <h2 className="mt-5 text-[22px] font-semibold leading-tight tracking-[-.04em]">{title}</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#64748b]">{description}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {features.map((feature) => <li key={feature} className="flex items-start gap-2 text-[13px] text-[#475569]"><Check size={14} className="mt-0.5 shrink-0 text-[#2563eb]" />{feature}</li>)}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
              {primary.external
                ? <a href={primary.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#162544] px-4 text-[14px] font-semibold text-white transition hover:bg-[#243c70]">{primary.label}<ArrowUpRight size={14} /></a>
                : <Link href={primary.href} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#162544] px-4 text-[14px] font-semibold text-white transition hover:bg-[#243c70]">{primary.label}<ArrowRight size={14} /></Link>}
              {secondary && <Link href={secondary.href} className="text-[13px] font-semibold text-[#1e40af] hover:underline">{secondary.label}</Link>}
            </div>
          </article>
        ))}
      </section>

      <section className="border-t border-[#e2e8f0] bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-5 px-5 py-12 sm:px-8 md:flex-row md:items-center">
          <div><h2 className="text-[26px] font-semibold tracking-[-.045em]">Not sure where to start?</h2><p className="mt-1 text-[14px] text-[#64748b]">Most businesses start with an email package: it includes both sending and discovery credits.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/pricing" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1d4ed8] px-5 text-[14px] font-semibold text-white hover:bg-[#1e40af]">View email packages <ArrowRight size={14} /></Link><Link href="/lead-data" className="inline-flex h-11 items-center rounded-full border border-[#d8e1eb] px-5 text-[14px] font-semibold text-[#334155] hover:bg-[#f4f6fa]">Buy lead data</Link></div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
