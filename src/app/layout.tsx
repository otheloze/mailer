import type { Metadata } from "next";
import "./globals.css";
import { SupportChat } from "@/components/support-chat";
import { Analytics } from "@/components/analytics";
import { ADSENSE_CLIENT, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const DEFAULT_TITLE = "MYMAILMARKET — Leads, email marketing, hosting & domains";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: "%s | MYMAILMARKET" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Each page sets its own canonical; one here would be inherited by every page.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/images/team-workspace.jpg", alt: "A team of professionals collaborating around a laptop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/images/team-workspace.jpg"],
  },
  // Lets AdSense verify site ownership without loading the ad script.
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/images/team-workspace.jpg` },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: SITE_DESCRIPTION, publisher: { "@id": `${SITE_URL}/#organization` } },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        {children}
        <SupportChat />
        <Analytics />
      </body>
    </html>
  );
}
