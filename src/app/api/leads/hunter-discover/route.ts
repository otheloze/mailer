import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reserveCredits, settleCredits } from "@/lib/credits";
import { claimTrial, getTrialStatus, releaseTrial, TRIAL_DISCOVERY_RESULTS, TRIAL_USED_MESSAGE } from "@/lib/trial";

const requestSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  limit: z.number().int().min(1).max(5).default(5),
});

type HunterCompany = {
  domain: string;
  organization: string | null;
  description?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  headcount?: string | null;
  emails_count?: unknown;
};

type HunterDiscoverResponse = {
  data?: HunterCompany[];
  meta?: { results?: number; limit?: number };
  errors?: { details?: string }[];
};

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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a company search query." }, { status: 400 });
  }

  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Company discovery is not configured." }, { status: 503 });
  // Accounts without a subscription get one free discovery, capped at a few results.
  const trial = await getTrialStatus(supabase);
  const isTrial = Boolean(trial && !trial.has_full_access);
  const limit = isTrial ? Math.min(parsed.data.limit, TRIAL_DISCOVERY_RESULTS) : parsed.data.limit;
  const reservationKey = `company-discovery:${user.id}:${crypto.randomUUID()}`;
  if (isTrial) {
    if (!trial?.trial_eligible || !trial.discovery_available) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
    const claim = await claimTrial(supabase, "discovery");
    if (claim.error) return NextResponse.json({ error: claim.error }, { status: 500 });
    if (!claim.granted) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
  } else {
    const reservation = await reserveCredits(supabase, "email_discovery", limit, reservationKey, "Company discovery");
    if (reservation.error) return NextResponse.json({ error: reservation.error }, { status: /credit|subscription|account/i.test(reservation.error) ? 402 : 500 });
  }
  // Settles paid credits, or for a trial gives the free discovery back when nothing was delivered.
  const settle = (consumed: number) => isTrial
    ? (consumed === 0 ? releaseTrial(user.id, "discovery") : Promise.resolve(null))
    : settleCredits(user.id, reservationKey, consumed);

  let response: Response;
  try {
    response = await fetch("https://api.hunter.io/v2/discover", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: parsed.data.query, limit }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const refundError = await settle(0);
    return NextResponse.json({ error: `Company discovery is temporarily unavailable. Please try again.${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : 502 });
  }

  const result = await response.json().catch(() => null) as HunterDiscoverResponse | null;
  if (!response.ok || !Array.isArray(result?.data)) {
    const providerMessage = result?.errors?.[0]?.details;
    const message = response.status === 401 ? "Company discovery rejected its configured credentials."
      : response.status === 429 || response.status === 403 ? "Company discovery usage or rate limit reached."
      : providerMessage ?? "Could not complete company discovery.";
    const refundError = await settle(0);
    return NextResponse.json({ error: `${message}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : response.status === 429 ? 429 : 502 });
  }

  const companies = result.data.filter((company) =>
    typeof company.domain === "string" && company.domain.length > 0 && company.domain.length <= 253);
  const settlementError = await settle(companies.length);
  if (settlementError) return NextResponse.json({ error: `Discovery completed but credit settlement failed: ${settlementError}` }, { status: 500 });

  return NextResponse.json({
    companies,
    results: result.meta?.results ?? companies.length,
    limit: result.meta?.limit ?? limit,
    query: parsed.data.query,
  });
}
