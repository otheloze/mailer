import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How MYMAILMARKET collects, uses and protects personal data, including cookies, analytics and advertising.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#17233d]">
      <SiteHeader />
      <main className="mx-auto max-w-[780px] px-5 py-14 text-[15px] leading-7 sm:px-8">
        <h1 className="text-[34px] font-semibold tracking-[-.04em]">Privacy policy</h1>
        <p className="mt-2 text-[13px] text-[#64748b]">Last updated: 21 November 2026</p>

        <h2 className="mt-8 text-[20px] font-semibold">Who we are</h2>
        <p className="mt-2">MYMAILMARKET (mymailmarket.com) provides email marketing, business lead data, domain and hosting services. Questions about this policy can be sent through our <a className="text-[#1e40af] underline" href="/contact">contact page</a>.</p>

        <h2 className="mt-8 text-[20px] font-semibold">Information we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Account details such as your email address when you sign up or buy a package.</li>
          <li>Contact and campaign data you upload or create in your workspace.</li>
          <li>Order and payment status from PayPal and Paystack. We do not store card numbers.</li>
          <li>Messages you send through the contact form or support assistant.</li>
          <li>Usage data (pages visited, device and approximate location) if you accept analytics cookies.</li>
        </ul>

        <h2 className="mt-8 text-[20px] font-semibold">Cookies, analytics and advertising</h2>
        <p className="mt-2">We use Google Analytics to understand how the site is used and Google AdSense to show advertising on our public pages. These cookies are only enabled if you click Accept on the cookie banner; if you decline, analytics and ad cookies stay off. Google may use cookies to personalise ads. You can manage this at <a className="text-[#1e40af] underline" href="https://adssettings.google.com" rel="noreferrer">adssettings.google.com</a> and learn how Google uses data at <a className="text-[#1e40af] underline" href="https://policies.google.com/technologies/partner-sites" rel="noreferrer">policies.google.com/technologies/partner-sites</a>. To change your choice, clear this site&apos;s data in your browser and the banner will appear again.</p>

        <h2 className="mt-8 text-[20px] font-semibold">How we use information</h2>
        <p className="mt-2">To provide and secure the services, process orders, send service messages, respond to support requests, and improve the site. We do not sell your personal data.</p>

        <h2 className="mt-8 text-[20px] font-semibold">Service providers</h2>
        <p className="mt-2">We share data only with providers needed to run the service, including Supabase (database and sign-in), Resend (email delivery), PayPal and Paystack (payments), Truehost (domains) and Google (analytics and advertising).</p>

        <h2 className="mt-8 text-[20px] font-semibold">Your rights</h2>
        <p className="mt-2">Depending on where you live, you may ask to access, correct, export or delete your personal data, or object to its processing. Contact us and we will respond promptly.</p>

        <h2 className="mt-8 text-[20px] font-semibold">Changes</h2>
        <p className="mt-2">We may update this policy and will change the date above when we do.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
