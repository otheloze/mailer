import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE = 1000;
const MAX_IDS = 200_000;

/** Every contact id the user owns, newest first, so "Select all" covers contacts that are not loaded yet. */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const ids: string[] = [];
  for (let offset = 0; offset < MAX_IDS; offset += PAGE) {
    const { data, error } = await supabase.from("contacts").select("id")
      .eq("user_id", user.id).order("created_at", { ascending: false }).order("id").range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ids.push(...(data ?? []).map((row) => row.id));
    if ((data ?? []).length < PAGE) break;
  }
  return NextResponse.json({ ids });
}
