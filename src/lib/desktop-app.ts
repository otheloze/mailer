"use client";

import { useEffect, useState } from "react";

// The desktop app (desktop/main.js) adds "MYMAILMARKETDesktop/<version>" to its
// user agent; installs from before that change are recognised by Electron's own
// token. This only decides which UI to show. Limits that matter (credits,
// consent, rate limits) are enforced on the server for every client.
export function isDesktopUserAgent(userAgent: string) {
  return /MYMAILMARKETDesktop\/|Electron\//.test(userAgent);
}

/** Desktop-only limits. The website keeps its smaller defaults. */
export const DESKTOP_MAX_BULK_CONTACTS = 10_000;

/** False during server rendering and the first client render, so hydration matches. */
export function useIsDesktopApp() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { setDesktop(isDesktopUserAgent(navigator.userAgent)); }, []);
  return desktop;
}
