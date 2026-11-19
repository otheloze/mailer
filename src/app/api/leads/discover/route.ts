import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reserveCredits, settleCredits } from "@/lib/credits";
import { claimTrial, getTrialStatus, releaseTrial, TRIAL_DISCOVERY_RESULTS, TRIAL_USED_MESSAGE } from "@/lib/trial";

const requestSchema = z.object({
  domain: z.string().trim().min(3).max(253),
  limit: z.number().int().min(1).max(5).default(5),
  type: z.enum(["personal", "generic"]).optional(),
});

type HunterSource = { domain?: string; uri?: string; extracted_on?: string; last_seen_on?: string };
type HunterEmail = {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  sources?: HunterSource[];
};
type HunterDomainResponse = {
  data?: {
    domain?: string;
    organization?: string | null;
    headcount?: string | number | null;
    industry?: string | null;
    country?: string | null;
    emails?: HunterEmail[];
  };
  errors?: { details?: string }[];
};

function normalizeDomain(value: string) {
  let hostname = value.toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/, 1)[0].replace(/\.$/, "");
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return null;
  return hostname;
}

function scoreLead(confidence: number, title: string | null | undefined) {
  const role = (title ?? "").toLowerCase();
  const seniorRole = /\b(chief|ceo|cto|cmo|cfo|coo|owner|founder|president|vp|vice president|director|head)\b/.test(role);
  const relevantRole = /\b(marketing|growth|sales|partnership|revenue|business development|operations|procurement)\b/.test(role);
  return Math.min(100, Math.max(0, Math.round(confidence * 0.7 + (seniorRole ? 20 : 0) + (relevantRole ? 10 : 0))));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid search." }, { status: 400 });
  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) return NextResponse.json({ error: "Enter a company domain, such as example.com." }, { status: 400 });

  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Domain search is not configured." }, { status: 503 });
  // Accounts without a subscription get one free discovery, capped at a few results.
  const trial = await getTrialStatus(supabase);
  const isTrial = Boolean(trial && !trial.has_full_access);
  const limit = isTrial ? Math.min(parsed.data.limit, TRIAL_DISCOVERY_RESULTS) : parsed.data.limit;
  const reservationKey = `domain-search:${user.id}:${crypto.randomUUID()}`;
  if (isTrial) {
    if (!trial?.trial_eligible || !trial.discovery_available) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
    const claim = await claimTrial(supabase, "discovery");
    if (claim.error) return NextResponse.json({ error: claim.error }, { status: 500 });
    if (!claim.granted) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
  } else {
    const reservation = await reserveCredits(supabase, "email_discovery", limit, reservationKey, `Domain search: ${domain}`);
    if (reservation.error) return NextResponse.json({ error: reservation.error }, { status: /credit|subscription|account/i.test(reservation.error) ? 402 : 500 });
  }
  // Settles paid credits, or for a trial gives the free discovery back when nothing was delivered.
  const settle = (consumed: number) => isTrial
    ? (consumed === 0 ? releaseTrial(user.id, "discovery") : Promise.resolve(null))
    : settleCredits(user.id, reservationKey, consumed);

  const searchParams = new URLSearchParams({ domain, limit: String(limit) });
  if (parsed.data.type) searchParams.set("type", parsed.data.type);

  let response: Response;
  try {
    response = await fetch(`https://api.hunter.io/v2/domain-search?${searchParams.toString()}`, {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const refundError = await settle(0);
    return NextResponse.json({ error: `Domain search is temporarily unavailable. Please try again.${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : 502 });
  }
  const result = await response.json().catch(() => null) as HunterDomainResponse | null;
  if (!response.ok || !result?.data) {
    const providerMessage = result?.errors?.[0]?.details;
    const message = response.status === 401 ? "Domain search rejected its configured credentials."
      : response.status === 429 || response.status === 403 ? "Domain search usage limit reached."
      : providerMessage ?? "Could not complete this domain search.";
    const refundError = await settle(0);
    return NextResponse.json({ error: `${message}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : response.status === 429 ? 429 : 502 });
  }

  const providerEmails = result.data.emails ?? [];
  const rows = [...new Map(providerEmails
    .filter((email): email is HunterEmail & { value: string } => typeof email.value === "string" && email.value.length <= 254)
    .map((email) => [email.value.trim().toLowerCase(), email])).values()]
    .map((email) => ({
      user_id: user.id,
      email: email.value.trim().toLowerCase(),
      first_name: email.first_name || null,
      last_name: email.last_name || null,
      job_title: email.position || null,
      seniority: email.seniority || null,
      department: email.department || null,
      company_name: result.data?.organization || null,
      company_domain: domain,
      company_size: result.data?.headcount == null ? null : String(result.data.headcount),
      industry: result.data?.industry || null,
      country: result.data?.country || null,
      email_type: email.type || null,
      email_confidence: Math.max(0, Math.min(100, Number(email.confidence) || 0)),
      lead_score: scoreLead(Number(email.confidence) || 0, email.position),
      sources: (email.sources ?? []).map((source) => ({
        domain: source.domain ?? null,
        uri: safeSourceUrl(source.uri),
        extracted_on: source.extracted_on ?? null,
        last_seen_on: source.last_seen_on ?? null,
      })),
      provider: "hunter",
      discovered_at: new Date().toISOString(),
    }));

  let inserted: { id: string; lead_score: number; email_status: string }[] | null = [];
  if (rows.length) {
    const { data, error } = await supabase.from("prospect_leads")
    .upsert(rows, { onConflict: "user_id,email", ignoreDuplicates: true })
    .select("id,lead_score,email_status");
    if (error) {
      const refundError = await settle(0);
      return NextResponse.json({ error: `${error.message}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: 500 });
    }
    inserted = data;
  }
  const consumed = Math.min(limit, providerEmails.length);
  const settlementError = await settle(consumed);
  if (settlementError) return NextResponse.json({ error: `Search completed but credit settlement failed: ${settlementError}` }, { status: 500 });

  return NextResponse.json({
    discovered: rows.length,
    saved: inserted?.length ?? 0,
    duplicates: rows.length - (inserted?.length ?? 0),
    savedHighFit: inserted?.filter((lead) => lead.lead_score >= 70).length ?? 0,
    savedVerified: inserted?.filter((lead) => lead.email_status === "valid").length ?? 0,
    company: result.data.organization ?? domain,
    domain,
  });
}

function safeSourceUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
