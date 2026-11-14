import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";

const schema = z.object({ name: z.string().trim().min(2).max(80) });

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid audience name." }, { status: 400 });
  const { data: existingAudience, error: existingError } = await supabase.from("audiences").select("id").eq("user_id", user.id).eq("name", input.data.name).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existingAudience) return NextResponse.json({ error: "An audience with this name already exists." }, { status: 409 });

  let segmentId: string | null = null;
  if (process.env.RESEND_API_KEY) {
    const { data, error } = await getResend().segments.create({ name: input.data.name });
    if (error) return NextResponse.json({ error: `Resend could not create the Segment: ${error.message}` }, { status: 502 });
    segmentId = data?.id ?? null;
  }
  const { data: audience, error } = await supabase.from("audiences").insert({ user_id: user.id, name: input.data.name, resend_segment_id: segmentId }).select("id,name,resend_segment_id,created_at").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "An audience with this name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ audience }, { status: 201 });
}
