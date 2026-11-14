"use client";

import { useState } from "react";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

type Template = { id: string; name: string; subject: string; html: string; created_at: string };
export function TemplatesManager({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initial); const [name, setName] = useState(""); const [subject, setSubject] = useState(""); const [html, setHtml] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, subject, html }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save template."); setTemplates((items) => [result.template, ...items]); setName(""); setSubject(""); setHtml(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save template."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    const response = await fetch(`/api/templates/${id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) { setError(result.error ?? "Could not delete template."); return; }
    setTemplates((items) => items.filter((item) => item.id !== id));
  }
  return <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
    <div className="grid content-start gap-3 sm:grid-cols-2">{templates.map((template) => <div key={template.id} className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><div className="grid h-36 place-items-center bg-[#f7f7f5] dark:bg-[#222220]"><div className="w-[70%] rounded bg-white p-4 shadow-sm dark:bg-[#30302d]"><div className="h-2 w-1/2 rounded bg-[#d8d4fa]" /><div className="mt-3 h-1 w-full rounded bg-[#e7e7e2]" /><div className="mt-1.5 h-1 w-4/5 rounded bg-[#e7e7e2]" /><div className="mt-3 h-4 w-1/3 rounded bg-[#1d4ed8]" /></div></div><div className="flex items-center gap-2 p-4"><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{template.name}</div><div className="mt-1 truncate text-[13px] text-muted">{template.subject || "No subject line"}</div></div><Link href={`/campaigns/new?template=${template.id}`} className="rounded-md border border-line px-2.5 py-1.5 text-[13px] font-medium dark:border-[#30302d]">Use</Link><button onClick={() => void remove(template.id)} aria-label="Delete template" className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div>)}
      {!templates.length && <div className="col-span-full grid min-h-[230px] place-items-center rounded-xl border border-dashed border-line text-center dark:border-[#343430]"><div><BookOpenText className="mx-auto text-muted" size={22} /><div className="mt-3 text-[13px] font-semibold">No saved templates</div><p className="mt-1 text-[14px] text-muted">Save a reusable design to get started.</p><Link href="/campaigns/new" className="mt-3 inline-flex h-8 items-center rounded-lg bg-[#1d4ed8] px-3 text-[14px] font-medium text-white">Design a campaign</Link></div></div>}
    </div>
    <form onSubmit={create} className="h-fit rounded-xl border border-line bg-white p-5 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]"><h2 className="text-[13px] font-semibold">Save a template</h2><p className="mt-1 text-[14px] text-muted">Paste existing email HTML or use a campaign design.</p><label className="mt-4 grid gap-1 text-[14px] font-medium text-[#686863]">Template name<input required value={name} onChange={(event) => setName(event.target.value)} className="h-9 rounded-lg border border-line bg-white px-3 text-xs dark:border-[#30302d] dark:bg-[#222220]" /></label><label className="mt-3 grid gap-1 text-[14px] font-medium text-[#686863]">Default subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-9 rounded-lg border border-line bg-white px-3 text-xs dark:border-[#30302d] dark:bg-[#222220]" /></label><label className="mt-3 grid gap-1 text-[14px] font-medium text-[#686863]">Email HTML<textarea required value={html} onChange={(event) => setHtml(event.target.value)} className="min-h-40 rounded-lg border border-line bg-white p-3 font-mono text-[13px] dark:border-[#30302d] dark:bg-[#222220]" /></label>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<button disabled={busy} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1d4ed8] px-3.5 text-xs font-medium text-white"><Plus size={14} />{busy ? "Saving…" : "Save template"}</button></form>
  </div>;
}
