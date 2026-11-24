"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Download, ListPlus, LoaderCircle, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { DESKTOP_MAX_BULK_CONTACTS, useIsDesktopApp } from "@/lib/desktop-app";
import { extractEmails } from "@/lib/email-list";

// The desktop app loads and shows contacts in bigger pages than the website.
const WEB_PAGE_SIZE = 100;
const DESKTOP_PAGE_SIZE = 500;
const ROW_RENDER_STEP = 500;

type ContactEmail = { id: string; email: string; status: string; consent_at: string | null; consent_source: string | null; is_primary: boolean };
type Contact = { id: string; email: string; first_name: string | null; last_name: string | null; status: string; tags: string[]; created_at: string; audience_id: string | null; consent_at?: string | null; consent_source?: string | null; contact_emails?: ContactEmail[] };
type Audience = { id: string; name: string };

export function ContactsTable({ contacts: initial, totalCount: initialCount, audiences }: { contacts: Contact[]; totalCount: number; audiences: Audience[] }) {
  const [contacts, setContacts] = useState(initial);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [loadedOffset, setLoadedOffset] = useState(initial.length);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [audience, setAudience] = useState("all");
  const [tag, setTag] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importAudienceId, setImportAudienceId] = useState("");
  const desktop = useIsDesktopApp();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [visibleRows, setVisibleRows] = useState(ROW_RENDER_STEP);
  const filtered = useMemo(() => contacts.filter((contact) => {
    const addresses = contact.contact_emails?.length ? contact.contact_emails : [{ email: contact.email, status: contact.status }];
    const matchesText = `${addresses.map((item) => item.email).join(" ")} ${contact.first_name ?? ""} ${contact.last_name ?? ""} ${contact.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (status === "all" || addresses.some((address) => address.status === status))
      && (audience === "all" || contact.audience_id === audience)
      && (tag === "all" || contact.tags.includes(tag));
  }), [contacts, query, status, audience, tag]);
  const tags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort();

  async function exportCsv() {
    setNotice("");
    try {
      const response = await fetch("/api/contacts/export");
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Could not export contacts."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "mymailmarket-contacts.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export contacts."); }
  }
  async function loadMore(all = false) {
    setBusy(true); setNotice("");
    const pageSize = desktop ? DESKTOP_PAGE_SIZE : WEB_PAGE_SIZE;
    // "Load all" stops at the desktop limit so the window stays responsive.
    const target = all ? Math.min(totalCount, DESKTOP_MAX_BULK_CONTACTS) : loadedOffset + pageSize;
    let offset = loadedOffset;
    try {
      while (offset < target) {
        const response = await fetch(`/api/contacts?offset=${offset}&limit=${Math.min(pageSize, target - offset)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load more contacts.");
        if (!result.contacts.length) break;
        offset += result.contacts.length;
        setContacts((previous) => [...previous, ...result.contacts]);
        setLoadedOffset(offset);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load more contacts."); }
    finally { setBusy(false); }
  }

  async function deleteContact(contact: Contact) {
    if (!window.confirm(`Delete ${contact.email} from your contact list?`)) return;
    setDeletingId(contact.id);
    setNotice("");
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete contact.");
      setContacts((previous) => previous.filter((item) => item.id !== contact.id));
      setTotalCount((total) => Math.max(0, total - 1));
      setLoadedOffset((offset) => Math.max(0, offset - 1));
      setNotice(result.warning ?? `Deleted ${contact.email} from your contact list.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete contact.");
    } finally {
      setDeletingId(null);
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setNotice("");
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("CSV needs a header row and at least one contact.");
      const header = rows[0].map((cell) => cell.trim().toLowerCase());
      const emailIndex = header.indexOf("email");
      if (emailIndex < 0) throw new Error("CSV must include an email column.");
      const contactsToImport = rows.slice(1).filter((row) => row[emailIndex]?.trim()).map((row) => ({
        email: row[emailIndex].trim(), firstName: row[header.indexOf("first_name")]?.trim() ?? "",
        lastName: row[header.indexOf("last_name")]?.trim() ?? "", tags: (row[header.indexOf("tags")] ?? "").split("|").filter(Boolean),
      }));
      if (importAudienceId) contactsToImport.forEach((contact) => Object.assign(contact, { audienceId: importAudienceId }));
      let totalCreated = 0; let totalDuplicates = 0; const createdContacts: Contact[] = []; const warnings: string[] = [];
      for (let offset = 0; offset < contactsToImport.length; offset += 500) {
        const response = await fetch("/api/contacts/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contacts: contactsToImport.slice(offset, offset + 500) }) });
        const result = await response.json();
        if (!response.ok) throw new Error(`Imported ${totalCreated} before stopping: ${result.error ?? "import failed."}`);
        totalCreated += result.created; totalDuplicates += result.duplicates; createdContacts.push(...result.contacts); if (result.warning) warnings.push(result.warning);
      }
      setContacts((previous) => [...createdContacts, ...previous]);
      setTotalCount((total) => total + totalCreated);
      setLoadedOffset((offset) => offset + totalCreated);
      setNotice(`Imported ${totalCreated} contacts as pending consent; they cannot receive campaigns until consent is recorded. ${totalDuplicates} existing email addresses were skipped.${warnings[0] ? ` ${warnings[0]}` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not import this file."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  return <div className="overflow-hidden rounded-xl border border-line bg-white shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
    <div className="flex flex-col gap-3 border-b border-line p-4 dark:border-[#2a2a27] sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-[330px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a2a29b]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={contacts.length < totalCount ? "Search loaded contacts..." : "Search contacts..."} className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#191918]" /></div>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-line bg-white px-3 text-xs text-[#575750] outline-none dark:border-[#30302d] dark:bg-[#191918] dark:text-[#d1d1cb]"><option value="all">All statuses</option><option value="subscribed">Subscribed</option><option value="pending_consent">Pending consent</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option><option value="complained">Complained</option></select>
      <select value={audience} onChange={(event) => setAudience(event.target.value)} aria-label="Filter by audience" className="h-9 rounded-lg border border-line bg-white px-3 text-xs text-[#575750] outline-none dark:border-[#30302d] dark:bg-[#191918] dark:text-[#d1d1cb]"><option value="all">All audiences</option>{audiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter by tag" className="h-9 rounded-lg border border-line bg-white px-3 text-xs text-[#575750] outline-none dark:border-[#30302d] dark:bg-[#191918] dark:text-[#d1d1cb]"><option value="all">All tags</option>{tags.map((item) => <option key={item}>{item}</option>)}</select>
      <div className="flex gap-2 sm:ml-auto">
        <select value={importAudienceId} onChange={(event) => setImportAudienceId(event.target.value)} aria-label="CSV import audience" className="h-9 max-w-[150px] rounded-lg border border-line bg-white px-2 text-[13px] dark:border-[#30302d] dark:bg-[#191918]"><option value="">No audience</option>{audiences.map((item) => <option key={item.id} value={item.id}>Import to {item.name}</option>)}</select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium hover:bg-[#fafaf8] dark:border-[#30302d] dark:hover:bg-[#222220]"><Upload size={14} /> Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={busy} /></label>
        <button onClick={() => void exportCsv()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium hover:bg-[#fafaf8] dark:border-[#30302d] dark:hover:bg-[#222220]"><Download size={14} /> Export all</button>
        {desktop && <button onClick={() => setBulkOpen(true)} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#bfd3fb] bg-[#eef3ff] px-3 text-xs font-medium text-[#1e40af] hover:bg-[#e0eaff] disabled:opacity-50 dark:border-[#2a3a60] dark:bg-[#1a2440] dark:text-[#bcd0ff]"><ListPlus size={14} /> Bulk add</button>}
        <button onClick={() => setModal(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1d4ed8] px-3 text-xs font-medium text-white hover:bg-[#1e40af]"><Plus size={14} /> Add contact</button>
      </div>
    </div>
    {notice && <div role="status" className="flex items-center justify-between border-b border-line bg-[#f7f6ff] px-4 py-2.5 text-xs text-[#1e40af] dark:border-[#2a2a27] dark:bg-[#211e30]"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14} /></button></div>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left">
        <thead className="bg-[#fbfbfa] text-[13px] font-medium uppercase tracking-[.08em] text-[#94948d] dark:bg-[#1b1b19]"><tr><th className="px-5 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Address status</th><th className="px-4 py-3 font-medium">Consent</th><th className="px-4 py-3 font-medium">Audience</th><th className="px-4 py-3 font-medium">Tags</th><th className="px-4 py-3 text-right font-medium">Added</th><th className="px-3 py-3" /></tr></thead>
        <tbody className="divide-y divide-line dark:divide-[#2a2a27]">
          {filtered.slice(0, visibleRows).map((contact) => {
            const addresses = contact.contact_emails?.length ? contact.contact_emails : [{
              id: contact.email, email: contact.email, status: contact.status,
              consent_at: contact.consent_at ?? null, consent_source: contact.consent_source ?? null, is_primary: true,
            }];
            const statuses = [...new Set(addresses.map((address) => address.status))];
            const overallStatus = statuses.length > 1 ? "mixed" : statuses[0] ?? contact.status;
            return <tr key={contact.id} className="transition hover:bg-[#fcfcfb] dark:hover:bg-[#1b1b19]"><td className="px-5 py-3"><div className="flex items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#f1eee8] text-[13px] font-semibold text-[#726a58]">{(contact.first_name?.[0] ?? contact.email[0]).toUpperCase()}</span><div><div className="text-[14px] font-medium">{[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—"}</div><div className="mt-1 space-y-1">{addresses.map((address) => <div key={address.id} className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted"><span>{address.email}{address.is_primary ? " · Primary" : ""}</span><Status value={address.status} /></div>)}</div></div></div></td><td className="px-4 py-3"><Status value={overallStatus} /></td><td className="px-4 py-3 text-[13px] text-muted">{addresses.map((address) => <div key={address.id} title={address.consent_source ?? "No consent record"}>{address.consent_at ? new Date(address.consent_at).toLocaleDateString() : "—"}<div className="max-w-[120px] truncate text-[12px]">{address.consent_source || ""}</div></div>)}</td><td className="px-4 py-3 text-[14px] text-muted">{audiences.find((item) => item.id === contact.audience_id)?.name ?? "—"}</td><td className="px-4 py-3"><div className="flex gap-1">{contact.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md bg-[#f3f3f0] px-2 py-1 text-[13px] text-[#71716b] dark:bg-[#282826] dark:text-[#d0d0ca]">{tag}</span>)}{contact.tags.length > 3 && <span className="px-1 text-[13px] text-muted">+{contact.tags.length - 3}</span>}</div></td><td className="px-4 py-3 text-right text-[14px] text-muted">{new Date(contact.created_at).toLocaleDateString()}</td><td className="px-3 py-3"><div className="flex items-center gap-1"><button onClick={() => setEditing(contact)} aria-label={`Edit ${contact.email}`} className="rounded-md p-1.5 text-muted hover:bg-[#f1f1ee] hover:text-ink dark:hover:bg-[#282826]"><Pencil size={13} /></button><button onClick={() => void deleteContact(contact)} disabled={deletingId === contact.id} aria-label={`Delete ${contact.email}`} title="Delete contact" className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-[#35201e]">{deletingId === contact.id ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}</button></div></td></tr>;
          })}
          {!filtered.length && <tr><td colSpan={7} className="px-5 py-16 text-center"><div className="text-[13px] font-medium">{contacts.length ? "No contacts match your filters" : "Your contact list is ready"}</div><div className="mt-1 text-[14px] text-muted">{contacts.length ? "Try a different search or status." : "Add a contact or import your existing subscribers."}</div></td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex flex-col gap-2 border-t border-line px-5 py-3 text-[14px] text-muted dark:border-[#2a2a27] sm:flex-row sm:items-center sm:justify-between"><span>Showing {formatNumber(filtered.length)} of {formatNumber(contacts.length)} loaded · {formatNumber(totalCount)} total</span><span>CSV imports stay pending consent and are not eligible for campaigns.</span></div>
    {filtered.length > visibleRows && <div className="border-t border-line p-3 text-center dark:border-[#2a2a27]"><button onClick={() => setVisibleRows((rows) => rows + ROW_RENDER_STEP)} className="h-8 rounded-lg border border-line px-3 text-[14px] font-medium dark:border-[#30302d]">Show {formatNumber(Math.min(ROW_RENDER_STEP, filtered.length - visibleRows))} more rows ({formatNumber(filtered.length - visibleRows)} hidden)</button></div>}
    {contacts.length < totalCount && <div className="flex flex-wrap justify-center gap-2 border-t border-line p-3 text-center dark:border-[#2a2a27]">
      <button disabled={busy} onClick={() => void loadMore()} className="h-8 rounded-lg border border-line px-3 text-[14px] font-medium disabled:opacity-50 dark:border-[#30302d]">{busy ? `Loading… ${formatNumber(contacts.length)} loaded` : `Load more contacts (${formatNumber(totalCount - contacts.length)} remaining)`}</button>
      {desktop && contacts.length < DESKTOP_MAX_BULK_CONTACTS && <button disabled={busy} onClick={() => void loadMore(true)} className="h-8 rounded-lg border border-[#bfd3fb] bg-[#eef3ff] px-3 text-[14px] font-medium text-[#1e40af] disabled:opacity-50 dark:border-[#2a3a60] dark:bg-[#1a2440] dark:text-[#bcd0ff]">Load all{totalCount > DESKTOP_MAX_BULK_CONTACTS ? ` (first ${formatNumber(DESKTOP_MAX_BULK_CONTACTS)})` : ""}</button>}
    </div>}
    {bulkOpen && <BulkAddModal audiences={audiences} close={() => setBulkOpen(false)} added={(created, summary) => { setContacts((previous) => [...created, ...previous]); setTotalCount((total) => total + created.length); setLoadedOffset((offset) => offset + created.length); setNotice(summary); }} />}
    {modal && <ContactModal audiences={audiences} close={() => setModal(false)} created={(contact, warning) => { setContacts((previous) => [contact, ...previous]); setTotalCount((total) => total + 1); setLoadedOffset((offset) => offset + 1); setNotice(warning ?? "Contact added."); setModal(false); }} />}
    {editing && <ContactModal contact={editing} audiences={audiences} close={() => setEditing(null)} created={(updated, warning) => { setContacts((previous) => previous.map((contact) => contact.id === updated.id ? updated : contact)); setNotice(warning ?? "Contact updated."); setEditing(null); }} />}
  </div>;
}

function ContactModal({ audiences, close, created, contact }: { audiences: Audience[]; close: () => void; created: (contact: Contact, warning?: string) => void; contact?: Contact }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        firstName: String(form.get("firstName") ?? ""), lastName: String(form.get("lastName") ?? ""),
        tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        ...(contact ? {} : {
          emails: String(form.get("emails") ?? "").split(/[,\s;]+/).map((email) => email.trim()).filter(Boolean),
          audienceId: form.get("audienceId") || null,
          consent: form.get("consent") === "on",
          consentSource: form.get("consentSource"),
        }),
      };
      const response = await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts", { method: contact ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save contact.");
      if (!contact && !result.contact) throw new Error("These email addresses are already in your contact list.");
      created(result.contact, result.warning);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save contact."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form onSubmit={submit} className="w-full max-w-[470px] rounded-2xl border border-line bg-white p-5 shadow-xl dark:border-[#30302d] dark:bg-[#191918]">
      <div className="mb-5 flex items-start justify-between"><div><h2 className="text-[16px] font-semibold">{contact ? "Edit contact" : "Add a contact"}</h2><p className="mt-1 text-[14px] text-muted">{contact ? "Update profile details and tags. Subscription status can only change through consent or suppression events." : "Add one or more email addresses for this contact."}</p></div><button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-muted"><X size={17} /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="firstName" label="First name" defaultValue={contact?.first_name ?? ""} /><Field name="lastName" label="Last name" defaultValue={contact?.last_name ?? ""} />
        {!contact && <><label className="grid gap-1 text-[14px] font-medium text-[#686863] sm:col-span-2">Email addresses<textarea name="emails" required rows={3} placeholder={"name@example.com\nother@example.com"} className="rounded-lg border border-line bg-white px-3 py-2 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /><span className="text-[13px] font-normal text-muted">Add up to 100 addresses, separated by commas, spaces, or new lines.</span></label>
        <label className="grid gap-1 text-[14px] font-medium text-[#686863] sm:col-span-2">Audience<select name="audienceId" className="h-9 rounded-lg border border-line bg-white px-3 text-xs dark:border-[#30302d] dark:bg-[#222220]"><option value="">No audience</option>{audiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
        <Field name="tags" label="Tags (comma separated)" defaultValue={contact?.tags.join(", ") ?? ""} className="sm:col-span-2" />
        {!contact && <Field name="consentSource" label="Consent source (e.g. signup form)" required className="sm:col-span-2" />}
      </div>
      {!contact && <label className="mt-4 flex cursor-pointer items-start gap-2 text-[14px] leading-5 text-[#6e6e67]"><input name="consent" type="checkbox" required className="mt-1 accent-[#1d4ed8]" />I confirm each email address above has permission to receive marketing emails.</label>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} className="h-9 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]">Cancel</button><button disabled={busy} className="h-9 rounded-lg bg-[#1d4ed8] px-4 text-xs font-medium text-white disabled:opacity-60">{busy ? "Saving…" : contact ? "Save changes" : "Add contact"}</button></div>
    </form>
  </div>;
}

// Each request stays small because the server copies every new address to Resend before it answers.
const BULK_CHUNK = 50;

function BulkAddModal({ audiences, close, added }: { audiences: Audience[]; close: () => void; added: (contacts: Contact[], summary: string) => void }) {
  const [text, setText] = useState("");
  const [audienceId, setAudienceId] = useState("");
  const [tags, setTags] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; created: number; skipped: number } | null>(null);
  const cancelled = useRef(false);
  const emails = useMemo(() => extractEmails(text), [text]);
  const overLimit = emails.length > DESKTOP_MAX_BULK_CONTACTS;
  const running = !!progress && progress.done < progress.total;

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const content = (await file.text()).replace(/^﻿/, "");
    setText((previous) => previous ? `${previous}\n${content}` : content);
    event.target.value = "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!emails.length) { setError("Paste or load at least one email address."); return; }
    if (overLimit) { setError(`You can add up to ${formatNumber(DESKTOP_MAX_BULK_CONTACTS)} addresses at a time.`); return; }
    cancelled.current = false;
    const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30);
    const created: Contact[] = []; const warnings: string[] = []; let skipped = 0;
    setProgress({ done: 0, total: emails.length, created: 0, skipped: 0 });
    for (let offset = 0; offset < emails.length; offset += BULK_CHUNK) {
      if (cancelled.current) break;
      const chunk = emails.slice(offset, offset + BULK_CHUNK);
      try {
        const response = await fetch("/api/contacts", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ contacts: chunk.map((email) => ({ email, audienceId: audienceId || null, tags: tagList })), consent: true, consentSource }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not add these contacts.");
        created.push(...(result.contacts ?? [])); skipped += result.duplicates ?? 0;
        if (result.warning) warnings.push(result.warning);
      } catch (reason) {
        setError(`Stopped after adding ${formatNumber(created.length)}: ${reason instanceof Error ? reason.message : "request failed."}`);
        break;
      }
      setProgress({ done: Math.min(offset + chunk.length, emails.length), total: emails.length, created: created.length, skipped });
    }
    const summary = `Added ${formatNumber(created.length)} contacts.${skipped ? ` ${formatNumber(skipped)} already existed and were skipped.` : ""}${cancelled.current ? " Stopped before the end." : ""}${warnings[0] ? ` ${warnings[0]}` : ""}`;
    added(created, summary);
    if (!cancelled.current && created.length + skipped >= emails.length) close();
  }

  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !running) close(); }}>
    <form onSubmit={submit} className="w-full max-w-[560px] rounded-2xl border border-line bg-white p-5 shadow-xl dark:border-[#30302d] dark:bg-[#191918]">
      <div className="mb-4 flex items-start justify-between"><div><h2 className="text-[16px] font-semibold">Bulk add contacts</h2><p className="mt-1 text-[14px] text-muted">Paste up to {formatNumber(DESKTOP_MAX_BULK_CONTACTS)} email addresses, or load a .txt or .csv file. Each address becomes its own subscribed contact.</p></div><button type="button" aria-label="Close" disabled={running} onClick={close} className="rounded-md p-1 text-muted disabled:opacity-40"><X size={17} /></button></div>
      <label className="grid gap-1 text-[14px] font-medium text-[#686863]">Email addresses
        <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={running} rows={7} placeholder={"name@example.com\nother@example.com, third@example.com"} className="rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" />
      </label>
      <div className="mt-1.5 flex items-center justify-between text-[13px]">
        <span className={overLimit ? "font-medium text-red-600" : "text-muted"}>{formatNumber(emails.length)} unique address{emails.length === 1 ? "" : "es"} found{overLimit ? ` — limit is ${formatNumber(DESKTOP_MAX_BULK_CONTACTS)}` : ""}</span>
        <label className="cursor-pointer font-medium text-[#1e40af] hover:underline">Load file…<input type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={loadFile} disabled={running} /></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[14px] font-medium text-[#686863]">Audience<select value={audienceId} onChange={(event) => setAudienceId(event.target.value)} disabled={running} className="h-9 rounded-lg border border-line bg-white px-3 text-xs dark:border-[#30302d] dark:bg-[#222220]"><option value="">No audience</option>{audiences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-[14px] font-medium text-[#686863]">Tags (comma separated)<input value={tags} onChange={(event) => setTags(event.target.value)} disabled={running} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /></label>
        <label className="grid gap-1 text-[14px] font-medium text-[#686863] sm:col-span-2">Consent source (e.g. signup form)<input value={consentSource} onChange={(event) => setConsentSource(event.target.value)} required minLength={2} maxLength={200} disabled={running} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /></label>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-[14px] leading-5 text-[#6e6e67]"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={running} className="mt-1 accent-[#1d4ed8]" />I confirm every address above has permission to receive marketing emails.</label>
      {progress && <div className="mt-4">
        <div className="flex justify-between text-[13px] text-muted tabular-nums"><span>{running ? "Adding contacts…" : "Finished"} {formatNumber(progress.done)} of {formatNumber(progress.total)}</span><span>{percent}%</span></div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#eef1f5] dark:bg-[#262624]"><div className="h-full rounded-full bg-[#1d4ed8] transition-[width] duration-500" style={{ width: `${percent}%` }} /></div>
        <div className="mt-1.5 text-[12px] text-muted tabular-nums">{formatNumber(progress.created)} added · {formatNumber(progress.skipped)} already existed</div>
      </div>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        {running ? <button type="button" onClick={() => { cancelled.current = true; }} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600">Stop</button>
          : <button type="button" onClick={close} className="h-9 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]">Cancel</button>}
        <button disabled={running || !emails.length || overLimit} className="h-9 rounded-lg bg-[#1d4ed8] px-4 text-xs font-medium text-white disabled:opacity-60">{running ? "Adding…" : `Add ${formatNumber(emails.length)} contact${emails.length === 1 ? "" : "s"}`}</button>
      </div>
    </form>
  </div>;
}

function Field({ name, label, type = "text", required = false, className = "", defaultValue = "" }: { name: string; label: string; type?: string; required?: boolean; className?: string; defaultValue?: string }) {
  return <label className={`grid gap-1 text-[14px] font-medium text-[#686863] ${className}`}>{label}<input name={name} type={type} required={required} defaultValue={defaultValue} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" /></label>;
}
function Status({ value }: { value: string }) {
  const colors: Record<string, string> = { subscribed: "bg-[#eaf7f1] text-[#26815f]", pending_consent: "bg-amber-50 text-amber-800", mixed: "bg-[#f3f3f0] text-[#73736c]", unsubscribed: "bg-[#f3f3f0] text-[#73736c]", bounced: "bg-[#fff0ef] text-[#c35a52]", complained: "bg-[#fff0ef] text-[#c35a52]" };
  return <span className={`rounded-full px-2 py-1 text-[13px] capitalize ${colors[value] ?? colors.unsubscribed}`}>{value}</span>;
}
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(value); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows.filter((item) => item.some((cell) => cell.trim()));
}
