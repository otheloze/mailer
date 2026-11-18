import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/lib/password-recovery";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
      if (request.headers.get("cookie")?.includes(`${RECOVERY_COOKIE}=1`)) {
        // Password-recovery link: send the user to choose a new password.
        const response = NextResponse.redirect(new URL("/reset-password", requestUrl.origin));
        response.cookies.set(RECOVERY_COOKIE, "", { maxAge: 0, path: "/" });
        return response;
      }
      const { error: claimError } = await supabase.rpc("claim_guest_subscription_payments");
      if (claimError) {
        console.error("Could not claim verified guest package after email confirmation:", claimError.message);
        return NextResponse.redirect(new URL(`/pricing?claim_error=${encodeURIComponent("Your account is ready, but package activation is pending. Sign in and retry from pricing.")}`, requestUrl.origin));
      }
      return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
    }
  }
  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
