"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Eye, GripVertical, Image as ImageIcon, Link2, Mail, Monitor, Plus, Send, Smartphone, Trash2, Type } from "lucide-react";
import Link from "next/link";

type Block = { id: string; type: "heading" | "text" | "image" | "button" | "divider" | "columns" | "social" | "html"; content: string; url?: string; color?: string; background?: string };
type Audience = { id: string; name: string };
type Campaign = {
  id: string; name: string; subject: string; preview_text: string; from_name: string; from_email: string; reply_to: string | null;
  audience_id: string | null; html: string; text_content: string; status: string; scheduled_at: string | null;
};
type Defaults = { default_from_name: string | null; default_from_email: string | null; default_reply_to: string | null; email_footer?: string | null; company_name?: string | null; timezone?: string | null } | null;
type Template = { name: string; subject: string; html: string };
const starterBlocks: Block[] = [
  { id: "title", type: "heading", content: "A little something for your inbox" },
  { id: "copy", type: "text", content: "Share your latest news, ideas, and updates with the people who want to hear from you." },
  { id: "button", type: "button", content: "Explore what’s new", url: "https://example.com" },
];

export function CampaignEditor({ campaign, audiences, defaults, template }: { campaign?: Campaign; audiences: Audience[]; defaults: Defaults; template?: Template }) {
  const canEdit = !campaign || campaign.status === "draft" || campaign.status === "scheduled";
  const [id, setId] = useState(campaign?.id);
  const [name, setName] = useState(campaign?.name ?? (template ? `${template.name} campaign` : ""));
  const [subject, setSubject] = useState(campaign?.subject ?? template?.subject ?? "");
  const [previewText, setPreviewText] = useState(campaign?.preview_text ?? "");
  const [fromName, setFromName] = useState(campaign?.from_name || defaults?.default_from_name || "");
  const [fromEmail, setFromEmail] = useState(campaign?.from_email || defaults?.default_from_email || "");
  const [replyTo, setReplyTo] = useState(campaign?.reply_to || defaults?.default_reply_to || "");
  const [audienceId, setAudienceId] = useState(campaign?.audience_id ?? "");
  const [blocks, setBlocks] = useState<Block[]>(campaign?.html || template?.html ? [{ id: "custom-html", type: "html", content: campaign?.html ?? template?.html ?? "" }] : starterBlocks);
  const [selectedId, setSelectedId] = useState(blocks[0]?.id ?? "");
  const [preview, setPreview] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState(campaign?.html ?? "");
  const timeZone = defaults?.timezone || "UTC";
  const [scheduleAt, setScheduleAt] = useState(campaign?.scheduled_at ? toTimeZoneInput(campaign.scheduled_at, timeZone) : "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const selected = blocks.find((block) => block.id === selectedId);
  const footer = [defaults?.company_name, defaults?.email_footer].filter(Boolean).join(" · ");
  const emailHtml = useMemo(() => htmlMode ? htmlDraft : renderEmail(blocks, footer), [blocks, footer, htmlMode, htmlDraft]);

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event; if (!over || active.id === over.id) return;
    setBlocks((items) => { const from = items.findIndex((item) => item.id === active.id); const to = items.findIndex((item) => item.id === over.id); return arrayMove(items, from, to); });
  }
  function addBlock(type: Block["type"]) {
    const next: Block = { id: crypto.randomUUID(), type, content: type === "heading" ? "Your headline" : type === "button" ? "Call to action" : type === "image" ? "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900" : type === "divider" ? "" : type === "columns" ? "Left column|Right column" : type === "social" ? "Instagram|https://instagram.com" : type === "html" ? "<p>Write custom HTML</p>" : "Start writing your email…" };
    setBlocks((items) => [...items, next]); setSelectedId(next.id);
  }
  function changeBlock(id: string, patch: Partial<Block>) { setBlocks((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  async function save(): Promise<string | undefined> {
    if (!name.trim()) throw new Error("Give your campaign a name.");
    setBusy(true); setError(""); setNotice("");
    const textContent = htmlMode || (blocks.length === 1 && blocks[0].type === "html")
      ? htmlToText(emailHtml)
      : textFromBlocks(blocks);
    const body = { name, subject, preview_text: previewText, from_name: fromName, from_email: fromEmail, reply_to: replyTo || null, audience_id: audienceId || null, html: emailHtml, text_content: textContent };
    try {
      const response = await fetch(id ? `/api/campaigns/${id}` : "/api/campaigns", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save your campaign.");
      if (!id) { setId(result.campaign.id); window.history.replaceState(null, "", `/campaigns/${result.campaign.id}`); }
      setNotice(campaign?.status === "scheduled" ? "Changes saved. Reschedule to apply them to the queued Resend broadcast." : "Draft saved."); return result.campaign.id as string;
    } finally { setBusy(false); }
  }
  async function saveButton() { try { await save(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save campaign."); } }
  async function send(testEmail?: string) {
    setError(""); setNotice("");
    if (testEmail) {
      try {
        const campaignId = canEdit ? await save() : id; if (!campaignId) return;
        const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testEmail }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Test send failed.");
        setNotice(`Test accepted by Resend. Email ID: ${result.id ?? "pending"}`);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Test send failed."); }
      return;
    }
    if (!audienceId) { setError("Choose an audience before sending."); return; }
    if (campaign?.status === "scheduled" && !scheduleAt) { setError("Choose a new future schedule time."); return; }
    let scheduledAt: string | undefined;
    try { scheduledAt = scheduleAt ? fromTimeZoneInput(scheduleAt, timeZone) : undefined; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid schedule time."); return; }
    if (scheduledAt && new Date(scheduledAt) <= new Date()) { setError("Choose a future schedule time."); return; }
    if (!window.confirm(scheduledAt ? "Schedule this campaign with Resend?" : "Send this campaign to your subscribed audience now?")) return;
    try {
      const campaignId = await save(); if (!campaignId) return;
      const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not send campaign.");
      setNotice(`${result.scheduledAt ? "Campaign scheduled with Resend." : `Resend accepted the broadcast for ${result.eligibleContacts} locally subscribed contacts. Delivery will be confirmed by webhook events.`}${result.warning ? ` ${result.warning}` : ""}`);
      if (!result.scheduledAt) window.location.assign("/campaigns");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send campaign."); }
  }

  async function cancelScheduled() {
    if (!id || !window.confirm("Cancel this scheduled broadcast?")) return;
    setError(""); setBusy(true);
    try { const response = await fetch(`/api/campaigns/${id}/cancel`, { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not cancel scheduled campaign."); setNotice("Scheduled campaign canceled."); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel campaign."); }
    finally { setBusy(false); }
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Link href="/campaigns" aria-label="Back to campaigns" className="grid size-8 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-[#fafaf8] dark:border-[#30302d] dark:bg-[#191918]"><ArrowLeft size={15} /></Link><div><h1 className="text-[20px] font-semibold tracking-[-.04em]">{campaign ? canEdit ? "Edit campaign" : "Campaign details" : "New campaign"}</h1><p className="text-[14px] text-muted">{campaign ? `Status: ${campaign.status}` : "Draft your next message"}</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setPreview(!preview)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d] ${preview ? "bg-[#eaf0fb] text-[#1e40af]" : ""}`}><Eye size={14} /> {preview ? "Edit design" : "Preview"}</button>
        <button onClick={() => { const address = window.prompt("Send a test email to:"); if (address?.trim()) void send(address.trim()); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]"><Mail size={14} /> Test</button>
        {canEdit && campaign?.status !== "scheduled" && <button onClick={() => void saveButton()} disabled={busy} className="h-9 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]">{busy ? "Saving…" : "Save draft"}</button>}
        {campaign?.status === "scheduled" && <button onClick={() => void cancelScheduled()} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600">Cancel schedule</button>}
      </div>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
          <div className="mb-3 text-[14px] font-semibold uppercase tracking-[.1em] text-[#92928b]">Campaign details</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Internal campaign name" value={name} onChange={setName} placeholder="Spring product update" />
            <label className="grid gap-1 text-[14px] font-medium text-[#686863]">Audience<select value={audienceId} onChange={(event) => setAudienceId(event.target.value)} disabled={!canEdit} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none dark:border-[#30302d] dark:bg-[#222220]"><option value="">Select an audience</option>{audiences.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <Input label="Subject line" value={subject} onChange={setSubject} placeholder="What’s new this week?" disabled={!canEdit} />
            <Input label="Preview text" value={previewText} onChange={setPreviewText} placeholder="A short inbox preview…" disabled={!canEdit} />
            <Input label="Sender name" value={fromName} onChange={setFromName} placeholder="Your brand" disabled={!canEdit} />
            <Input label="Sender email" value={fromEmail} onChange={setFromEmail} placeholder="hello@yourdomain.com" disabled={!canEdit} type="email" />
            <Input label="Reply-to address" value={replyTo} onChange={setReplyTo} placeholder="Optional" disabled={!canEdit} type="email" />
            <AudienceCount audienceId={audienceId} />
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-[#2a2a27]"><div><h2 className="text-[14px] font-semibold">Email design</h2><p className="mt-0.5 text-[13px] text-muted">Drag blocks to reorder. Content is rendered into responsive email HTML.</p></div><div className="flex gap-1 rounded-lg bg-[#f4f4f1] p-1 dark:bg-[#252523]"><button onClick={() => { if (htmlMode) { const next = { id: crypto.randomUUID(), type: "html" as const, content: htmlDraft }; setBlocks([next]); setSelectedId(next.id); } setHtmlMode(false); }} className={`rounded-md px-2.5 py-1 text-[13px] ${!htmlMode ? "bg-white shadow-sm dark:bg-[#373733]" : "text-muted"}`}>Visual</button><button onClick={() => { if (!htmlMode) setHtmlDraft(blocks.length === 1 && blocks[0].type === "html" ? blocks[0].content : renderEmail(blocks, footer)); setHtmlMode(true); }} className={`rounded-md px-2.5 py-1 text-[13px] ${htmlMode ? "bg-white shadow-sm dark:bg-[#373733]" : "text-muted"}`}>HTML</button></div></div>
          <div className="grid min-h-[550px] md:grid-cols-[190px_minmax(0,1fr)]">
            <div className="border-b border-line p-3 dark:border-[#2a2a27] md:border-b-0 md:border-r">
              <div className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[.1em] text-[#a0a098]">Content blocks</div>
              <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">{(["heading", "text", "image", "button", "divider", "columns", "social", "html"] as const).map((type) => <button key={type} onClick={() => addBlock(type)} disabled={!canEdit || htmlMode} className="flex h-8 items-center gap-2 rounded-md border border-line px-2 text-[13px] text-[#686863] hover:border-[#c5bfff] hover:bg-[#faf9ff] disabled:opacity-40 dark:border-[#30302d] dark:text-[#d1d1cb]"><BlockIcon type={type} />{type[0].toUpperCase() + type.slice(1)}<Plus size={11} className="ml-auto" /></button>)}</div>
              <p className="mt-4 px-1 text-[13px] leading-4 text-muted">Images use public image URLs. Never include sensitive personal information in custom HTML.</p>
            </div>
            {preview ? <div className="grid-paper flex justify-center overflow-auto p-5 sm:p-8"><div className={`email-preview min-h-[420px] overflow-hidden rounded-lg shadow-md transition-all ${mobile ? "w-[375px]" : "w-full max-w-[650px]"}`}><div className="flex justify-end gap-1 border-b bg-[#fafafa] p-2"><button onClick={() => setMobile(false)} aria-label="Desktop preview" className={`rounded p-1.5 ${!mobile ? "bg-white shadow-sm" : ""}`}><Monitor size={14} /></button><button onClick={() => setMobile(true)} aria-label="Mobile preview" className={`rounded p-1.5 ${mobile ? "bg-white shadow-sm" : ""}`}><Smartphone size={14} /></button></div><iframe title="Email preview" sandbox="" srcDoc={emailHtml} className="h-[630px] w-full border-0" /></div></div> :
              htmlMode ? <div className="p-3"><textarea value={htmlDraft} onChange={(event) => setHtmlDraft(event.target.value)} disabled={!canEdit} spellCheck={false} className="h-[520px] w-full resize-y rounded-lg border border-line bg-[#fbfbfa] p-3 font-mono text-[14px] leading-5 outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#1b1b19]" /></div> :
              <div className="grid min-h-[550px] lg:grid-cols-[minmax(0,1fr)_230px]">
                <div className="grid-paper flex justify-center overflow-auto p-4 sm:p-7"><div className="email-preview min-h-[400px] w-full max-w-[560px] rounded-lg p-6 shadow-sm sm:p-9">{blocks.map((block) => <div key={block.id} onClick={() => setSelectedId(block.id)} className={`relative cursor-pointer rounded-sm ${selectedId === block.id ? "outline outline-2 outline-[#8274ef] outline-offset-2" : "hover:outline hover:outline-1 hover:outline-[#c4bdf9]"}`}><BlockPreview block={block} /></div>)}</div></div>
                <div className="border-t border-line p-3 dark:border-[#2a2a27] lg:border-l lg:border-t-0">
                  <div className="mb-3 text-[13px] font-semibold uppercase tracking-[.1em] text-[#a0a098]">Layers & style</div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}><div className="space-y-1">{blocks.map((block) => <SortableBlock key={block.id} block={block} active={selectedId === block.id} select={() => setSelectedId(block.id)} remove={() => { setBlocks((items) => items.filter((item) => item.id !== block.id)); if (selectedId === block.id) setSelectedId(""); }} disabled={!canEdit} />)}</div></SortableContext></DndContext>
                  {selected && <div className="mt-4 border-t border-line pt-3 dark:border-[#2a2a27]"><div className="mb-2 text-[14px] font-semibold capitalize">{selected.type} settings</div><label className="grid gap-1 text-[13px] text-muted">{selected.type === "image" ? "Image URL" : selected.type === "button" ? "Button label" : selected.type === "html" ? "HTML markup" : "Content"}<textarea value={selected.content} onChange={(event) => changeBlock(selected.id, { content: event.target.value })} disabled={!canEdit} className="min-h-16 rounded-lg border border-line bg-white p-2 text-[14px] text-ink outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220] dark:text-white" /></label>
                    {(selected.type === "button" || selected.type === "image" || selected.type === "social") && <label className="mt-2 grid gap-1 text-[13px] text-muted">Link URL<input value={selected.url ?? ""} onChange={(event) => changeBlock(selected.id, { url: event.target.value })} disabled={!canEdit} className="h-8 rounded-lg border border-line bg-white px-2 text-[14px] dark:border-[#30302d] dark:bg-[#222220]" /></label>}
                    <div className="mt-2 grid grid-cols-2 gap-2"><ColorField label="Text color" value={selected.color ?? "#262626"} change={(color) => changeBlock(selected.id, { color })} /><ColorField label="Background" value={selected.background ?? "#ffffff"} change={(background) => changeBlock(selected.id, { background })} /></div>
                  </div>}
                </div>
              </div>}
          </div>
        </section>
        {canEdit && <div className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><h2 className="text-[14px] font-semibold">Delivery</h2><p className="mt-1 text-[14px] text-muted">Campaigns send through Resend to the selected Segment. Schedule times use your workspace timezone ({timeZone}). Opens can be affected by mail privacy features; delivery metrics update from verified webhooks.</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-[13px] text-muted">{campaign?.status === "scheduled" ? "New schedule time" : "Schedule (optional)"}<input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-xs dark:border-[#30302d] dark:bg-[#222220]" /></label><button onClick={() => void send()} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1d4ed8] px-4 text-xs font-medium text-white disabled:opacity-50"><Send size={14} />{campaign?.status === "scheduled" ? "Save & reschedule" : scheduleAt ? "Schedule campaign" : "Send campaign"}<ArrowRight size={13} /></button></div></div>}
        {notice && <div role="status" className="rounded-lg border border-[#d7e8df] bg-[#f1faf5] px-4 py-3 text-xs text-[#26714f]">{notice}</div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><h2 className="text-[14px] font-semibold">Before you send</h2><ul className="mt-3 space-y-3 text-[14px] text-muted"><Checklist done={Boolean(name.trim())} label="Name your campaign" /><Checklist done={Boolean(subject.trim())} label="Add a subject line" /><Checklist done={Boolean(fromEmail.trim())} label="Set a sender address" /><Checklist done={Boolean(audienceId)} label="Choose an audience" /><Checklist done={blocks.length > 0 || htmlMode} label="Design your email" /></ul></div>
        <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4 dark:border-[#332e52] dark:bg-[#211e30]"><h3 className="text-[14px] font-semibold text-[#1e40af] dark:text-[#bfdbfe]">Marketing compliance</h3><p className="mt-1.5 text-[13px] leading-4 text-[#7065ad] dark:text-[#b2aaf1]">Resend’s unsubscribe placeholder is included automatically. Add your company mailing address under Settings before sending. Contacts with unsubscribe, bounce, or complaint status are excluded from local audience counts; Resend applies its own suppressions.</p></div>
        {campaign?.status === "scheduled" && campaign.scheduled_at && <div className="rounded-xl border border-line bg-white p-4 text-[14px] dark:border-[#2a2a27] dark:bg-[#171716]"><div className="font-semibold">Scheduled for</div><div className="mt-1 text-muted">{new Date(campaign.scheduled_at).toLocaleString()}</div></div>}
      </aside>
    </div>
  </div>;
}

function renderEmail(blocks: Block[], footer: string) {
  if (blocks.length === 1 && blocks[0].type === "html" && /<html\b/i.test(blocks[0].content)) return blocks[0].content;
  const content = blocks.map((block) => {
    const style = `color:${block.color || "#262626"};background:${block.background || "transparent"};`;
    switch (block.type) {
      case "heading": return `<h1 style="font:700 30px/1.25 Arial,sans-serif;letter-spacing:-.04em;margin:0 0 18px;${style}">${escapeHtml(block.content)}</h1>`;
      case "text": return `<p style="font:16px/1.65 Arial,sans-serif;margin:0 0 22px;${style}">${escapeHtml(block.content).replaceAll("\n", "<br>")}</p>`;
      case "image": return `<img src="${escapeAttr(block.content)}" alt="" style="display:block;width:100%;height:auto;border-radius:8px;margin:8px 0 22px" />`;
      case "button": return `<p style="margin:22px 0"><a href="${safeUrl(block.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:13px 20px;border-radius:7px;text-decoration:none;font:600 14px Arial,sans-serif">${escapeHtml(block.content)}</a></p>`;
      case "divider": return '<hr style="border:0;border-top:1px solid #e8e8e5;margin:24px 0" />';
      case "columns": { const [left, right] = block.content.split("|"); return `<table role="presentation" width="100%" style="margin:16px 0"><tr><td width="50%" style="padding:10px;vertical-align:top;font:14px/1.5 Arial,sans-serif">${escapeHtml(left ?? "")}</td><td width="50%" style="padding:10px;vertical-align:top;font:14px/1.5 Arial,sans-serif">${escapeHtml(right ?? "")}</td></tr></table>`; }
      case "social": { const [label, url] = block.content.split("|"); return `<p style="margin:16px 0;font:13px Arial,sans-serif"><a href="${safeUrl(block.url || url)}" style="color:#1d4ed8">${escapeHtml(label || "Follow us")}</a></p>`; }
      case "html": return block.content;
    }
  }).join("\n");
  const footerContent = footer ? `${escapeHtml(footer).replaceAll("\n", "<br>")}<br>` : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>@media(max-width:600px){.email-content{padding:24px!important}}</style></head><body style="margin:0;background:#f6f6f3;padding:24px 12px"><div class="email-content" style="max-width:600px;margin:0 auto;padding:40px;background:#fff;border-radius:10px;font-family:Arial,sans-serif">${content}<p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #eee;color:#888;font:11px/1.5 Arial,sans-serif">${footerContent}You received this message because you subscribed to our updates.<br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#1d4ed8">Unsubscribe</a></p><span style="display:none" data-campaign-studio-footer="true"></span></div></body></html>`;
}
function textFromBlocks(blocks: Block[]) { return blocks.filter((block) => ["heading", "text", "button"].includes(block.type)).map((block) => block.type === "button" ? `${block.content}: ${block.url ?? ""}` : block.content).join("\n\n"); }
function htmlToText(html: string) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function escapeHtml(text: string) { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeAttr(text?: string) { return safeUrl(text); }
function safeUrl(text?: string) { const url = text ?? ""; return /^https?:\/\//i.test(url) ? escapeHtml(url) : "#"; }
function Input({ label, value, onChange, placeholder, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return <label className="grid gap-1 text-[14px] font-medium text-[#686863]">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] disabled:bg-[#f8f8f6] dark:border-[#30302d] dark:bg-[#222220] dark:disabled:bg-[#1c1c1a]" /></label>;
}
function BlockIcon({ type }: { type: Block["type"] }) {
  if (type === "heading" || type === "text") return <Type size={13} />;
  if (type === "image") return <ImageIcon size={13} />;
  if (type === "button" || type === "social") return <Link2 size={13} />;
  return <span className="text-[14px]">{type === "divider" ? "—" : type === "columns" ? "▥" : "<>"}</span>;
}
function BlockPreview({ block }: { block: Block }) {
  if (block.type === "heading") return <h2 style={{ color: block.color, background: block.background }} className="mb-4 text-[24px] font-bold leading-tight tracking-[-.04em]">{block.content}</h2>;
  if (block.type === "text") return <p style={{ color: block.color, background: block.background }} className="mb-5 whitespace-pre-wrap text-[13px] leading-6">{block.content}</p>;
  // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote email images; next/image optimization does not apply to email previews
  if (block.type === "image") return <img src={block.content} alt="" className="mb-5 w-full rounded-md" />;
  if (block.type === "button") return <div className="mb-5"><span style={{ color: block.color, background: block.background === "#ffffff" ? "#1d4ed8" : block.background }} className="inline-block rounded-md px-4 py-2.5 text-[14px] font-semibold text-white">{block.content}</span></div>;
  if (block.type === "divider") return <hr className="my-5 border-0 border-t border-[#e8e8e5]" />;
  if (block.type === "columns") return <div className="mb-4 grid grid-cols-2 gap-3 text-xs">{block.content.split("|").map((text, index) => <div key={index} className="rounded bg-[#f7f7f5] p-3">{text}</div>)}</div>;
  if (block.type === "social") return <p className="mb-4 text-xs text-[#1d4ed8] underline">{block.content.split("|")[0]}</p>;
  return <iframe title="Custom HTML block" sandbox="" srcDoc={block.content} className="mb-4 min-h-[360px] w-full rounded border-0" />;
}
function SortableBlock({ block, active, select, remove, disabled }: { block: Block; active: boolean; select: () => void; remove: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id, disabled });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex h-8 items-center gap-1 rounded-md border px-1.5 ${active ? "border-[#afa5ff] bg-[#f5f3ff] dark:bg-[#29243d]" : "border-transparent hover:bg-[#f7f7f5] dark:hover:bg-[#222220]"}`}>
    <button disabled={disabled} {...attributes} {...listeners} aria-label="Drag to reorder" className="cursor-grab text-[#a6a69e]"><GripVertical size={13} /></button><button onClick={select} className="flex-1 truncate text-left text-[13px] capitalize">{block.type}</button><button disabled={disabled} onClick={remove} aria-label={`Remove ${block.type}`} className="rounded p-1 text-[#a6a69e] hover:text-red-500"><Trash2 size={11} /></button>
  </div>;
}
function ColorField({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <label className="grid gap-1 text-[12px] text-muted">{label}<input type="color" value={value} onChange={(event) => change(event.target.value)} className="h-7 w-full cursor-pointer rounded border border-line bg-white p-1 dark:border-[#30302d] dark:bg-[#222220]" /></label>;
}
function Checklist({ done, label }: { done: boolean; label: string }) {
  return <li className="flex items-center gap-2"><span className={`grid size-4 place-items-center rounded-full text-[12px] ${done ? "bg-[#eaf7f1] text-[#26815f]" : "bg-[#f2f2ef] text-[#a3a39c]"}`}>{done ? "✓" : "·"}</span><span className={done ? "text-[#51514b]" : ""}>{label}</span></li>;
}
function AudienceCount({ audienceId }: { audienceId: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!audienceId) { setCount(null); return; }
    let active = true;
    fetch(`/api/audiences/${audienceId}/count`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load count.");
      if (active) setCount(result.count as number);
    }).catch(() => { if (active) setCount(-1); });
    return () => { active = false; };
  }, [audienceId]);
  return <div className="flex items-end pb-2 text-[13px] text-muted">Estimated recipients: {!audienceId ? "Select an audience" : count === null ? "Loading…" : count < 0 ? "Count unavailable" : `${count} subscribed contacts`}</div>;
}
function toTimeZoneInput(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function fromTimeZoneInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid schedule time.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const wanted = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText));
  let timestamp = wanted;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const representedAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    const difference = wanted - representedAsUtc;
    timestamp += difference;
    if (difference === 0) return new Date(timestamp).toISOString();
  }
  throw new Error("That local time does not exist in your workspace timezone because of a daylight-saving transition.");
}
