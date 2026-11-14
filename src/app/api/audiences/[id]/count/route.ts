import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const { data: audience } = await supabase.from("audiences").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!audience) return NextResponse.json({ error: "Audience not found." }, { status: 404 });
  const { count, error } = await supabase.from("contact_emails")
    .select("id,contacts!inner(user_id,audience_id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "subscribed")
    .not("consent_at", "is", null)
    .eq("contacts.user_id", user.id)
    .eq("contacts.audience_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
