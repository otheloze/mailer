"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bold, CalendarClock, CheckCircle2, ChevronDown, Eye, Italic, Link2, LoaderCircle,
  Mail, PenSquare, Send, Trash2, UsersRound, X,
} from "lucide-react";
import { composeEmailHtml, composeEmailText, composePreviewText } from "@/lib/compose-email";

type Audience = { id: string; name: string };
type Defaults = {
  default_from_name: string | null;
  default_from_email: string | null;
  default_reply_to: string | null;
  email_footer: string | null;
  company_name: string | null;
  brand_color: string | null;
  timezone: string | null;
} | null;

type Sent = { campaignId: string; scheduledAt: string | null; recipients: number; warning?: string };

export function QuickCompose({ audiences, defaults, accountEmail, senderDomains }: {
  audiences: Audience[];
  defaults: Defaults;
  accountEmail: string;
  senderDomains: string[];
}) {
  const [campaignId, setCampaignId] = useState<string | undefined>();
  const [audienceId, setAudienceId] = useState(audiences.length === 1 ? audiences[0].id : "");
  const [fromName, setFromName] = useState(defaults?.default_from_name ?? defaults?.company_name ?? "");
  const [fromEmail, setFromEmail] = useState(defaults?.default_from_email ?? "");
  const [replyTo, setReplyTo] = useState(defaults?.default_reply_to ?? "");
  const [showReplyTo, setShowReplyTo] = useState(Boolean(defaults?.default_reply_to));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [preview, setPreview] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "test" | "send">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const footer = [defaults?.company_name, defaults?.email_footer].filter(Boolean).join(" · ");
  const html = useMemo(() => composeEmailHtml({ body, footer, brandColor: defaults?.brand_color ?? undefined }), [body, footer, defaults?.brand_color]);
  const audienceName = audiences.find((item) => item.id === audienceId)?.name ?? "";
  const fromDomain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
  const domainWarning = senderDomains.length && fromDomain && !senderDomains.includes(fromDomain)
    ? `Use an approved sender domain: ${senderDomains.join(", ")}`
    : "";
  const missingAddress = !defaults?.email_footer?.trim();
  const dirty = Boolean(subject.trim() || body.trim());

  useEffect(() => {
    if (!audienceId) { setCount(null); return; }
    let active = true;
    setCount(null);
    fetch(`/api/audiences/${audienceId}/count`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) setCount(result.count as number);
      })
      .catch(() => { if (active) setCount(-1); });
    return () => { active = false; };
  }, [audienceId]);

  // Warn before leaving with an unsent message.
  useEffect(() => {
    if (!dirty || sent) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, sent]);

  function wrapSelection(before: string, after: string, placeholder: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function insertLink() {
    const url = window.prompt("Link address (https://…)", "https://");
    if (!url || !/^https?:\/\/\S+$/i.test(url.trim())) return;
    wrapSelection("[", `](${url.trim()})`, "link text");
  }

  function validate(requireAudience: boolean) {
    if (requireAudience && !audienceId) return "Choose who to send this to.";
    if (!fromEmail.trim()) return "Add a sender email address.";
    if (domainWarning) return domainWarning;
    if (!subject.trim()) return "Add a subject.";
    if (!body.trim()) return "Write your message.";
    return "";
  }

  async function saveDraft(): Promise<string> {
    const payload = {
      name: subject.trim().slice(0, 120) || "Untitled message",
      subject: subject.trim(),
      preview_text: composePreviewText(body),
      from_name: fromName.trim(),
      from_email: fromEmail.trim(),
      reply_to: showReplyTo && replyTo.trim() ? replyTo.trim() : null,
      audience_id: audienceId || null,
      html,
      text_content: composeEmailText(body),
    };
    const response = await fetch(campaignId ? `/api/campaigns/${campaignId}` : "/api/campaigns", {
      method: campaignId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save the message.");
    const id = result.campaign.id as string;
    setCampaignId(id);
    return id;
  }

  async function run(kind: "save" | "test" | "send", action: () => Promise<void>) {
    setError(""); setNotice(""); setBusy(kind);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); }
    finally { setBusy(""); }
  }

  const onSaveDraft = () => run("save", async () => {
    if (!subject.trim() && !body.trim()) throw new Error("Write something before saving a draft.");
    await saveDraft();
    setNotice("Draft saved. You can finish it later from Campaigns.");
  });

  const onTest = () => run("test", async () => {
    const problem = validate(false);
    if (problem) throw new Error(problem);
    const id = await saveDraft();
    const response = await fetch(`/api/campaigns/${id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testEmail: accountEmail }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Test send failed.");
    setNotice(`Test sent to ${accountEmail}.${result.warning ? ` ${result.warning}` : ""}`);
  });

  const onSend = () => run("send", async () => {
    const problem = validate(true);
    if (problem) throw new Error(problem);
    if (missingAddress) throw new Error("Add your company mailing address in Settings before sending.");
    let scheduledAt: string | undefined;
    if (scheduleOpen && scheduleAt) {
      const when = new Date(scheduleAt);
      if (Number.isNaN(when.getTime()) || when <= new Date()) throw new Error("Choose a future time to schedule.");
      scheduledAt = when.toISOString();
    }
    const who = count !== null && count >= 0 ? `${count.toLocaleString()} subscriber${count === 1 ? "" : "s"} in "${audienceName}"` : `"${audienceName}"`;
    const question = scheduledAt
      ? `Schedule "${subject.trim()}" for ${new Date(scheduledAt).toLocaleString()} to ${who}?`
      : `Send "${subject.trim()}" to ${who} now?`;
    if (!window.confirm(question)) return;
    const id = await saveDraft();
    const response = await fetch(`/api/campaigns/${id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not send the message.");
    setSent({ campaignId: id, scheduledAt: result.scheduledAt ?? null, recipients: result.eligibleContacts ?? 0, warning: result.warning });
  });

  function discard() {
    if (dirty && !window.confirm("Discard this message?")) return;
    setSubject(""); setBody(""); setScheduleAt(""); setScheduleOpen(false); setPreview(false);
    setError(""); setNotice(""); setCampaignId(undefined);
  }

  function reset() {
    setSent(null); setCampaignId(undefined); setSubject(""); setBody(""); setScheduleAt(""); setScheduleOpen(false); setPreview(false); setNotice(""); setError("");
  }

  if (sent) {
    return <div className="mx-auto max-w-[620px] rounded-2xl border border-line bg-white p-8 text-center shadow-soft dark:border-[#2a3550] dark:bg-[#17233d]">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><CheckCircle2 size={22} /></div>
      <h1 className="mt-4 text-[22px] font-semibold tracking-[-.04em]">{sent.scheduledAt ? "Message scheduled" : "Message on its way"}</h1>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        {sent.scheduledAt
          ? `It will go out ${new Date(sent.scheduledAt).toLocaleString()} to ${sent.recipients.toLocaleString()} recipient${sent.recipients === 1 ? "" : "s"}.`
          : `Resend accepted it for ${sent.recipients.toLocaleString()} recipient${sent.recipients === 1 ? "" : "s"}. Delivery and opens appear as webhook events arrive.`}
      </p>
      {sent.warning && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{sent.warning}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1d4ed8] px-4 text-[14px] font-medium text-white"><PenSquare size={15} /> Compose another</button>
        <Link href={`/campaigns/${sent.campaignId}`} className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-[14px] font-medium dark:border-[#30302d]">View details</Link>
        <Link href="/campaigns" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-[14px] font-medium dark:border-[#30302d]">All campaigns</Link>
      </div>
    </div>;
  }

  const field = "flex min-h-[48px] items-center gap-3 border-b border-line px-5 dark:border-[#2a3550]";
  const label = "w-16 shrink-0 text-[14px] text-muted";
  const input = "h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#a2a9b6]";

  return <div className="mx-auto max-w-[920px]">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-.04em] text-[#17233d] dark:text-white">Compose</h1>
        <p className="text-[14px] text-muted">Write a message and send it to an audience, like regular email.</p>
      </div>
      <Link href="/campaigns/new" className="text-[13px] font-medium text-[#3554c8] hover:underline dark:text-[#9eb4f3]">Need images and buttons? Use the designer →</Link>
    </div>

    {missingAddress && <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>Add your company mailing address in <Link href="/settings" className="font-medium underline">Settings</Link> before sending. Marketing laws require it in every email.</span>
    </div>}

    <form
      onSubmit={(event) => { event.preventDefault(); void onSend(); }}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void onSend(); } }}
      className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft dark:border-[#2a3550] dark:bg-[#17233d]"
    >
      <div className="flex items-center justify-between bg-[#17233d] px-5 py-3 text-white dark:bg-[#0f172a]">
        <div className="flex items-center gap-2 text-[14px] font-medium"><Mail size={15} /> New message</div>
        <button type="button" onClick={discard} aria-label="Discard message" className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={16} /></button>
      </div>

      <div className={field}>
        <span className={label}>From</span>
        <input value={fromName} onChange={(event) => setFromName(event.target.value)} placeholder="Your name or brand" aria-label="Sender name" className={`${input} max-w-[200px]`} />
        <input value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} placeholder="hello@yourdomain.com" type="email" aria-label="Sender email" list="sender-domains" className={input} />
        <datalist id="sender-domains">{senderDomains.map((domain) => <option key={domain} value={`hello@${domain}`} />)}</datalist>
        {!showReplyTo && <button type="button" onClick={() => setShowReplyTo(true)} className="shrink-0 text-[13px] text-muted hover:text-ink dark:hover:text-white">Reply-to</button>}
      </div>
      {domainWarning && <div className="border-b border-line bg-amber-50 px-5 py-2 text-[13px] text-amber-900 dark:border-[#2a3550]">{domainWarning}</div>}
      {showReplyTo && <div className={field}>
        <span className={label}>Reply-to</span>
        <input value={replyTo} onChange={(event) => setReplyTo(event.target.value)} type="email" placeholder="replies@yourdomain.com" aria-label="Reply-to address" className={input} />
        <button type="button" onClick={() => { setShowReplyTo(false); setReplyTo(""); }} aria-label="Remove reply-to" className="text-muted hover:text-ink"><X size={14} /></button>
      </div>}

      <div className={field}>
        <span className={label}>To</span>
        {audiences.length ? <>
          <div className="relative flex-1">
            <select value={audienceId} onChange={(event) => setAudienceId(event.target.value)} aria-label="Audience" className="h-11 w-full appearance-none bg-transparent pr-8 text-[15px] outline-none">
              <option value="">Choose an audience…</option>
              {audiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          {audienceId && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef3ff] px-2.5 py-1 text-[12px] font-medium text-[#3554c8] dark:bg-[#263d68] dark:text-[#bcd0ff]">
            <UsersRound size={12} />{count === null ? "Counting…" : count < 0 ? "Count unavailable" : `${count.toLocaleString()} subscriber${count === 1 ? "" : "s"}`}
          </span>}
        </> : <span className="text-[14px] text-muted">No audiences yet. <Link href="/audiences" className="font-medium text-[#3554c8] underline">Create one</Link> and add consented contacts first.</span>}
      </div>

      <div className={field}>
        <span className={label}>Subject</span>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What’s this message about?" maxLength={200} aria-label="Subject" className={`${input} font-medium`} />
      </div>

      <div className="flex items-center gap-1 border-b border-line px-4 py-1.5 dark:border-[#2a3550]">
        <ToolbarButton label="Bold" onClick={() => wrapSelection("**", "**", "bold text")} disabled={preview}><Bold size={15} /></ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => wrapSelection("*", "*", "italic text")} disabled={preview}><Italic size={15} /></ToolbarButton>
        <ToolbarButton label="Insert link" onClick={insertLink} disabled={preview}><Link2 size={15} /></ToolbarButton>
        <span className="mx-2 h-5 w-px bg-line dark:bg-[#2a3550]" />
        <button type="button" onClick={() => setPreview(!preview)} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium ${preview ? "bg-[#eef3ff] text-[#3554c8] dark:bg-[#263d68] dark:text-[#bcd0ff]" : "text-muted hover:bg-[#f2f4f8] dark:hover:bg-white/5"}`}>
          {preview ? <><PenSquare size={14} /> Back to writing</> : <><Eye size={14} /> Preview</>}
        </button>
        <span className="ml-auto hidden text-[12px] text-muted sm:block">**bold** · *italic* · links are clickable</span>
      </div>

      {preview
        ? <div className="bg-[#f6f6f3] p-4"><iframe title="Email preview" sandbox="" srcDoc={html} className="h-[460px] w-full rounded-lg border-0 bg-white" /></div>
        : <textarea
          ref={bodyRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={"Hi there,\n\nWrite your message here…"}
          aria-label="Message"
          className="block min-h-[360px] w-full resize-y bg-transparent px-5 py-4 text-[15px] leading-7 outline-none placeholder:text-[#a2a9b6]"
        />}

      <p className="border-t border-line px-5 py-2.5 text-[12px] text-muted dark:border-[#2a3550]">
        Your mailing address{footer ? ` (${footer})` : ""} and an unsubscribe link are added automatically.
      </p>

      {(error || notice) && <div className="px-5 pb-3">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{notice}</div>}
      </div>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fafbfc] px-5 py-3 dark:border-[#2a3550] dark:bg-[#131d33]">
        <button type="submit" disabled={!!busy || !audiences.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1d4ed8] px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#1e40af] disabled:opacity-50">
          {busy === "send" ? <LoaderCircle size={15} className="animate-spin" /> : scheduleOpen && scheduleAt ? <CalendarClock size={15} /> : <Send size={15} />}
          {busy === "send" ? "Sending…" : scheduleOpen && scheduleAt ? "Schedule" : "Send"}
        </button>
        <button type="button" onClick={() => setScheduleOpen(!scheduleOpen)} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium ${scheduleOpen ? "border-[#bcd0ff] bg-[#eef3ff] text-[#3554c8]" : "border-line text-muted hover:text-ink dark:border-[#30302d]"}`}>
          <CalendarClock size={14} /> Send later
        </button>
        {scheduleOpen && <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} aria-label="Schedule time" className="h-10 rounded-xl border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#1b2742]" />}
        <button type="button" onClick={() => void onTest()} disabled={!!busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-50 dark:border-[#30302d]">
          {busy === "test" ? <LoaderCircle size={14} className="animate-spin" /> : <Mail size={14} />} Send test to me
        </button>
        <button type="button" onClick={() => void onSaveDraft()} disabled={!!busy} className="inline-flex h-10 items-center rounded-xl px-3 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-50">
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <span className="ml-auto hidden text-[12px] text-muted md:block">Ctrl + Enter to send</span>
        <button type="button" onClick={discard} aria-label="Discard" className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
      </div>
    </form>
  </div>;
}

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-8 place-items-center rounded-md text-muted hover:bg-[#f2f4f8] hover:text-ink disabled:opacity-40 dark:hover:bg-white/5 dark:hover:text-white">{children}</button>;
}
