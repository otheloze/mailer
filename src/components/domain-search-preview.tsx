"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { HOSTING_STORE_URL } from "@/components/site-chrome";

type DomainSearchResult = {
  domain: string;
  available: boolean;
  pricing: { currency: string; amount: number; providerAmount: number }[];
  fxUpdatedAt: string | null;
};

export function DomainSearchPreview({ initialDomain = "", buyPage = false }: { initialDomain?: string; buyPage?: boolean }) {
  const [query, setQuery] = useState(initialDomain);
  const [result, setResult] = useState<DomainSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/domains/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: query }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = isRecord(payload) && typeof payload.error === "string" ? payload.error : null;
        setMessage(errorMessage ?? "Domain search is temporarily unavailable.");
        return;
      }
      if (!isDomainSearchResult(payload)) {
        setMessage("The domain provider returned an unexpected response. Please try again later.");
        return;
      }
      setResult(payload);
    } catch {
      setMessage("Could not reach domain search. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <label htmlFor={buyPage ? "domain-buy-query" : "domain-preview-query"} className="sr-only">Domain name</label>
      <div className="flex flex-col gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-2 sm:flex-row sm:items-center">
        <input
          id={buyPage ? "domain-buy-query" : "domain-preview-query"}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setMessage(""); setResult(null); }}
          placeholder="yourbrand.com"
          maxLength={253}
          autoComplete="url"
          className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[16px] outline-none placeholder:text-[#94a3b8]"
        />
        <button type="submit" disabled={loading} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#102a43] px-5 text-[15px] font-semibold text-white transition hover:bg-[#173b66] disabled:cursor-wait disabled:opacity-70">
          {loading ? <><LoaderCircle size={16} className="animate-spin" /> Checking</> : <>Search domains <ArrowRight size={16} /></>}
        </button>
      </div>
      {message && <p role="status" className="mt-2 rounded-lg bg-[#f4f6fa] px-3 py-2 text-[14px] leading-5 text-[#475569]">{message}</p>}
      {result && (
        <div className="mt-3 rounded-xl border border-[#e2e8f0] bg-white p-5">
          <div className="flex items-start gap-2">
            {result.available ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={19} className="mt-0.5 shrink-0 text-[#64748b]" />}
            <div className="min-w-0 flex-1">
              <p className="break-all text-[17px] font-semibold text-[#111827]">{result.domain}</p>
              <p className="mt-1 text-[15px] text-[#64748b]">{result.available ? "Available to register, subject to final confirmation." : "This domain is not available."}</p>
              {result.available && result.pricing.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.pricing.map((quote) => (
                    <span key={quote.currency} className="rounded-lg bg-[#f4f6fa] px-3 py-2 text-[15px] font-semibold text-[#1e3a5f]">
                      {formatCurrency(quote.amount, quote.currency)} / year
                    </span>
                  ))}
                </div>
              )}
              {result.available && result.pricing.length === 0 && <p className="mt-2 text-[14px] text-[#64748b]">The provider did not return a registration price.</p>}
              {result.available && result.pricing.length === 1 && <p className="mt-2 text-[14px] text-[#64748b]">Only the provider currency is available right now; the second currency could not be converted.</p>}
              {result.available && buyPage && (
                <p className="mt-3 text-[14px] leading-5 text-[#64748b]">Domain checkout is not enabled yet, so this search will not charge you or register the domain.</p>
              )}
              {result.fxUpdatedAt && <p className="mt-2 text-[13px] leading-5 text-[#94a3b8]">USD/NGN conversion uses indicative exchange rates updated {formatDate(result.fxUpdatedAt)}.</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* Hosting is bought in the store, so the searched name and its quote travel with the visitor. */}
                <a href={hostingStoreUrl(result)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#102a43] px-4 text-[14px] font-semibold text-white transition hover:bg-[#173b66]">
                  Get hosting <ArrowUpRight size={14} />
                </a>
                {result.available && !buyPage && (
                  <Link href={`/domains/buy?domain=${encodeURIComponent(result.domain)}`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1d4ed8] hover:underline">
                    View domain quote <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function hostingStoreUrl(result: DomainSearchResult) {
  const url = new URL(HOSTING_STORE_URL);
  // WHMCS reads `domain`/`query` to prefill its domain search; the rest tells the
  // store what this visitor was quoted here, so the two pages cannot disagree.
  url.searchParams.set("domain", result.domain);
  url.searchParams.set("query", result.domain);
  url.searchParams.set("available", result.available ? "true" : "false");
  const quote = result.pricing[0];
  if (quote) {
    url.searchParams.set("domain_price", quote.amount.toFixed(2));
    url.searchParams.set("domain_currency", quote.currency);
  }
  return url.toString();
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDomainSearchResult(value: unknown): value is DomainSearchResult {
  if (!isRecord(value) || typeof value.domain !== "string" || typeof value.available !== "boolean" || !Array.isArray(value.pricing)) return false;
  const validPricing = value.pricing.every((quote) => isRecord(quote)
    && typeof quote.currency === "string"
    && typeof quote.amount === "number"
    && typeof quote.providerAmount === "number");
  return validPricing && (value.fxUpdatedAt === null || typeof value.fxUpdatedAt === "string");
}
