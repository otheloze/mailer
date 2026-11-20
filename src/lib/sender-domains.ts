import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared sender every workspace may use. Override with PLATFORM_SENDER_EMAIL (server only). */
export const DEFAULT_PLATFORM_SENDER = "mail@mymailmarket.com";

/** Server-side platform sender. Client components receive it as a prop instead. */
export function platformSender() {
  return (process.env.PLATFORM_SENDER_EMAIL || DEFAULT_PLATFORM_SENDER).trim().toLowerCase();
}

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** Parses a comma/space separated list of domains. */
export function parseDomainList(value: string | undefined | null) {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isDomainAllowed(email: string, allowedDomains: Iterable<string>) {
  const domain = emailDomain(email);
  if (!domain) return false;
  for (const allowed of allowedDomains) {
    if (domain === allowed) return true;
  }
  return false;
}

/**
 * Domains this user may send from: only domains an administrator granted in
 * public.sender_domain_grants (each must be verified in Resend). Everyone else
 * sends from the shared platform sender.
 */
export async function getAllowedSenderDomains(supabase: SupabaseClient, userId: string) {
  const domains = new Set<string>();
  const { data, error } = await supabase.from("sender_domain_grants").select("domain").eq("user_id", userId);
  if (error) return { domains, error: error.message };
  for (const row of data ?? []) domains.add(String(row.domain).toLowerCase());
  return { domains, error: null };
}

/** True when the address is the shared platform sender or sits on a granted domain. */
export function isSenderAllowed(fromEmail: string, domains: Set<string>, platform: string) {
  const address = fromEmail.trim().toLowerCase();
  return address === platform.toLowerCase() || isDomainAllowed(address, domains);
}

export function senderDomainError(fromEmail: string, domains: Set<string>, platform: string = platformSender()) {
  if (isSenderAllowed(fromEmail, domains, platform)) return null;
  const own = domains.size ? ` or an address on your confirmed domain${domains.size === 1 ? "" : "s"} (${[...domains].join(", ")})` : "";
  return `Your account sends from ${platform}${own}. To send from your own domain, ask us to confirm it first.`;
}

/**
 * Validates a sender address before it is stored. Empty means "use the platform
 * sender"; anything else must be the platform sender or on a confirmed domain.
 */
export async function resolveSenderForSave(supabase: SupabaseClient, userId: string, fromEmail: string | null | undefined) {
  const platform = platformSender();
  const { domains, error } = await getAllowedSenderDomains(supabase, userId);
  const address = (fromEmail ?? "").trim() || platform;
  if (error) return { fromEmail: address, error, status: 500 };
  const message = senderDomainError(address, domains, platform);
  return message ? { fromEmail: address, error: message, status: 400 } : { fromEmail: address, error: null, status: 200 };
}

/** The address to pre-fill: the saved one if it is still allowed, otherwise the platform sender. */
export function normalizeSender(fromEmail: string | null | undefined, domains: Set<string> | string[], platform: string) {
  const allowed = domains instanceof Set ? domains : new Set(domains);
  const candidate = (fromEmail ?? "").trim();
  return candidate && isSenderAllowed(candidate, allowed, platform) ? candidate : platform;
}
