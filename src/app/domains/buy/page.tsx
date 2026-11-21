import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Globe2, ShieldCheck } from "lucide-react";
import { DomainSearchPreview } from "@/components/domain-search-preview";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { HOSTING_STORE_URL } from "@/lib/links";

export const metadata = {
  title: "Domain search and pricing",
  description: "Search live domain availability and view registration quotes from Truehost.",
  alternates: { canonical: "/domains/buy" },
};

type SearchParams = { domain?: string };

export default async function BuyDomainPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initialDomain = typeof params.domain === "string" ? params.domain.slice(0, 253) : "";

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_rgba(112,151,255,.1),_transparent_34%),#f4f6fa] text-[#101828]">
      <SiteHeader />

      <section className="mx-auto max-w-[1080px] px-5 py-10 sm:px-8 sm:py-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#64748b] hover:text-[#111827]">
          <ArrowLeft size={13} /> Back to MYMAILMARKET
        </Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_.72fr] lg:items-start">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d9e4f2] bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.13em] text-[#1e3a5f]">
              <Globe2 size={12} /> Domain search
            </span>
            <h1 className="mt-5 max-w-[620px] text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[.98] tracking-[-.075em]">
              Find a name that moves your business forward.
            </h1>
            <p className="mt-4 max-w-[520px] text-[13px] leading-6 text-[#64748b]">
              Check real-time availability with Truehost and compare the estimated registration price in USD and NGN.
            </p>
            <div className="mt-7 rounded-[22px] border border-[#e2e8f0] bg-white p-5 shadow-[0_24px_70px_-48px_rgba(31,53,38,.3)] sm:p-7">
              <div className="text-[24px] font-semibold tracking-[-.035em] sm:text-[28px]">Search a domain</div>
              <p className="mt-1 text-[14px] text-[#64748b]">Enter a full domain, such as yourbrand.com or yourbrand.co.uk.</p>
              <DomainSearchPreview initialDomain={initialDomain} buyPage />
            </div>
          </div>

          <aside className="overflow-hidden rounded-[24px] border border-white bg-white/90 p-3 shadow-[0_24px_70px_-48px_rgba(27,48,90,.32)] sm:p-4">
            <div className="image-zoom relative h-[180px] overflow-hidden rounded-[18px]">
              <Image
                src="/images/domain-team.jpg"
                alt="A team sharing ideas in a creative meeting"
                fill
                sizes="(max-width: 1024px) 100vw, 35vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#101a31]/70 to-transparent" />
              <span className="absolute bottom-3 left-3 rounded-full border border-white/25 bg-[#111b32]/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-white backdrop-blur-md">Make your name yours</span>
            </div>
            <div className="p-2 pt-5 sm:p-3 sm:pt-5">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#e7efff] to-[#dce4fb] text-[#4665cf]"><ShieldCheck size={17} /></div>
            <h2 className="mt-4 text-[15px] font-semibold tracking-[-.03em]">Clear pricing, no surprise checkout</h2>
            <ul className="mt-4 space-y-3 text-[13px] leading-5 text-[#64748b]">
              <li>Prices include a 30% service markup on the Truehost registration quote.</li>
              <li>USD/NGN conversions use indicative rates from ExchangeRate-API and are refreshed hourly.</li>
              <li>Availability and quotes can change before registration. Domain checkout is not enabled, so this page will not charge you or register a domain.</li>
            </ul>
            <div className="mt-6 border-t border-[#e8edf4] pt-5">
              <p className="text-[13px] font-semibold text-[#111827]">Looking for web hosting?</p>
              <a href={HOSTING_STORE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#102a43] px-4 text-[13px] font-semibold text-white transition hover:bg-[#173b66]">
                Visit hosting store <ArrowUpRight size={13} />
              </a>
            </div>
            </div>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
