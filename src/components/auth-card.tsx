import Link from "next/link";
import type { ReactNode } from "react";
import { Send } from "lucide-react";

// Shared shell for the small account pages (forgot / reset password).
export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-6 py-10 dark:bg-[#111827]">
      <div className="w-full max-w-[390px] rounded-[26px] border border-white bg-white/90 p-6 shadow-[0_30px_90px_-56px_rgba(18,34,72,.25)] sm:p-9 dark:border-[#2a3955] dark:bg-[#17233d]">
        <Link href="/" className="mb-7 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[13px] bg-gradient-to-br from-[#78a8ff] to-[#4057db] text-white"><Send size={16} /></span>
          <span className="text-[13px] font-semibold tracking-[.035em]">MYMAILMARKET</span>
        </Link>
        <h1 className="text-[26px] font-semibold tracking-[-.05em] text-[#17233d] dark:text-white">{title}</h1>
        <p className="mt-2 text-[14px] text-muted">{description}</p>
        {children}
        <Link href="/login" className="mt-6 block text-center text-[13px] font-semibold text-[#405fca] hover:underline">Back to sign in</Link>
      </div>
    </main>
  );
}

export function AuthField({ label, name, type = "text", minLength }: { label: string; name: string; type?: string; minLength?: number }) {
  return (
    <label className="grid gap-1.5 text-[13px] font-semibold text-[#53617b] dark:text-[#c0cbe0]">
      {label}
      <input name={name} type={type} required minLength={minLength} className="h-11 rounded-xl border border-[#dfe5ef] bg-[#fbfcfe] px-3.5 text-[14px] outline-none transition focus:border-[#7590e9] focus:bg-white focus:ring-4 focus:ring-[#5675e5]/10 dark:border-[#35445f] dark:bg-[#121d33] dark:text-white dark:focus:bg-[#14203a]" />
    </label>
  );
}

export const authButtonClass = "h-11 w-full rounded-xl bg-gradient-to-r from-[#233a72] to-[#4a68d8] text-[14px] font-semibold text-white shadow-[0_12px_24px_-12px_rgba(54,82,177,.6)] transition hover:-translate-y-0.5 disabled:opacity-60";
