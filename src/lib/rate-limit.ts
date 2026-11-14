import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns the caller's IP address from standard proxy headers (Vercel, Cloudflare, cPanel/Passenger). */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/**
 * Consumes one hit from a fixed-window limit stored in Postgres.
 * Fails open (allows the request) when the limiter itself is unavailable so a
 * database hiccup does not take the product down; the failure is logged.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
      p_key: key.slice(0, 300),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("Rate limiter unavailable:", error.message);
      return true;
    }
    return data === true;
  } catch (error) {
    console.error("Rate limiter unavailable:", error instanceof Error ? error.message : error);
    return true;
  }
}

/** Convenience wrapper returning a 429 response when the limit is exceeded, otherwise null. */
export async function rateLimitResponse(key: string, limit: number, windowSeconds: number) {
  if (await consumeRateLimit(key, limit, windowSeconds)) return null;
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(windowSeconds) } },
  );
}
