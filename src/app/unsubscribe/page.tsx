import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";

export default function UnsubscribePage() {
  return <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5 dark:bg-[#111110]">
    <div className="w-full max-w-[430px] rounded-2xl border border-line bg-white p-8 text-center shadow-soft dark:border-[#2a2a27] dark:bg-[#171716]">
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[#eaf0fb] text-[#1d4ed8]"><Mail size={21} /></div>
      <h1 className="mt-5 text-[21px] font-semibold tracking-[-.04em]">Email preferences</h1>
      <p className="mt-2 text-sm leading-6 text-muted">To unsubscribe, use the personal unsubscribe link included in the MYMAILMARKET email you received. Resend securely processes that one-click request and notifies this workspace so your contact record stays in sync.</p>
      <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#f7f7f5] p-3 text-left text-[14px] leading-5 text-[#6e6e67] dark:bg-[#222220]"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#2563eb]" /><span>When your request is received, you’ll be removed from marketing broadcasts. Transactional messages may still be sent when necessary.</span></div>
      <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg border border-line px-3 text-xs font-medium dark:border-[#30302d]">Back to MYMAILMARKET</Link>
    </div>
  </main>;
}
