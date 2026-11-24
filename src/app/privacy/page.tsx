import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How MYMAILMARKET and the MYMAILMARKET desktop app collect, use and protect personal data, including cookies, analytics and advertising.",
  alternates: { canonical: "/privacy" },
};

const h2 = "mt-10 text-[20px] font-semibold";
const h3 = "mt-5 text-[16px] font-semibold";
const list = "mt-2 list-disc space-y-1 pl-6";
const link = "text-[#1e40af] underline";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#17233d]">
      <SiteHeader />
      <main className="mx-auto max-w-[780px] px-5 py-14 text-[15px] leading-7 sm:px-8">
        <h1 className="text-[34px] font-semibold tracking-[-.04em]">Privacy policy</h1>
        <p className="mt-2 text-[13px] text-[#64748b]">Last updated: 24 November 2026</p>
        <p className="mt-4">This policy explains what personal data MYMAILMARKET collects when you use our website at mymailmarket.com (the &ldquo;website&rdquo;) and the MYMAILMARKET desktop app for Windows (the &ldquo;app&rdquo;), why we collect it, who we share it with and the choices you have.</p>

        <nav aria-label="On this page" className="mt-6 rounded-xl border border-[#e4e9f1] bg-white p-5 text-[14px]">
          <div className="font-semibold">On this page</div>
          <ol className="mt-2 grid list-decimal gap-x-8 gap-y-1 pl-5 sm:grid-cols-2">
            <li><a className={link} href="#who-we-are">Who we are</a></li>
            <li><a className={link} href="#what-we-collect">Information we collect</a></li>
            <li><a className={link} href="#how-we-use">How we use information</a></li>
            <li><a className={link} href="#desktop-app">The desktop app</a></li>
            <li><a className={link} href="#cookies">Cookies, analytics and advertising</a></li>
            <li><a className={link} href="#sharing">Who we share data with</a></li>
            <li><a className={link} href="#contacts">Contacts you upload</a></li>
            <li><a className={link} href="#retention">How long we keep data</a></li>
            <li><a className={link} href="#security">Security</a></li>
            <li><a className={link} href="#rights">Your rights and choices</a></li>
            <li><a className={link} href="#children">Children</a></li>
            <li><a className={link} href="#changes">Changes and contact</a></li>
          </ol>
        </nav>

        <h2 id="who-we-are" className={h2}>1. Who we are</h2>
        <p className="mt-2">MYMAILMARKET (mymailmarket.com) provides email marketing, business lead data, domain and hosting services. MYMAILMARKET is responsible for the personal data described in this policy. Questions about this policy can be sent through our <a className={link} href="/contact">contact page</a>.</p>

        <h2 id="what-we-collect" className={h2}>2. Information we collect</h2>
        <ul className={list}>
          <li><strong>Account details:</strong> your email address and password when you sign up, plus optional profile details such as your name, company name, time zone, sender name, reply-to address, mailing address and email footer. Passwords are stored only in hashed form by our sign-in provider.</li>
          <li><strong>Workspace content:</strong> the contacts, audiences, segments, templates and campaigns you upload or create.</li>
          <li><strong>Email activity:</strong> delivery, open, click, bounce, complaint and unsubscribe events for the emails you send, so we can report results and honour opt-outs.</li>
          <li><strong>Orders and payments:</strong> the package you bought, the payment status and the reference from PayPal or Paystack. We never receive or store your full card number.</li>
          <li><strong>Support messages:</strong> what you send through the contact form or the support assistant.</li>
          <li><strong>Technical data:</strong> IP address, browser or device type and request logs, which our servers record to keep the service running and secure.</li>
          <li><strong>Usage data:</strong> pages visited, device and approximate location, only if you accept analytics cookies (see section 5).</li>
        </ul>

        <h2 id="how-we-use" className={h2}>3. How we use information</h2>
        <ul className={list}>
          <li>To provide the services: signing you in, storing your workspace, sending your campaigns and finding or verifying business emails you request.</li>
          <li>To process orders, track credits and subscriptions, and prevent fraud and abuse, for example through rate limits and sending rules.</li>
          <li>To send service messages such as password resets, order confirmations and test emails you ask for.</li>
          <li>To answer support requests.</li>
          <li>To understand and improve the website, if you have accepted analytics cookies.</li>
        </ul>
        <p className="mt-2">We process data to perform our contract with you, to meet legal obligations, for our legitimate interest in running a secure service, and, for analytics and advertising cookies, with your consent. <strong>We do not sell your personal data.</strong></p>

        <h2 id="desktop-app" className={h2}>4. The MYMAILMARKET desktop app</h2>
        <p className="mt-2">The app is a dedicated window for your MYMAILMARKET account. It shows the same service as the website, so everything in this policy applies to it too. In addition:</p>
        <h3 className={h3}>What the app stores on your computer</h3>
        <ul className={list}>
          <li>Your sign-in session (cookies) and a standard web cache, so you stay signed in and pages load faster.</li>
          <li>The size and position of the app window.</li>
        </ul>
        <p className="mt-2">These are kept in your Windows user profile, in <code className="rounded bg-[#eef2f7] px-1">%APPDATA%\MYMAILMARKET</code>. Signing out ends the session. Uninstalling removes the app, and you can delete that folder to remove everything it stored.</p>
        <h3 className={h3}>What the app connects to</h3>
        <ul className={list}>
          <li><strong>mymailmarket.com</strong>, to show your account. This is the same as using the website.</li>
          <li><strong>PayPal or Paystack</strong>, only while you are checking out.</li>
          <li><strong>GitHub</strong> (github.com), to check for and download app updates. This request includes your IP address and the app version, and contains no account data.</li>
        </ul>
        <p className="mt-2">Other links open in your normal web browser.</p>
        <h3 className={h3}>What the app does not do</h3>
        <ul className={list}>
          <li>It does not collect telemetry, crash reports or usage statistics of its own.</li>
          <li>It does not read your files, documents, other apps, contacts or email.</li>
          <li>It blocks access to your camera, microphone, location and notifications.</li>
          <li>It contains no advertising software and does not track you across other apps.</li>
        </ul>
        <p className="mt-2">Files leave your computer only when you choose them yourself, for example a contact list you import.</p>

        <h2 id="cookies" className={h2}>5. Cookies, analytics and advertising</h2>
        <p className="mt-2">We use essential cookies to keep you signed in and to secure the service. These cannot be switched off.</p>
        <p className="mt-2">We also use Google Analytics to understand how the site is used, and Google AdSense to show advertising on our public pages. These cookies are only turned on if you click Accept on the cookie banner, on the website or in the app. If you decline, analytics and ad cookies stay off.</p>
        <p className="mt-2">Google may use cookies to personalise ads. You can manage this at <a className={link} href="https://adssettings.google.com" rel="noreferrer">adssettings.google.com</a>, and learn how Google uses data at <a className={link} href="https://policies.google.com/technologies/partner-sites" rel="noreferrer">policies.google.com/technologies/partner-sites</a>.</p>
        <p className="mt-2">To change your choice, clear this site&apos;s data in your browser and the banner will appear again. In the app, delete the folder named in section 4.</p>

        <h2 id="sharing" className={h2}>6. Who we share data with</h2>
        <p className="mt-2">We share data only with the providers needed to run the service, and only for that purpose:</p>
        <ul className={list}>
          <li><strong>Supabase:</strong> database and sign-in.</li>
          <li><strong>Resend:</strong> sending and tracking emails.</li>
          <li><strong>PayPal and Paystack:</strong> payments.</li>
          <li><strong>Hunter:</strong> business email discovery and verification you request.</li>
          <li><strong>Anthropic:</strong> the support assistant answers the messages you send it.</li>
          <li><strong>Truehost:</strong> domain searches and registrations.</li>
          <li><strong>Our hosting provider:</strong> running the website.</li>
          <li><strong>Google:</strong> analytics and advertising, with your consent.</li>
          <li><strong>GitHub:</strong> delivering app downloads and updates.</li>
        </ul>
        <p className="mt-2">We may also disclose data if the law requires it, or to protect the rights and safety of our users and the service. Our providers may process data in other countries. Where that happens, we rely on their contractual safeguards for international transfers.</p>

        <h2 id="contacts" className={h2}>7. Contacts you upload</h2>
        <p className="mt-2">When you upload contacts or send campaigns, you decide whose data is used and you are responsible for having permission to email them. We process those contacts only to provide the service to you.</p>
        <p className="mt-2">Every marketing email includes an unsubscribe link, and we keep opt-outs so that people who unsubscribe are not emailed again. Recipients can manage their preferences at <a className={link} href="/unsubscribe">mymailmarket.com/unsubscribe</a>.</p>

        <h2 id="retention" className={h2}>8. How long we keep data</h2>
        <p className="mt-2">We keep account and workspace data while your account is active. When you ask us to delete your account, we delete or anonymise your data unless we must keep it, for example payment records required for tax or accounting, or opt-out records needed to keep honouring unsubscribes. Server logs are kept only as long as needed for security and troubleshooting.</p>

        <h2 id="security" className={h2}>9. Security</h2>
        <p className="mt-2">All traffic to the website and app is encrypted with HTTPS. Access to workspace data is restricted per account at the database level, and service credentials are kept on our servers, never in the app. No system is perfectly secure. If we learn of a breach affecting your data, we will notify you as required by law.</p>

        <h2 id="rights" className={h2}>10. Your rights and choices</h2>
        <p className="mt-2">Depending on where you live, you may ask to:</p>
        <ul className={list}>
          <li>access, correct, export or delete your personal data;</li>
          <li>object to or restrict its processing;</li>
          <li>withdraw consent, for example to analytics cookies.</li>
        </ul>
        <p className="mt-2">You can edit most details yourself in Settings and export your contacts from the Contacts page. For anything else, <a className={link} href="/contact">contact us</a> and we will respond promptly. You also have the right to complain to your local data protection authority.</p>

        <h2 id="children" className={h2}>11. Children</h2>
        <p className="mt-2">Our services are for businesses and are not directed to children under 16. We do not knowingly collect their personal data. If you believe a child has given us data, contact us and we will delete it.</p>

        <h2 id="changes" className={h2}>12. Changes and contact</h2>
        <p className="mt-2">We may update this policy and will change the date above when we do. For significant changes we will tell you by email or in the app.</p>
        <p className="mt-2">For any privacy question or request, use our <a className={link} href="/contact">contact page</a>.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
