"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Database, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";

type Order = {
  id: string; email: string; targeting: string | null; lead_count: number; amount_minor: number; currency: string;
  payment_provider: string; status: string; paid_at: string | null; fulfilled_at: string | null; admin_note: string | null; created_at: string;
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "NGN" ? 0 : 2 }).format(minor / 100);
const statusTone: Record<string, string> = {
  paid: "bg-amber-50 text-amber-900",
  fulfilled: "bg-emerald-50 text-emerald-800",
  pending: "bg-slate-100 text-slate-600",
  refunded: "bg-red-50 text-red-700",
};

export function AdminLeadOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/lead-orders", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Could not load lead orders."); setOrders([]); return; }
    setOrders(result.orders);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(order: Order, action: "fulfill" | "reopen" | "refunded") {
    const note = action === "fulfill" ? window.prompt("Delivery note (optional, e.g. file link or how it was sent):", order.admin_note ?? "") : undefined;
    if (action === "fulfill" && note === null) return;
    if (action === "refunded" && !window.confirm(`Mark order for ${order.email} as refunded? Refund the payment in the ${order.payment_provider} dashboard first.`)) return;
    setBusy(order.id); setError("");
    try {
      const response = await fetch("/api/admin/lead-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action, ...(note !== undefined ? { note } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update the order.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the order.");
    } finally { setBusy(""); }
  }

  const visible = (orders ?? []).filter((order) => filter === "all" || order.status === "paid");
  const awaiting = (orders ?? []).filter((order) => order.status === "paid").length;

  return <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-white shadow-soft dark:border-[#2a3550] dark:bg-[#17233d]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 dark:border-[#2a3550]">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eef3ff] text-[#3554c8]"><Database size={16} /></span>
        <div><h2 className="text-[15px] font-semibold">Lead data orders</h2><p className="text-[13px] text-muted">{awaiting ? `${awaiting} paid order${awaiting === 1 ? "" : "s"} awaiting delivery` : "No orders awaiting delivery"}</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-[#f2f4f8] p-1 text-[12px] dark:bg-[#1b2742]">
          {(["open", "all"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-2.5 py-1 font-medium ${filter === value ? "bg-white shadow-sm dark:bg-[#263d68]" : "text-muted"}`}>{value === "open" ? "Awaiting delivery" : "All orders"}</button>)}
        </div>
        <button onClick={() => void load()} aria-label="Refresh orders" className="rounded-lg p-2 text-muted hover:bg-[#f2f4f8]"><RefreshCw size={14} /></button>
      </div>
    </div>
    {error && <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-[13px] text-red-700">{error}</div>}
    {orders === null ? <div className="grid place-items-center py-10"><LoaderCircle size={18} className="animate-spin text-muted" /></div>
      : !visible.length ? <p className="px-5 py-8 text-center text-[13px] text-muted">{filter === "open" ? "Nothing to deliver right now." : "No lead data orders yet."}</p>
      : <div className="divide-y divide-line dark:divide-[#2a3550]">{visible.map((order) => <div key={order.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            {order.lead_count.toLocaleString("en-US")} leads · {money(order.amount_minor, order.currency)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusTone[order.status] ?? "bg-slate-100"}`}>{order.status === "paid" ? "Paid · deliver" : order.status}</span>
          </div>
          <div className="mt-1 truncate text-[13px] text-muted">{order.email} · {order.payment_provider} · {new Date(order.paid_at ?? order.created_at).toLocaleString()} · #{order.id.slice(0, 8).toUpperCase()}</div>
          <div className="mt-1 text-[13px]"><span className="text-muted">Targeting:</span> {order.targeting || <span className="text-muted">not specified</span>}</div>
          {order.admin_note && <div className="mt-1 text-[12px] text-muted">Note: {order.admin_note}</div>}
        </div>
        <div className="flex shrink-0 gap-2">
          {order.status === "paid" && <button disabled={busy === order.id} onClick={() => void act(order, "fulfill")} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#102a43] px-3 text-[12px] font-medium text-white disabled:opacity-50"><CheckCircle2 size={13} /> Mark delivered</button>}
          {order.status === "fulfilled" && <button disabled={busy === order.id} onClick={() => void act(order, "reopen")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] font-medium disabled:opacity-50"><RotateCcw size={13} /> Reopen</button>}
          {(order.status === "paid" || order.status === "fulfilled") && <button disabled={busy === order.id} onClick={() => void act(order, "refunded")} className="h-8 rounded-md px-3 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Refunded</button>}
        </div>
      </div>)}</div>}
  </section>;
}
