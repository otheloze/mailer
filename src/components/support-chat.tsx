"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
const GREETING: Msg = { role: "assistant", content: "Hi! I'm the MYMAILMARKET assistant. Ask me about campaigns, lead data, domains, hosting or pricing. If I can't help, I'll pass it to our team." };

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      // The greeting is UI-only; the API expects the conversation to start with the customer.
      const response = await fetch("/api/support-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1).slice(-20) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The assistant is unavailable.");
      setMessages([...next, { role: "assistant", content: body.reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant is unavailable.");
    } finally { setBusy(false); }
  }

  return <div className="fixed bottom-4 right-4 z-[60] text-[#17233d]">
    {open && <div className="mb-3 flex h-[min(520px,calc(100dvh-6rem))] w-[calc(100vw-2rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-[#e3e8f0] bg-white shadow-[0_30px_80px_-30px_rgba(14,26,54,.45)]">
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#233a72] to-[#4a68d8] px-4 py-3 text-white">
        <Bot size={18} /><div className="text-[14px] font-semibold">Support assistant</div>
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="ml-auto rounded-lg p-1 hover:bg-white/15"><X size={16} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-[#f7f8fb] p-3 text-[14px] leading-5">
        {messages.map((m, i) => <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
          <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-[#3d5bd0] text-white" : "border border-[#e6eaf1] bg-white"}`}>{m.content}</div>
        </div>)}
        {busy && <div className="text-[13px] text-[#64748b]">Typing…</div>}
        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error} <Link href="/contact" className="font-semibold underline">Contact us</Link></div>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-[#e6eaf1] p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Type your question…" aria-label="Message" className="h-10 min-w-0 flex-1 rounded-xl border border-[#dfe5ef] px-3 text-[14px] outline-none focus:border-[#7590e9]" />
        <button disabled={busy || !input.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-xl bg-[#3d5bd0] text-white disabled:opacity-50"><Send size={15} /></button>
      </form>
    </div>}
    <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close support chat" : "Open support chat"} className="ml-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-[#4a68d8] to-[#233a72] text-white shadow-[0_16px_36px_-12px_rgba(54,82,177,.8)] transition hover:-translate-y-0.5">
      {open ? <X size={22} /> : <MessageCircle size={22} />}
    </button>
  </div>;
}
