import type { SupabaseClient } from "@supabase/supabase-js";

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** Parses a comma/space separated list of domains, e.g. DEFAULT_SENDER_DOMAINS. */
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
 * Domains this user may send from: DEFAULT_SENDER_DOMAINS (deployment-wide)
 * plus domains an administrator granted in public.sender_domain_grants.
 */
export async function getAllowedSenderDomains(supabase: SupabaseClient, userId: string) {
  const domains = new Set(parseDomainList(process.env.DEFAULT_SENDER_DOMAINS));
  const { data, error } = await supabase.from("sender_domain_grants").select("domain").eq("user_id", userId);
  if (error) return { domains, error: error.message };
  for (const row of data ?? []) domains.add(String(row.domain).toLowerCase());
  return { domains, error: null };
}

export function senderDomainError(fromEmail: string, domains: Set<string>) {
  if (isDomainAllowed(fromEmail, domains)) return null;
  if (!domains.size) return "No sender domain has been approved for this workspace yet. Ask an administrator to grant your sending domain.";
  return `You can only send from an approved domain (${[...domains].join(", ")}). Update the sender address.`;
}
