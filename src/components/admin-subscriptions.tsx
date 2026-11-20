"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, LoaderCircle, RefreshCw, Save, Shield, Users } from "lucide-react";

type Package = {
  id: string; slug: string; name: string; price_cents: number; paystack_price_kobo: number; email_sending_credits: number;
  email_discovery_credits: number; duration_days: number; rollover_policy: "expire" | "rollover"; enabled: boolean;
};
type Client = {
  id: string; email: string; name: string; created_at: string; banned_until: string | null;
  account: { status: string; note: string | null };
  subscription: { id: string; status: string; started_at: string; expires_at: string; package: Package | Package[] | null } | null;
  effective_subscription_status: string;
  balances: { email_sending: number; email_discovery: number };
  payments: { id: string; amount_cents: number; refunded_cents: number; currency: string; status: string; payment_provider: string; provider_reference: string | null; paid_at: string | null; created_at: string }[];
  transactions: { id: string; service: string; amount: number; balance_after: number; transaction_type: string; note: string | null; created_at: string }[];
  sender_domains: string[];
  is_self: boolean;
};
type Data = {
  clients: Client[];
  packages: Package[];
  audit: { id: string; actor_id: string; target_user_id: string | null; action: string; details: Record<string, unknown>; created_at: string }[];
  stats: { total_clients: number; active_subscriptions: number; expired_subscriptions: number; revenue_by_currency: Record<string, number> };
};

const formatNumber = new Intl.NumberFormat("en-US");
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100);
const packageOf = (value: Package | Package[] | null | undefined) => Array.isArray(value) ? value[0] ?? null : value ?? null;

export function AdminSubscriptions() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/subscriptions", { cache: "no-store" });
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load subscription administration.");
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load subscription administration.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (body: unknown) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Administrator action failed.");
      setNotice("Changes saved.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Administrator action failed.");
    } finally { setBusy(false); }
  }, [load]);

  if (loading) return <div className="grid min-h-48 place-items-center rounded-xl border border-line bg-white dark:border-[#2a2a27] dark:bg-[#171716]"><LoaderCircle className="animate-spin text-[#1d4ed8]" size={20} /></div>;
  if (!data) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{error || "Admin data is unavailable."}</div>;

  return <div className="space-y-5">
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Registered clients", formatNumber.format(data.stats.total_clients)],
        ["Active subscriptions", formatNumber.format(data.stats.active_subscriptions)],
        ["Expired subscriptions", formatNumber.format(data.stats.expired_subscriptions)],
        ["Net recorded revenue", Object.entries(data.stats.revenue_by_currency).map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") || "—"],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><div className="text-[13px] text-muted">{label}</div><div className="mt-2 text-[23px] font-semibold tracking-[-.05em]">{value}</div></div>)}
    </div>

    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 dark:border-[#2a2a27]"><div className="flex items-center gap-2"><Users size={15} className="text-[#1d4ed8]" /><div><h2 className="text-[14px] font-semibold">Client accounts</h2><p className="text-[12px] text-muted">Role-gated access · credit and payment history included</p></div></div><button onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium dark:border-[#30302d]"><RefreshCw size={12} />Refresh</button></div>
      <div className="divide-y divide-line dark:divide-[#2a2a27]">
        {data.clients.map((client) => <ClientRow key={client.id} client={client} packages={data.packages} busy={busy} submit={submit} />)}
        {!data.clients.length && <div className="px-5 py-10 text-center text-xs text-muted">No client accounts yet.</div>}
      </div>
    </section>

    <PackageEditor packages={data.packages} busy={busy} submit={submit} />

    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3"><Shield size={15} className="text-[#1d4ed8]" /><h2 className="text-[14px] font-semibold">Recent administrator actions</h2></div>
      <div className="divide-y divide-line dark:divide-[#2a2a27]">{data.audit.slice(0, 30).map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-[12px]"><span><strong>{entry.action.replaceAll("_", " ")}</strong> · target {entry.target_user_id ?? "package catalog"}</span><span className="text-muted">{formatDate(entry.created_at)} · admin {entry.actor_id}</span></div>)}</div>
    </section>
  </div>;
}

function ClientRow({ client, packages, busy, submit }: { client: Client; packages: Package[]; busy: boolean; submit: (body: unknown) => Promise<void> }) {
  const currentPackage = packageOf(client.subscription?.package);
  const [accountStatus, setAccountStatus] = useState(client.account.status);
  const [subStatus, setSubStatus] = useState(client.subscription?.status ?? "none");
  const [packageSlug, setPackageSlug] = useState(currentPackage?.slug ?? packages.find((item) => item.enabled)?.slug ?? "");
  const [service, setService] = useState<"email_sending" | "email_discovery">("email_sending");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [senderDomain, setSenderDomain] = useState("");
  const name = client.name || client.email || client.id;
  useEffect(() => {
    setAccountStatus(client.account.status);
    setSubStatus(client.subscription?.status ?? "none");
    setPackageSlug(currentPackage?.slug ?? packages.find((item) => item.enabled)?.slug ?? "");
  }, [client.account.status, client.subscription?.status, currentPackage?.slug, packages]);

  async function saveAccount() {
    await submit({ action: "account_status", userId: client.id, status: accountStatus });
  }
  async function saveSubscription() {
    if (client.subscription) await submit({ action: "subscription_status", userId: client.id, status: subStatus });
    else if (packageSlug) await submit({ action: "assign_package", userId: client.id, packageSlug });
  }
  async function assignPackage() {
    if (packageSlug) await submit({ action: "assign_package", userId: client.id, packageSlug });
  }
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0 || !note.trim()) return;
    await submit({ action: "adjust_credits", userId: client.id, service, amount: parsedAmount, note });
    setAmount(""); setNote("");
  }

  return <article className={`px-4 py-4 ${client.is_self ? "bg-[#f5f8ff] dark:bg-[#1b2742]" : ""}`}>
    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0"><div className="flex items-center gap-2 truncate text-[14px] font-semibold">{name}{client.is_self && <span className="rounded-full bg-[#1d4ed8] px-2 py-0.5 text-[11px] font-semibold text-white">You</span>}</div><div className="mt-1 truncate text-[13px] text-muted">{client.email} · joined {formatDate(client.created_at)}</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]"><span className={`rounded-full px-2 py-1 ${client.account.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>Account: {client.account.status}</span><span className={`rounded-full px-2 py-1 ${client.effective_subscription_status === "active" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-700"}`}>Subscription: {client.effective_subscription_status}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{currentPackage?.name ?? "No package"}</span></div>
      </div>
      <div className="grid gap-x-5 gap-y-2 text-[13px] sm:grid-cols-2 lg:min-w-[280px]">
        <div>Email credits <strong className="ml-1">{formatNumber.format(client.balances.email_sending)}</strong></div>
        <div>Discovery credits <strong className="ml-1">{formatNumber.format(client.balances.email_discovery)}</strong></div>
        <div>Expires <strong className="ml-1">{formatDate(client.subscription?.expires_at ?? null)}</strong></div>
        <div>Payments <strong className="ml-1">{client.payments.length}</strong></div>
      </div>
    </div>

    <div className="mt-4 grid gap-3 xl:grid-cols-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3 dark:bg-[#222220]">
        <label className="grid gap-1 text-[12px] text-muted">Account<select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]">{["active", "suspended", "deactivated"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <button disabled={busy || accountStatus === client.account.status} onClick={() => void saveAccount()} className="h-8 rounded-md bg-[#102a43] px-3 text-[12px] font-medium text-white disabled:opacity-40">Save account</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3 dark:bg-[#222220]">
        <label className="grid gap-1 text-[12px] text-muted">Package<select value={packageSlug} onChange={(event) => setPackageSlug(event.target.value)} className="h-8 max-w-[150px] rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]">{packages.filter((item) => item.enabled).map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></label>
        {client.subscription && <label className="grid gap-1 text-[12px] text-muted">Status<select value={subStatus} onChange={(event) => setSubStatus(event.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]">{["active", "suspended", "expired", "canceled"].map((item) => <option key={item}>{item}</option>)}</select></label>}
        <button disabled={busy || !packageSlug} onClick={() => client.subscription && packageSlug === currentPackage?.slug ? void saveSubscription() : void assignPackage()} className="h-8 rounded-md border border-[#cbd8e8] bg-white px-3 text-[12px] font-medium text-[#102a43] disabled:opacity-40">{client.subscription && packageSlug === currentPackage?.slug ? "Save status" : client.subscription ? "Change package" : "Assign package"}</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3 dark:bg-[#222220]">
        <label className="grid gap-1 text-[12px] text-muted">Extend (days)<input value={extendDays} onChange={(event) => setExtendDays(event.target.value)} type="number" min="1" max="3650" className="h-8 w-20 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]" /></label>
        <button disabled={busy || !client.subscription} onClick={() => void submit({ action: "extend_subscription", userId: client.id, days: Number(extendDays) })} className="h-8 rounded-md border border-line bg-white px-3 text-[12px] font-medium disabled:opacity-40">Extend subscription</button>
      </div>
    </div>

    <form onSubmit={adjust} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line p-3 dark:border-[#30302d]">
      <label className="grid gap-1 text-[12px] text-muted">Credit type<select value={service} onChange={(event) => setService(event.target.value as typeof service)} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]"><option value="email_sending">Email sending</option><option value="email_discovery">Email discovery</option></select></label>
      <label className="grid gap-1 text-[12px] text-muted">Amount (+ add, − deduct)<input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" step="1" required className="h-8 w-28 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]" /></label>
      <label className="grid min-w-[180px] flex-1 gap-1 text-[12px] text-muted">Reason<input value={note} onChange={(event) => setNote(event.target.value)} required minLength={3} maxLength={500} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]" /></label>
      <button disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#102a43] px-3 text-[12px] font-medium text-white disabled:opacity-40"><Check size={12} />Adjust credits</button>
    </form>

    <form onSubmit={(event) => { event.preventDefault(); if (senderDomain.trim()) void submit({ action: "grant_sender_domain", userId: client.id, domain: senderDomain.trim() }).then(() => setSenderDomain("")); }} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line p-3 dark:border-[#30302d]">
      <div className="grid min-w-[180px] flex-1 gap-1 text-[12px] text-muted">Approved sender domains
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">{client.sender_domains.map((domain) => <span key={domain} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[12px] text-slate-700">{domain}<button type="button" disabled={busy} onClick={() => { if (window.confirm(`Revoke ${domain} for ${client.email}?`)) void submit({ action: "revoke_sender_domain", userId: client.id, domain }); }} aria-label={`Revoke ${domain}`} className="text-slate-500 hover:text-red-700 disabled:opacity-40">×</button></span>)}{!client.sender_domains.length && <span className="text-[12px]">None (sends from the shared platform address)</span>}</div>
      </div>
      <label className="grid gap-1 text-[12px] text-muted">Domain<input value={senderDomain} onChange={(event) => setSenderDomain(event.target.value)} placeholder="example.com" className="h-8 w-44 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]" /></label>
      <button disabled={busy || !senderDomain.trim()} className="h-8 rounded-md border border-[#cbd8e8] bg-white px-3 text-[12px] font-medium text-[#102a43] disabled:opacity-40">Grant domain</button>
    </form>

    <details className="group mt-3 rounded-lg border border-line dark:border-[#30302d]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium"><ChevronDown size={13} className="transition group-open:rotate-180" />Payment and usage history ({client.payments.length} payments, {client.transactions.length} credit events)</summary>
      <div className="grid gap-3 border-t border-line p-3 dark:border-[#30302d] lg:grid-cols-2">
        <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Payments</h4>{client.payments.slice(0, 15).map((payment) => <div key={payment.id} className="flex justify-between gap-2 py-1.5 text-[12px]"><span>{formatDate(payment.paid_at ?? payment.created_at)} · {payment.payment_provider} · {payment.status}</span><span className="font-medium">{formatMoney(payment.amount_cents - payment.refunded_cents, payment.currency)}</span></div>)}{!client.payments.length && <p className="text-[12px] text-muted">No payments.</p>}</div>
        <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Credit transactions</h4>{client.transactions.slice(0, 25).map((transaction) => <div key={transaction.id} className="flex justify-between gap-2 py-1.5 text-[12px]"><span>{transaction.service === "email_sending" ? "Email" : "Discovery"} · {transaction.note ?? transaction.transaction_type} · {formatDate(transaction.created_at)}</span><strong>{transaction.amount > 0 ? "+" : ""}{formatNumber.format(transaction.amount)}</strong></div>)}{!client.transactions.length && <p className="text-[12px] text-muted">No credit activity.</p>}</div>
      </div>
    </details>
  </article>;
}

function PackageEditor({ packages, busy, submit }: { packages: Package[]; busy: boolean; submit: (body: unknown) => Promise<void> }) {
  const [draft, setDraft] = useState({ slug: "", name: "", price_cents: 500, paystack_price_kobo: 0, email_sending_credits: 5000, email_discovery_credits: 50, duration_days: 30, rollover_policy: "expire" as "expire" | "rollover", enabled: true });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit({ action: "save_package", package: draft });
    setDraft({ slug: "", name: "", price_cents: 500, paystack_price_kobo: 0, email_sending_credits: 5000, email_discovery_credits: 50, duration_days: 30, rollover_policy: "expire", enabled: true });
  }

  return <section className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716] sm:p-5">
    <div><h2 className="text-[13px] font-semibold">Package catalog</h2><p className="mt-1 text-[13px] text-muted">Edit enabled packages, credits, prices, term and rollover policy. Disable packages to stop new purchases.</p></div>
    <div className="mt-4 space-y-2">
      {packages.map((item) => <PackageRow key={item.id} item={item} busy={busy} submit={submit} />)}
    </div>
    <form onSubmit={save} className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <h3 className="text-[14px] font-semibold sm:col-span-2 xl:col-span-4">Add package</h3>
      <PackageInput label="Slug" value={draft.slug} onChange={(slug) => setDraft((current) => ({ ...current, slug }))} placeholder="custom-plan" />
      <PackageInput label="Name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} placeholder="CUSTOM" />
      <PackageInput label="PayPal price (USD cents)" value={draft.price_cents} type="number" onChange={(value) => setDraft((current) => ({ ...current, price_cents: Number(value) }))} />
      <PackageInput label="Paystack price (NGN kobo)" value={draft.paystack_price_kobo} type="number" onChange={(value) => setDraft((current) => ({ ...current, paystack_price_kobo: Number(value) }))} />
      <PackageInput label="Email sending credits" value={draft.email_sending_credits} type="number" onChange={(value) => setDraft((current) => ({ ...current, email_sending_credits: Number(value) }))} />
      <PackageInput label="Email discovery credits" value={draft.email_discovery_credits} type="number" onChange={(value) => setDraft((current) => ({ ...current, email_discovery_credits: Number(value) }))} />
      <PackageInput label="Duration (days)" value={draft.duration_days} type="number" onChange={(value) => setDraft((current) => ({ ...current, duration_days: Number(value) }))} />
      <label className="grid gap-1 text-[12px] text-muted">Unused credits<select value={draft.rollover_policy} onChange={(event) => setDraft((current) => ({ ...current, rollover_policy: event.target.value as typeof draft.rollover_policy }))} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]"><option value="expire">Expire on renewal</option><option value="rollover">Roll over</option></select></label>
      <button disabled={busy} className="inline-flex h-8 items-center justify-center gap-1 self-end rounded-md bg-[#102a43] px-3 text-[12px] font-medium text-white disabled:opacity-40"><Save size={12} />Add package</button>
    </form>
  </section>;
}

function PackageRow({ item, busy, submit }: { item: Package; busy: boolean; submit: (body: unknown) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => setDraft(item), [item]);
  function change<K extends keyof Package>(key: K, value: Package[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  return <div className="grid gap-2 rounded-lg border border-line p-3 dark:border-[#30302d] sm:grid-cols-2 xl:grid-cols-4">
    <PackageInput label="Name" value={draft.name} onChange={(value) => change("name", value)} />
    <PackageInput label="PayPal price (USD cents)" value={draft.price_cents} type="number" onChange={(value) => change("price_cents", Number(value))} />
    <PackageInput label="Paystack price (NGN kobo)" value={draft.paystack_price_kobo} type="number" onChange={(value) => change("paystack_price_kobo", Number(value))} />
    <PackageInput label="Email sending credits" value={draft.email_sending_credits} type="number" onChange={(value) => change("email_sending_credits", Number(value))} />
    <PackageInput label="Discovery credits" value={draft.email_discovery_credits} type="number" onChange={(value) => change("email_discovery_credits", Number(value))} />
    <PackageInput label="Duration (days)" value={draft.duration_days} type="number" onChange={(value) => change("duration_days", Number(value))} />
    <label className="grid gap-1 text-[12px] text-muted">Unused credits<select value={draft.rollover_policy} onChange={(event) => change("rollover_policy", event.target.value as Package["rollover_policy"])} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]"><option value="expire">Expire</option><option value="rollover">Rollover</option></select></label>
    <label className="grid gap-1 text-[12px] text-muted">Availability<select value={String(draft.enabled)} onChange={(event) => change("enabled", event.target.value === "true")} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
    <button disabled={busy} onClick={() => void submit({ action: "save_package", package: draft })} className="inline-flex h-8 items-center justify-center gap-1 self-end rounded-md border border-[#cbd8e8] bg-[#f8fafc] px-3 text-[12px] font-medium text-[#102a43] disabled:opacity-40"><Save size={12} />Save {item.slug.toUpperCase()}</button>
  </div>;
}

function PackageInput({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="grid gap-1 text-[12px] text-muted">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === "number" ? 0 : undefined} className="h-8 min-w-0 rounded-md border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#171716]" /></label>;
}
