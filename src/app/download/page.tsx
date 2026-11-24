import type { Metadata } from "next";
import Link from "next/link";
import { Download, MonitorSmartphone, RefreshCw, ShieldCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { DESKTOP_DOWNLOAD_URL, DESKTOP_RELEASES_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Download the desktop app",
  description: "Install MYMAILMARKET on Windows and run your email campaigns, contacts and lead discovery from your desktop.",
  alternates: { canonical: "/download" },
};

const features = [
  { icon: MonitorSmartphone, title: "Your full workspace", text: "Campaigns, contacts, segments, templates, scheduling and analytics: the same tools as the website, in their own window." },
  { icon: ShieldCheck, title: "Ready to send", text: "Preconfigured for mymailmarket.com. Sign in with your existing account, and your plan, credits and sender settings come with you." },
  { icon: RefreshCw, title: "Always up to date", text: "The app updates itself when a new version is released, and you stay signed in between launches." },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#17233d]">
      <SiteHeader />
      <main className="mx-auto max-w-[980px] px-5 py-14 sm:px-8">
        <section className="text-center">
          <h1 className="text-[34px] font-semibold tracking-[-.04em] sm:text-[44px]">MYMAILMARKET for desktop</h1>
          <p className="mx-auto mt-3 max-w-[620px] text-[16px] leading-7 text-[#64748b]">Run your email marketing from a dedicated app on your Windows PC. Everything stays in sync with your mymailmarket.com account.</p>
          <a href={DESKTOP_DOWNLOAD_URL} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#162544] px-7 text-[15px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(13,28,58,.65)] transition hover:-translate-y-0.5 hover:bg-[#243c70]">
            <Download size={18} /> Download for Windows
          </a>
          <p className="mt-3 text-[13px] text-[#94a3b8]">Windows 10 or 11 (64-bit) · about 115 MB · <a href={DESKTOP_RELEASES_URL} className="underline underline-offset-2 hover:text-[#475569]">release notes</a></p>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-[#e4e9f1] bg-white p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-[#eef3ff] text-[#1e40af]"><Icon size={18} /></span>
              <h2 className="mt-4 text-[16px] font-semibold">{title}</h2>
              <p className="mt-1.5 text-[14px] leading-6 text-[#64748b]">{text}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto mt-14 max-w-[680px] rounded-2xl border border-[#e4e9f1] bg-white p-6 text-[15px] leading-7 sm:p-8">
          <h2 className="text-[20px] font-semibold">How to install</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>Download <strong>MYMAILMARKET-Setup.exe</strong> and open it.</li>
            <li>If Windows shows &ldquo;Windows protected your PC&rdquo;, click <strong>More info</strong>, then <strong>Run anyway</strong>.</li>
            <li>Follow the installer. It adds MYMAILMARKET to your Start menu and desktop.</li>
            <li>Open the app and sign in with your MYMAILMARKET account. No account yet? <Link href="/signup" className="text-[#1e40af] underline">Sign up free</Link>.</li>
          </ol>
          <p className="mt-4 text-[13px] text-[#64748b]">The app needs an internet connection. To remove it, use <em>Settings → Apps → Installed apps</em> in Windows.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
