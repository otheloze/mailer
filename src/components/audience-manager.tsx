"use client";

import { useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Trash2, UsersRound, X } from "lucide-react";
import { EmptyState } from "@/components/app-shell";

type Audience = { id: string; name: string; resend_segment_id: string | null; created_at: string };
export function AudienceManager({ audiences: initial, counts }: { audiences: Audience[]; counts: Record<string, number> }) {
  const [audiences, setAudiences] = useState(initial); const [name, setName] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<Audience | null>(null);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/audiences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not create audience.");
      setAudiences((old) => [result.audience, ...old]); setName("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create audience."); }
    finally { setBusy(false); }
  }
  const countFor = (id: string) => counts[id] ?? 0;
  async function sync(id: string) {
    setSyncing(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/audiences/${id}/sync`, { method: "POST" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sync this audience.");
      setAudiences((items) => items.map((item) => item.id === id ? { ...item, resend_segment_id: result.segmentId } : item));
      setNotice(`Synced ${result.synced} contacts to Resend.${result.warning ? ` Some contacts need attention: ${result.warning}` : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sync this audience."); }
    finally { setSyncing(null); }
  }
  return <div>
    <form onSubmit={create} className="mb-5 flex flex-wrap gap-2 rounded-xl border border-line bg-white p-4 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product updates" className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-[#93c5fd] dark:border-[#30302d] dark:bg-[#222220]" />
      <button disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1d4ed8] px-3.5 text-xs font-medium text-white"><Plus size={14} /> {busy ? "Creating…" : "Create audience"}</button>
      {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
    </form>
    {notice && <p role="status" className="mb-3 rounded-lg bg-[#f1faf5] px-3 py-2 text-xs text-[#26714f]">{notice}</p>}
    {audiences.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{audiences.map((audience) => <div key={audience.id} className="rounded-xl border border-line bg-white p-5 shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="flex items-start justify-between"><span className="grid size-9 place-items-center rounded-lg bg-[#eaf0fb] text-[#1d4ed8]"><UsersRound size={17} /></span><span className={`rounded-full px-2 py-1 text-[13px] ${audience.resend_segment_id ? "bg-[#eaf7f1] text-[#26815f]" : "bg-amber-50 text-amber-700"}`}>{audience.resend_segment_id ? "Resend synced" : "Local only"}</span></div>
      <h2 className="mt-4 text-[14px] font-semibold">{audience.name}</h2><p className="mt-1 text-[14px] text-muted">{countFor(audience.id)} subscribed contacts</p>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px] text-muted dark:border-[#2a2a27]"><span>{audience.resend_segment_id ? `Segment · ${audience.resend_segment_id.slice(0, 8)}…` : "Sync to create a Resend Segment"}</span><div className="flex items-center gap-1.5"><button onClick={() => setDeleting(audience)} aria-label={`Delete ${audience.name}`} title="Delete audience" className="inline-flex items-center rounded-md border border-line px-2 py-1.5 text-[13px] text-[#686863] hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-[#30302d] dark:hover:bg-[#35201e]"><Trash2 size={11} /></button><button onClick={() => void sync(audience.id)} disabled={syncing === audience.id} aria-label={`Sync ${audience.name} to Resend`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1.5 text-[13px] font-medium text-[#686863] disabled:opacity-50 dark:border-[#30302d]">{syncing === audience.id ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}{syncing === audience.id ? "Syncing" : "Sync"}</button></div></div>
    </div>)}</div> : <EmptyState icon="audience" title="Your audiences live here" description="Create an audience to group subscribers. Each audience is linked to a Resend Segment for campaigns." />}
    {deleting && <DeleteAudienceModal audience={deleting} close={() => setDeleting(null)} deleted={(deletedContacts) => {
      setAudiences((items) => items.filter((item) => item.id !== deleting.id));
      setNotice(`Deleted audience "${deleting.name}".${deletedContacts ? ` ${deletedContacts} contact${deletedContacts === 1 ? " was" : "s were"} deleted too.` : " Its contacts are kept with no audience."}`);
      setDeleting(null);
    }} />}
  </div>;
}

function DeleteAudienceModal({ audience, close, deleted }: { audience: Audience; close: () => void; deleted: (deletedContacts: number) => void }) {
  const [deleteContacts, setDeleteContacts] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/audiences/${audience.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deleteContacts }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not delete this audience.");
      deleted(result.deletedContacts ?? 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete this audience."); setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="delete-audience-title" className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-5 shadow-xl dark:border-[#30302d] dark:bg-[#191918]">
      <div className="flex items-start justify-between"><h2 id="delete-audience-title" className="text-[16px] font-semibold">Delete audience &ldquo;{audience.name}&rdquo;?</h2><button type="button" aria-label="Close" disabled={busy} onClick={close} className="rounded-md p-1 text-muted"><X size={17} /></button></div>
      <p className="mt-2 text-[14px] leading-6 text-muted">{audience.resend_segment_id ? "Its Resend Segment is deleted too. " : ""}This can&apos;t be undone.</p>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-[14px] leading-5 text-[#6e6e67]"><input type="checkbox" checked={deleteContacts} onChange={(event) => setDeleteContacts(event.target.checked)} disabled={busy} className="mt-1 accent-red-600" />Also delete every contact in this audience. Leave this unticked to keep them with no audience.</label>
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={busy} className="h-9 rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]">Cancel</button><button type="button" onClick={() => void confirm()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}{busy ? "Deleting…" : "Delete audience"}</button></div>
    </div>
  </div>;
}
