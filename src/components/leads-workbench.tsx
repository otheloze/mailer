"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowDownToLine, Building2, CircleCheck, ExternalLink, LoaderCircle, Search, ShieldCheck, Target, UserRoundSearch } from "lucide-react";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  company_name: string | null;
  company_domain: string;
  company_size: string | null;
  industry: string | null;
  country: string | null;
  email_type: string | null;
  email_confidence: number;
  email_status: "unverified" | "valid" | "risky" | "invalid" | "unknown";
  lead_score: number;
  sources: { uri?: string | null; domain?: string | null }[];
  provider: string;
  discovered_at: string;
  verified_at: string | null;
};

type DiscoveredCompany = {
  domain: string;
  organization: string | null;
  description?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  headcount?: string | null;
};

const statusClass: Record<Lead["email_status"], string> = {
  valid: "bg-[#eaf7f1] text-[#247751]",
  risky: "bg-amber-50 text-amber-800",
  invalid: "bg-red-50 text-red-700",
  unknown: "bg-[#f3f3f0] text-[#6e6f67]",
  unverified: "bg-[#eff2ff] text-[#515db4]",
};

export function LeadsWorkbench({ leads: initial, metrics, hunterConfigured }: {
  leads: Lead[];
  metrics: { total: number; verified: number; highFit: number };
  hunterConfigured: boolean;
}) {
  const [leads, setLeads] = useState(initial);
  const [domain, setDomain] = useState("");
  const [hunterQuery, setHunterQuery] = useState("");
  const [companies, setCompanies] = useState<DiscoveredCompany[]>([]);
  const [hasDiscovered, setHasDiscovered] = useState(false);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [status, setStatus] = useState("all");
  const [counts, setCounts] = useState(metrics);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchMode, setSearchMode] = useState<"keywords" | "domain">("keywords");
  const [searchingDomain, setSearchingDomain] = useState<string | null>(null);

  const visible = useMemo(() => leads.filter((lead) => {
    const text = `${lead.email} ${lead.first_name ?? ""} ${lead.last_name ?? ""} ${lead.job_title ?? ""} ${lead.company_name ?? ""} ${lead.company_domain}`.toLowerCase();
    return text.includes(search.toLowerCase())
      && (!industry || (lead.industry ?? "").toLowerCase().includes(industry.toLowerCase()))
      && (!country || (lead.country ?? "").toLowerCase().includes(country.toLowerCase()))
      && (!companySize || (lead.company_size ?? "").toLowerCase().includes(companySize.toLowerCase()))
      && (status === "all" || lead.email_status === status);
  }), [leads, search, industry, country, companySize, status]);

  async function searchDomain(domainValue: string) {
    setBusy(true);
    setSearchingDomain(domainValue);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domainValue, limit: 5 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not search this domain.");
      setCounts((current) => ({
        total: current.total + result.saved,
        verified: current.verified + result.savedVerified,
        highFit: current.highFit + result.savedHighFit,
      }));
      setNotice(`Found ${result.discovered} emails for ${result.company}; saved ${result.saved} new leads and skipped ${result.duplicates} duplicates.`);
      const refreshed = await fetch(`/api/leads?domain=${encodeURIComponent(result.domain)}`);
      const data = await refreshed.json();
      if (refreshed.ok) setLeads(data.leads);
      setDomain(domainValue);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not search this domain.");
    } finally {
      setBusy(false);
      setSearchingDomain(null);
    }
  }

  async function discoverDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchDomain(domain);
  }

  async function discoverCompanies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leads/hunter-discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: hunterQuery, limit: 5 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not discover companies.");
      setCompanies(result.companies);
      setHasDiscovered(true);
      setNotice(`Found ${result.companies.length} companies. Choose a domain to search for its emails; provider usage or credits may apply.`);
    } catch (reason) {
      setCompanies([]);
      setHasDiscovered(false);
      setError(reason instanceof Error ? reason.message : "Could not discover companies.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    setVerifying(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/leads/${id}/verify`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not verify this email.");
      setLeads((items) => items.map((lead) => lead.id === id ? { ...lead, ...result.lead } : lead));
      setNotice(`Email verification result: ${result.lead.email_status}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify this email.");
    } finally {
      setVerifying(null);
    }
  }

  const exportQuery = new URLSearchParams({
    ...(search ? { query: search } : {}),
    ...(industry ? { industry } : {}),
    ...(country ? { country } : {}),
    ...(companySize ? { company_size: companySize } : {}),
    ...(status !== "all" ? { status } : {}),
    format: "csv",
  }).toString();

  return <div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Metric icon={Building2} label="Leads collected" value={counts.total} />
      <Metric icon={ShieldCheck} label="Verified emails" value={counts.verified} />
      <Metric icon={Target} label="High-fit leads" value={counts.highFit} />
    </div>

    <div className="mb-4 rounded-xl border border-line bg-white p-5 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setSearchMode("keywords")} className={`h-9 rounded-lg px-3 text-[14px] font-medium ${searchMode === "keywords" ? "bg-[#eff2ff] text-[#515db4]" : "text-muted hover:bg-[#f5f5f2] dark:hover:bg-[#222220]"}`}>Company discovery</button>
        <button type="button" onClick={() => setSearchMode("domain")} className={`h-9 rounded-lg px-3 text-[14px] font-medium ${searchMode === "domain" ? "bg-[#eff2ff] text-[#515db4]" : "text-muted hover:bg-[#f5f5f2] dark:hover:bg-[#222220]"}`}>Domain search</button>
      </div>
      {searchMode === "keywords" ? <div>
        <form onSubmit={discoverCompanies} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-[14px] font-medium text-[#686863]">Describe the companies you want to find<input required value={hunterQuery} onChange={(event) => setHunterQuery(event.target.value)} placeholder="e.g. marketing agencies in Canada with 11-50 employees" className="h-10 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /></label>
          <button disabled={busy || !hunterConfigured || !hunterQuery.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1d4ed8] px-4 text-xs font-medium text-white hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-50">
            {busy && !searchingDomain ? <><LoaderCircle size={14} className="animate-spin" /> Discovering</> : <><Search size={14} /> Discover companies</>}
          </button>
          <p className="text-[13px] leading-4 text-muted sm:col-span-2">{hunterConfigured ? "Searches for up to five companies. Use Domain Search to find their business emails." : "Company discovery is not configured. Contact your administrator."}</p>
        </form>
        {companies.length > 0 && <div className="mt-4 divide-y divide-line rounded-lg border border-line dark:divide-[#2a2a27] dark:border-[#30302d]">
          {companies.map((company) => <div key={company.domain} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{company.organization || company.domain}</div>
              <div className="mt-1 text-[13px] text-muted">{company.domain}{company.industry ? ` · ${company.industry}` : ""}{company.city || company.country ? ` · ${[company.city, company.country].filter(Boolean).join(", ")}` : ""}{company.headcount ? ` · ${company.headcount} employees` : ""}</div>
              {company.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{company.description}</p>}
            </div>
            <button type="button" disabled={busy} onClick={() => void searchDomain(company.domain)} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium hover:bg-[#fafaf8] disabled:opacity-50 dark:border-[#30302d] dark:hover:bg-[#222220]">
              {searchingDomain === company.domain ? <LoaderCircle size={12} className="animate-spin" /> : <UserRoundSearch size={12} />}
              Find emails
            </button>
          </div>)}
        </div>}
        {hasDiscovered && companies.length === 0 && <p className="mt-4 text-[13px] text-muted">No companies were found for that query.</p>}
      </div> : <form onSubmit={discoverDomain} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="grid gap-1.5 text-[14px] font-medium text-[#686863]">Company domain<input required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" className="h-10 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /></label>
        <span className="pb-3 text-[13px] text-muted">Up to 5 results</span>
        <button disabled={busy || !hunterConfigured || !domain.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1d4ed8] px-4 text-xs font-medium text-white hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <><LoaderCircle size={14} className="animate-spin" /> Searching</> : <><UserRoundSearch size={14} /> Find emails</>}
        </button>
        <p className="text-[13px] leading-4 text-muted sm:col-span-3">{hunterConfigured ? "Searches for up to five business email addresses. Provider limits may apply." : "Domain search is not configured. Contact your administrator."}</p>
      </form>}
    </div>

    {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-3 text-xs ${error ? "border border-red-200 bg-red-50 text-red-800" : "border border-[#d7e8df] bg-[#f1faf5] text-[#26714f]"}`}>{error || notice}</div>}

    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="flex flex-col gap-3 border-b border-line p-4 dark:border-[#2a2a27]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-[13px] font-semibold">Business leads</h2><p className="mt-1 text-[13px] text-muted">Scores are transparent fit heuristics, not an AI prediction. Verify before use.</p></div>
          <a href={`/api/leads?${exportQuery}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[14px] font-medium hover:bg-[#fafaf8] dark:border-[#30302d] dark:hover:bg-[#222220]"><ArrowDownToLine size={14} /> Export CSV</a>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a2a29b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search leads" className="h-9 w-full rounded-lg border border-line bg-white pl-8 pr-3 text-[14px] dark:border-[#30302d] dark:bg-[#191918]" /></label>
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Filter industry" className="h-9 rounded-lg border border-line bg-white px-3 text-[14px] dark:border-[#30302d] dark:bg-[#191918]" />
          <input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Filter country" className="h-9 rounded-lg border border-line bg-white px-3 text-[14px] dark:border-[#30302d] dark:bg-[#191918]" />
          <input value={companySize} onChange={(event) => setCompanySize(event.target.value)} placeholder="Filter company size" className="h-9 rounded-lg border border-line bg-white px-3 text-[14px] dark:border-[#30302d] dark:bg-[#191918]" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by verification status" className="h-9 rounded-lg border border-line bg-white px-3 text-[14px] dark:border-[#30302d] dark:bg-[#191918]"><option value="all">All email statuses</option><option value="unverified">Unverified</option><option value="valid">Valid</option><option value="risky">Risky</option><option value="invalid">Invalid</option><option value="unknown">Unknown</option></select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-[#fbfbfa] text-[13px] uppercase tracking-[.08em] text-[#94948d] dark:bg-[#1b1b19]">
            <tr><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Industry / size / country</th><th className="px-4 py-3 font-medium">Email status</th><th className="px-4 py-3 font-medium">Fit</th><th className="px-4 py-3 text-right font-medium">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-[#2a2a27]">
            {visible.map((lead) => <tr key={lead.id} className="hover:bg-[#fcfcfb] dark:hover:bg-[#1b1b19]">
              <td className="px-4 py-3.5"><div className="text-[14px] font-medium">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Business contact"}</div><div className="mt-1 text-[13px] text-muted">{lead.email}</div><div className="mt-1 text-[13px] text-muted">{lead.job_title || lead.department || "Role not listed"}</div></td>
              <td className="px-4 py-3.5"><div className="text-[14px] font-medium">{lead.company_name || lead.company_domain}</div><div className="mt-1 text-[13px] text-muted">{lead.company_domain}</div></td>
              <td className="px-4 py-3.5 text-[13px] text-muted">{lead.industry || "—"}<div className="mt-1">{lead.company_size ? `${lead.company_size} employees` : "Size not listed"}</div><div className="mt-1">{lead.country || "—"}</div></td>
              <td className="px-4 py-3.5"><span className={`rounded-full px-2 py-1 text-[12px] capitalize ${statusClass[lead.email_status]}`}>{lead.email_status}</span><div className="mt-1 text-[12px] text-muted">Confidence {lead.email_confidence}%</div></td>
              <td className="px-4 py-3.5"><div className="flex items-center gap-2"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#ededeb]"><div className="h-full rounded-full bg-[#9cba4b]" style={{ width: `${lead.lead_score}%` }} /></div><span className="text-[13px] font-medium">{lead.lead_score}</span></div></td>
              <td className="px-4 py-3.5 text-right"><div className="flex justify-end gap-2">{lead.sources?.[0]?.uri && <a href={lead.sources[0].uri} target="_blank" rel="noreferrer" aria-label="View public source" title="View public source" className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:text-ink dark:border-[#30302d]"><ExternalLink size={13} /></a>}<button disabled={!hunterConfigured || verifying === lead.id} onClick={() => verify(lead.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] font-medium hover:bg-[#fafaf8] disabled:opacity-50 dark:border-[#30302d] dark:hover:bg-[#222220]">{verifying === lead.id ? <LoaderCircle size={12} className="animate-spin" /> : <CircleCheck size={12} />} Verify</button></div></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center"><div className="text-[14px] font-medium">{leads.length ? "No leads match these filters" : "No leads yet"}</div><p className="mt-1 text-[13px] text-muted">{leads.length ? "Try changing the filters." : "Search a company domain above to find publicly sourced business contacts."}</p></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-4 py-3 text-[13px] text-muted dark:border-[#2a2a27]">
        Showing {visible.length} of {leads.length} loaded leads. Prospects are not subscribed contacts. Only import them into marketing audiences after obtaining and recording appropriate consent.
      </div>
    </div>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return <div className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
    <div className="flex items-center justify-between text-[14px] text-muted"><span>{label}</span><Icon size={15} /></div>
    <div className="mt-3 text-[25px] font-semibold tracking-[-.05em]">{value.toLocaleString()}</div>
  </div>;
}
