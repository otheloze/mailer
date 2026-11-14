import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public uptime check. Returns 200 when the app can reach the database and
 * 503 otherwise, so uptime monitors alert. Reveals no configuration details.
 */
export async function GET() {
  let database = false;
  try {
    const { error } = await createAdminClient().from("subscription_packages").select("id", { head: true, count: "exact" }).limit(1);
    database = !error;
  } catch {
    database = false;
  }
  return NextResponse.json(
    { ok: database, time: new Date().toISOString() },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
