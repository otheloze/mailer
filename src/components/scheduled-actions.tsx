"use client";

import { useState } from "react";

export function CancelScheduledButton({ id }: { id: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!window.confirm("Cancel this scheduled broadcast?")) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Cancellation failed.");
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Cancellation failed."); }
    finally { setBusy(false); }
  }
  return <div className="flex items-center gap-2"><button onClick={() => void cancel()} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-[14px] font-medium text-red-600 disabled:opacity-50">{busy ? "Canceling…" : "Cancel"}</button>{error && <span role="alert" className="text-[13px] text-red-600">{error}</span>}</div>;
}
