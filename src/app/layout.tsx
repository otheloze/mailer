import type { Metadata } from "next";
import "./globals.css";
import { SupportChat } from "@/components/support-chat";

export const metadata: Metadata = {
  metadataBase: new URL("https://mymailmarket.com"),
  title: "MYMAILMARKET — Leads, email marketing, hosting & domains",
  description: "Discover business leads, manage email campaigns, and explore hosting and domain services with MYMAILMARKET.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "MYMAILMARKET",
    title: "MYMAILMARKET — Leads, email marketing, hosting & domains",
    description: "Discover business leads, manage email campaigns, and explore hosting and domain services with MYMAILMARKET.",
    images: [{ url: "/images/team-workspace.jpg", alt: "A team of professionals collaborating around a laptop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MYMAILMARKET — Leads, email marketing, hosting & domains",
    description: "Discover business leads, manage email campaigns, and explore hosting and domain services with MYMAILMARKET.",
    images: ["/images/team-workspace.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <SupportChat />
      </body>
    </html>
  );
}
