import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).default(""),
  preview_text: z.string().max(250).default(""),
  from_name: z.string().max(100).default(""),
  from_email: z.string().email().or(z.literal("")).default(""),
  reply_to: z.string().email().or(z.literal("")).nullable().default(""),
  audience_id: z.string().uuid().nullable().default(null),
  html: z.string().max(500_000).default(""),
  text_content: z.string().max(100_000).default(""),
});

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await supabase.from("campaigns").select("id,name,subject,status,scheduled_at,sent_at,created_at,audience_id").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid campaign data." }, { status: 400 });
  if (input.data.audience_id) {
    const { data: audience, error: audienceError } = await supabase.from("audiences").select("id").eq("id", input.data.audience_id).eq("user_id", user.id).maybeSingle();
    if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
    if (!audience) return NextResponse.json({ error: "Selected audience does not belong to this workspace." }, { status: 403 });
  }
  const { data: campaign, error } = await supabase.from("campaigns").insert({ ...input.data, user_id: user.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign }, { status: 201 });
}
