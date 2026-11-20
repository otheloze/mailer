import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSenderForSave } from "@/lib/sender-domains";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200),
  preview_text: z.string().max(250),
  from_name: z.string().max(100),
  from_email: z.string().email().or(z.literal("")),
  reply_to: z.string().email().or(z.literal("")).nullable(),
  audience_id: z.string().uuid().nullable(),
  html: z.string().max(500_000),
  text_content: z.string().max(100_000),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid campaign data." }, { status: 400 });
  const { data: current, error: readError } = await supabase.from("campaigns").select("status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (current.status !== "draft" && current.status !== "scheduled") return NextResponse.json({ error: "Only draft or scheduled campaigns can be edited." }, { status: 409 });
  if (input.data.audience_id) {
    const { data: audience, error: audienceError } = await supabase.from("audiences").select("id").eq("id", input.data.audience_id).eq("user_id", user.id).maybeSingle();
    if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
    if (!audience) return NextResponse.json({ error: "Selected audience does not belong to this workspace." }, { status: 403 });
  }
  const sender = await resolveSenderForSave(supabase, user.id, input.data.from_email);
  if (sender.error) return NextResponse.json({ error: sender.error }, { status: sender.status });
  const { data: campaign, error } = await supabase.from("campaigns").update({ ...input.data, from_email: sender.fromEmail, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign });
}
