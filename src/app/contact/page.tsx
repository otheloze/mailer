import type { Metadata } from "next";
import { Bot, Clock, LifeBuoy, Mail } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ContactForm } from "@/components/contact-form";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Contact and support | MYMAILMARKET",
  description: "Get help with email campaigns, lead data, domains and hosting. Send us a message or chat with our support assistant.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#17233d]">
      <SiteHeader />
      <main className="mx-auto grid max-w-[1100px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:px-10">
        <section>
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[.18em] text-[#6478b0]">Help &amp; support</div>
          <h1 className="text-[34px] font-semibold tracking-[-.05em] sm:text-[40px]">We&apos;re here to help.</h1>
          <p className="mt-3 max-w-md text-[15px] leading-6 text-[#64748b]">Ask a question about campaigns, lead data, domains, hosting or your account. Send us a message and we&apos;ll reply by email.</p>
          <ul className="mt-8 grid gap-5 text-[14px]">
            <li className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#3355c9]"><Bot size={18} /></span><span><strong className="block">Instant answers</strong><span className="text-[#64748b]">Use the chat assistant at the bottom right. It can answer common questions and pass anything else to our team.</span></span></li>
            <li className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#3355c9]"><Mail size={18} /></span><span><strong className="block">Email</strong><a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#2f4fbf] hover:underline">{SUPPORT_EMAIL}</a></span></li>
            <li className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#3355c9]"><Clock size={18} /></span><span><strong className="block">Response time</strong><span className="text-[#64748b]">We aim to reply within one business day.</span></span></li>
            <li className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[#3355c9]"><LifeBuoy size={18} /></span><span><strong className="block">Billing or orders</strong><span className="text-[#64748b]">Include your order ID or the email you paid with so we can find it quickly.</span></span></li>
          </ul>
        </section>
        <section className="rounded-[24px] border border-white bg-white p-6 shadow-[0_30px_90px_-56px_rgba(18,34,72,.25)] sm:p-8">
          <h2 className="mb-5 text-[20px] font-semibold tracking-[-.03em]">Send us a message</h2>
          <ContactForm />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
