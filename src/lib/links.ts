// Shared outbound links. Kept in a plain module rather than site-chrome.tsx
// because that file is a client component: a server component importing a
// value from it receives a client reference instead of the actual string.
export const HOSTING_STORE_URL = "https://my.mymailmarket.com/client/store";
