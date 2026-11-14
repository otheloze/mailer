import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to claim your verified package." }, { status: 401 });

  const { data, error } = await supabase.rpc("claim_guest_subscription_payments");
  if (error) {
    console.error("Could not claim guest subscription payment:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data ?? { claimed: 0 });
}
