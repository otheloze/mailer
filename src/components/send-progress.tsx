"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Gauge, MailCheck, MailOpen, MousePointerClick, Send } from "lucide-react";
import type { SendProgress as Progress } from "@/lib/send-progress";
import { formatNumber } from "@/lib/utils";

type Snapshot = Progress & { campaignStatus: string; scheduledAt: string | null; sentAt: string | null };

const ACTIVE_POLL_MS = 2_000;
const IDLE_POLL_MS = 15_000;

/** Live sending view: a progress bar and counters fed by Resend delivery webhooks. */
export function SendProgress({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const last = useRef<{ at: number; finished: number } | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let next = IDLE_POLL_MS;
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/progress`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load sending progress.");
        if (!active) return;
        const snapshot = result as Snapshot;
        const now = Date.now();
        // Emails per minute, smoothed so the number doesn't jump around between polls.
        if (last.current && now > last.current.at) {
          const perMinute = ((snapshot.finished - last.current.finished) / (now - last.current.at)) * 60_000;
          setRate((previous) => previous === null ? perMinute : previous * 0.6 + perMinute * 0.4);
        }
        last.current = { at: now, finished: snapshot.finished };
        setData(snapshot); setError("");
        const sending = snapshot.campaignStatus === "sending" || (!snapshot.done && snapshot.total > 0 && snapshot.campaignStatus !== "scheduled");
        next = sending ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load sending progress.");
      }
      if (active) timer = setTimeout(poll, next);
    }
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [campaignId]);

  if (!data) {
    return <section className="rounded-xl border border-line bg-white p-5 text-[14px] text-muted shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">{error || "Loading sending progress…"}</section>;
  }

  const { total } = data;
  const pct = (value: number) => total ? (value / total) * 100 : 0;
  const problems = data.bounced + data.complained + data.failed;
  const inTransit = Math.max(0, data.sent - data.delivered);
  const finishedPct = Math.round(pct(data.finished));
  const scheduled = data.campaignStatus === "scheduled";
  const live = !scheduled && !data.done && total > 0;
  const remaining = live && rate && rate > 0.5 ? Math.ceil(data.queued / rate) : null;

  const headline = scheduled
    ? `Scheduled${data.scheduledAt ? ` for ${new Date(data.scheduledAt).toLocaleString()}` : ""}`
    : live ? "Sending now" : total ? "Sending complete" : "Preparing recipients";

  return <section aria-label="Sending progress" className="rounded-xl border border-line bg-white p-5 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {live ? <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#3b82f6] opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-[#2563eb]" /></span>
          : scheduled ? <Clock size={16} className="text-[#2563eb]" /> : <CheckCircle2 size={16} className="text-[#16a34a]" />}
        <h2 className="text-[15px] font-semibold">{headline}</h2>
      </div>
      <div className="flex items-center gap-4 text-[13px] text-muted">
        {live && rate !== null && <span className="inline-flex items-center gap-1"><Gauge size={14} /> {formatNumber(Math.max(0, Math.round(rate)))}/min</span>}
        {remaining !== null && <span>about {remaining} min left</span>}
      </div>
    </div>

    <div className="mt-4 flex items-end justify-between">
      <div className="text-[34px] font-semibold leading-none tracking-[-.04em] tabular-nums">{finishedPct}%</div>
      <div className="text-right text-[13px] text-muted tabular-nums">{formatNumber(data.finished)} of {formatNumber(total)} processed</div>
    </div>

    <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={data.finished} aria-label="Emails processed"
      className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-[#eef1f5] dark:bg-[#262624]">
      <div className="h-full bg-[#16a34a] transition-[width] duration-700 ease-out" style={{ width: `${pct(data.delivered)}%` }} />
      <div className={`h-full bg-[#3b82f6] transition-[width] duration-700 ease-out ${live ? "animate-pulse" : ""}`} style={{ width: `${pct(inTransit)}%` }} />
      <div className="h-full bg-[#dc2626] transition-[width] duration-700 ease-out" style={{ width: `${pct(problems)}%` }} />
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      <Legend color="bg-[#16a34a]" label="Delivered" /><Legend color="bg-[#3b82f6]" label="Sent, awaiting delivery" />
      <Legend color="bg-[#dc2626]" label="Bounced or failed" /><Legend color="bg-[#e2e6ec] dark:bg-[#3a3a37]" label="Queued" />
    </div>

    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <Counter icon={Clock} label="Queued" value={data.queued} total={total} />
      <Counter icon={Send} label="Sent" value={data.sent} total={total} tone="text-[#2563eb]" />
      <Counter icon={MailCheck} label="Delivered" value={data.delivered} total={total} tone="text-[#16a34a]" />
      <Counter icon={MailOpen} label="Opened" value={data.opened} total={data.delivered} tone="text-[#7c3aed]" />
      <Counter icon={MousePointerClick} label="Clicked" value={data.clicked} total={data.delivered} tone="text-[#0891b2]" />
      <Counter icon={AlertTriangle} label="Bounced" value={data.bounced} total={total} tone="text-[#dc2626]" />
      <Counter icon={AlertTriangle} label="Failed / spam" value={data.failed + data.complained} total={total} tone="text-[#b45309]" />
    </div>
    <p className="mt-4 text-[12px] text-muted">Live from Resend delivery events. Opened and clicked are shown as a share of delivered emails and keep updating after sending finishes.{error ? ` Last update failed: ${error}` : ""}</p>
  </section>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${color}`} />{label}</span>;
}

function Counter({ icon: Icon, label, value, total, tone = "text-ink" }: { icon: typeof Send; label: string; value: number; total: number; tone?: string }) {
  const share = total ? Math.round((value / total) * 100) : 0;
  return <div className="rounded-lg border border-line px-3 py-2.5 dark:border-[#2a2a27]">
    <div className="flex items-center gap-1.5 text-[12px] text-muted"><Icon size={13} />{label}</div>
    <div className={`mt-1 text-[20px] font-semibold tabular-nums tracking-[-.03em] ${tone}`}>{formatNumber(value)}</div>
    <div className="text-[11px] text-muted tabular-nums">{share}%</div>
  </div>;
}
