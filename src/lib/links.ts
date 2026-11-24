// Shared outbound links. Kept in a plain module rather than site-chrome.tsx
// because that file is a client component: a server component importing a
// value from it receives a client reference instead of the actual string.
export const HOSTING_STORE_URL = "https://my.mymailmarket.com/client/store";

// Windows installer for the desktop app. GitHub's "latest" redirect plus the
// fixed artifact name in desktop/electron-builder.yml keep this link stable.
export const DESKTOP_RELEASES_URL = "https://github.com/otheloze/mymailmarket-desktop/releases/latest";
export const DESKTOP_DOWNLOAD_URL = `${DESKTOP_RELEASES_URL}/download/MYMAILMARKET-Setup.exe`;
