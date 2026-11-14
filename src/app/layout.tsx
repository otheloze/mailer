import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mymailmarket.com"),
  title: "MYMAILMARKET — Leads, email marketing, hosting & domains",
  description: "Discover business leads, manage email campaigns, and explore hosting and domain services with MYMAILMARKET.",
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
