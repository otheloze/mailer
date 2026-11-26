"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Flame, Zap } from "lucide-react";
import { HOSTING_STORE_URL } from "@/lib/links";
import { BLACK_FRIDAY_PROMO, isPromoActive } from "@/lib/promo";

export { HOSTING_STORE_URL };

const navItems: { label: string; href: string; external?: boolean }[] = [
  { label: "Products", href: "/products" },
  { label: "Lead data", href: "/lead-data" },
  { label: "Hosting", href: HOSTING_STORE_URL, external: true },
  { label: "Domains", href: "/domains/buy" },
  { label: "Pricing", href: "/pricing" },
  { label: "Download app", href: "/download" },
  { label: "Support", href: "/contact" },
];

function NavLink({ item, className, activeClassName }: { item: typeof navItems[number]; className: string; activeClassName: string }) {
  const pathname = usePathname();
  const active = !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (item.external) {
    return <a href={item.href} target="_blank" rel="noreferrer" className={`${className} inline-flex items-center gap-1`}>{item.label}<ArrowUpRight size={12} className="opacity-60" /></a>;
  }
  return <Link href={item.href} aria-current={active ? "page" : undefined} className={`${className} ${active ? activeClassName : ""}`}>{item.label}</Link>;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e4e9f1]/80 bg-white/85 backdrop-blur-xl">
      {/* Sits inside the sticky header so the bar and nav travel together and no
          page has to compensate for an extra offset. */}
      {isPromoActive() && <a
        href={BLACK_FRIDAY_PROMO.href}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center justify-center gap-2 bg-gradient-to-r from-[#1b0f05] via-[#3a1d07] to-[#1b0f05] px-4 py-2 text-center text-[11.5px] font-medium leading-4 text-[#ffd9b8] transition hover:text-white sm:text-[12.5px]"
      >
        <Flame size={13} className="shrink-0 text-[#ff8a3d]" />
        <span className="truncate">Black Friday: {BLACK_FRIDAY_PROMO.headline.toLowerCase()} — {BLACK_FRIDAY_PROMO.prices.map(({ currency, price }) => `${currency} ${price}`).join(" or ")}</span>
        <span className="hidden shrink-0 font-semibold underline underline-offset-2 group-hover:no-underline sm:inline">Ends 31 Dec · Claim the deal</span>
      </a>}
      <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-.045em] text-[#111c34] sm:text-[19px]">
          <span className="grid size-9 place-items-center rounded-[12px] bg-gradient-to-br from-[#78a8ff] to-[#4057db] text-white shadow-[0_8px_20px_-8px_rgba(70,100,220,.65)] sm:size-10"><Zap size={17} fill="currentColor" /></span>
          MYMAILMARKET
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 text-[14px] font-medium text-[#475569] lg:flex">
          {navItems.map((item) => <NavLink key={item.label} item={item} className="rounded-full px-3.5 py-2 transition hover:bg-[#f1f4f9] hover:text-[#111827]" activeClassName="bg-[#eef3ff] text-[#1e40af]" />)}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-[14px] font-medium text-[#475569] transition hover:text-[#111827] sm:inline">Sign in</Link>
          <Link href="/signup" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#162544] px-4 text-[14px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(13,28,58,.65)] transition hover:-translate-y-0.5 hover:bg-[#243c70] sm:px-5">
            Get started <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-[#e2e8f0] px-3 py-2 text-[14px] font-medium text-[#475569] lg:hidden">
        {navItems.map((item) => <NavLink key={item.label} item={item} className="shrink-0 rounded-full px-3 py-1.5" activeClassName="bg-[#eef3ff] text-[#1e40af]" />)}
        <Link href="/login" className="shrink-0 rounded-full px-3 py-1.5 sm:hidden">Sign in</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[#e2e8f0] bg-white">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.2fr_2fr] lg:px-10">
        <div>
          <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-.035em]"><span className="grid size-8 place-items-center rounded-lg bg-[#3b82f6] text-white"><Zap size={14} fill="currentColor" /></span> MYMAILMARKET</Link>
          <p className="mt-3 max-w-xs text-[13px] leading-5 text-[#64748b]">Leads, email marketing, domains and hosting to help your business grow online.</p>
        </div>
        <div className="grid grid-cols-2 gap-6 text-[13px] sm:grid-cols-3">
          <div><div className="mb-3 font-semibold text-[#111827]">Products</div><ul className="space-y-2 text-[#64748b]">
            <li><Link href="/products#email-marketing" className="hover:text-[#111827]">Email marketing</Link></li>
            <li><Link href="/products#email-discovery" className="hover:text-[#111827]">Email discovery</Link></li>
            <li><Link href="/lead-data" className="hover:text-[#111827]">Verified lead data</Link></li>
            <li><a href={HOSTING_STORE_URL} target="_blank" rel="noreferrer" className="hover:text-[#111827]">Web hosting</a></li>
            <li><Link href="/domains/buy" className="hover:text-[#111827]">Domains</Link></li>
            <li><Link href="/download" className="hover:text-[#111827]">Download app</Link></li>
          </ul></div>
          <div><div className="mb-3 font-semibold text-[#111827]">Buy</div><ul className="space-y-2 text-[#64748b]">
            <li><Link href="/pricing" className="hover:text-[#111827]">Email packages</Link></li>
            <li><Link href="/lead-data" className="hover:text-[#111827]">Lead data packages</Link></li>
            <li><Link href="/#mailbox-membership" className="hover:text-[#111827]">Mailbox membership</Link></li>
          </ul></div>
          <div><div className="mb-3 font-semibold text-[#111827]">Account</div><ul className="space-y-2 text-[#64748b]">
            <li><Link href="/login" className="hover:text-[#111827]">Sign in</Link></li>
            <li><Link href="/dashboard" className="hover:text-[#111827]">Workspace</Link></li>
            <li><Link href="/unsubscribe" className="hover:text-[#111827]">Email preferences</Link></li>
            <li><Link href="/contact" className="hover:text-[#111827]">Contact &amp; support</Link></li>
            <li><Link href="/privacy" className="hover:text-[#111827]">Privacy policy</Link></li>
          </ul></div>
        </div>
      </div>
      <div className="border-t border-[#eef2f7]">
        <div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-2 px-5 py-4 text-[12px] text-[#94a3b8] sm:flex-row sm:px-8 lg:px-10">
          <span>© {year} MYMAILMARKET. All rights reserved.</span>
          <span>Secure payments with PayPal and Paystack</span>
        </div>
      </div>
    </footer>
  );
}
