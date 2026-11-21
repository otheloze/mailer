"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADSENSE_CLIENT, GA_ID, PRIVATE_PATH_PREFIXES } from "@/lib/site";

const STORAGE_KEY = "mm-cookie-consent";
type Consent = "granted" | "denied" | null;

declare global {
  interface Window { gtag?: (...args: unknown[]) => void }
}

function readConsent(): Consent {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch { return null; }
}

// Google Analytics 4 (Consent Mode v2) + AdSense, with a cookie consent banner.
// Analytics storage and ads stay denied until the visitor accepts. The AdSense
// script is only loaded after consent and never on signed-in/transactional pages.
export function Analytics() {
  const pathname = usePathname() ?? "/";
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { setConsent(readConsent()); setReady(true); }, []);

  if (!GA_ID && !ADSENSE_CLIENT) return null;

  const isPrivate = PRIVATE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  function choose(value: "granted" | "denied") {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
    window.gtag?.("consent", "update", { analytics_storage: value, ad_storage: value, ad_user_data: value, ad_personalization: value });
    setConsent(value);
  }

  const gaInit = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    var c = 'denied';
    try { if (localStorage.getItem('${STORAGE_KEY}') === 'granted') c = 'granted'; } catch (e) {}
    gtag('consent', 'default', { analytics_storage: c, ad_storage: c, ad_user_data: c, ad_personalization: c, wait_for_update: 500 });
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  `;

  return (
    <>
      {GA_ID && <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">{gaInit}</Script>
      </>}
      {ADSENSE_CLIENT && consent === "granted" && !isPrivate && (
        <Script
          id="adsense"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        />
      )}
      {ready && consent === null && !isPrivate && (
        <div role="dialog" aria-label="Cookie consent" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[620px] rounded-2xl border border-[#e2e8f0] bg-white p-4 text-[13px] leading-5 text-[#475569] shadow-[0_20px_60px_-20px_rgba(15,23,42,.35)] sm:p-5">
          <p>We use cookies for analytics and to show ads. Choose whether to allow them. See our <a href="/privacy" className="font-semibold text-[#1e40af] underline">privacy policy</a>.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => choose("granted")} className="h-9 rounded-full bg-[#162544] px-4 font-semibold text-white hover:bg-[#243c70]">Accept</button>
            <button type="button" onClick={() => choose("denied")} className="h-9 rounded-full border border-[#cbd5e1] px-4 font-semibold text-[#334155] hover:bg-[#f1f5f9]">Decline</button>
          </div>
        </div>
      )}
    </>
  );
}
