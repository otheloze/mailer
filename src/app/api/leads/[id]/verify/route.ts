import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reserveCredits, settleCredits } from "@/lib/credits";

type HunterVerification = {
  data?: { status?: string; result?: string; score?: number };
  errors?: { details?: string }[];
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const { data: lead, error: leadError } = await supabase.from("prospect_leads")
    .select("id,email")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email verification is not configured." }, { status: 503 });
  const reservationKey = `email-verification:${user.id}:${id}:${crypto.randomUUID()}`;
  const reservation = await reserveCredits(supabase, "email_discovery", 1, reservationKey, `Email verification: ${lead.email}`);
  if (reservation.error) return NextResponse.json({ error: reservation.error }, { status: /credit|subscription|account/i.test(reservation.error) ? 402 : 500 });

  const searchParams = new URLSearchParams({ email: lead.email });
  let response: Response;
  try {
    response = await fetch(`https://api.hunter.io/v2/email-verifier?${searchParams.toString()}`, {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    return NextResponse.json({ error: `Email verification is temporarily unavailable. Please try again.${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : 502 });
  }
  const result = await response.json().catch(() => null) as HunterVerification | null;
  if (!response.ok || !result?.data) {
    const message = response.status === 401 ? "Email verification rejected its configured credentials."
      : response.status === 429 || response.status === 403 ? "Email verification usage limit reached."
      : result?.errors?.[0]?.details ?? "Could not verify this email.";
    const refundError = await settleCredits(user.id, reservationKey, 0);
    return NextResponse.json({ error: `${message}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : response.status === 429 ? 429 : 502 });
  }

  const rawStatus = `${result.data.status ?? ""} ${result.data.result ?? ""}`.toLowerCase();
  const emailStatus = /deliverable|valid/.test(rawStatus) ? "valid"
    : /undeliverable|invalid/.test(rawStatus) ? "invalid"
    : /risky|accept_all|webmail/.test(rawStatus) ? "risky"
    : "unknown";
  const verifiedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase.from("prospect_leads")
    .update({
      email_status: emailStatus,
      email_confidence: Number.isFinite(result.data.score) ? Math.max(0, Math.min(100, Math.round(result.data.score!))) : undefined,
      verified_at: verifiedAt,
      updated_at: verifiedAt,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,email_status,email_confidence,verified_at")
    .single();
  if (updateError) {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    return NextResponse.json({ error: `${updateError.message}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: 500 });
  }
  const settlementError = await settleCredits(user.id, reservationKey, 1);
  if (settlementError) return NextResponse.json({ error: `Email was verified but credit settlement failed: ${settlementError}` }, { status: 500 });
  return NextResponse.json({ lead: updated });
}
