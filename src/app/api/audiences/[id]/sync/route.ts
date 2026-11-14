import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";
import { rateLimitResponse } from "@/lib/rate-limit";
import { loadEligibleAddresses, reconcileSegment, storeResendContactId } from "@/lib/segments";

// Reconciling large audiences makes many provider calls; allow up to 5 minutes (Vercel Pro).
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Configure RESEND_API_KEY before syncing." }, { status: 503 });
  const limited = await rateLimitResponse(`audience-sync:${user.id}`, 20, 3600);
  if (limited) return limited;
  const { id } = await params;
  const { data: audience, error: audienceError } = await supabase.from("audiences").select("id,name,resend_segment_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
  if (!audience) return NextResponse.json({ error: "Audience not found." }, { status: 404 });

  let segmentId: string | null = audience.resend_segment_id;
  if (!segmentId) {
    const { data, error } = await getResend().segments.create({ name: audience.name });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!data?.id) return NextResponse.json({ error: "Resend did not return a Segment ID." }, { status: 502 });
    segmentId = data.id;
    const { error: saveError } = await supabase.from("audiences").update({ resend_segment_id: segmentId }).eq("id", id).eq("user_id", user.id);
    if (saveError) return NextResponse.json({ error: `Created Resend Segment ${segmentId}, but could not save its ID: ${saveError.message}` }, { status: 500 });
  }

  const { addresses, error: eligibleError } = await loadEligibleAddresses(supabase, user.id, id);
  if (eligibleError) return NextResponse.json({ error: eligibleError }, { status: 500 });

  try {
    const result = await reconcileSegment(segmentId, addresses, (address, contactId) => storeResendContactId(supabase, user.id, address, contactId));
    const failures = [...result.removeFailures, ...result.addFailures];
    return NextResponse.json({
      segmentId,
      synced: addresses.length - result.failedAddEmails.size,
      added: result.added,
      removed: result.removed,
      failed: failures.length,
      warning: failures.length ? failures.slice(0, 3).join("; ") : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not synchronize the Resend Segment." }, { status: 502 });
  }
}
