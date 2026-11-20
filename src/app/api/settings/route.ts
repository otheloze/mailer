import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";
import { getAllowedSenderDomains, resolveSenderForSave } from "@/lib/sender-domains";

const schema = z.object({
  full_name: z.string().max(120).default(""),
  company_name: z.string().max(120).default(""),
  timezone: z.string().min(1).max(100).refine(isTimeZone, "Choose a valid timezone.").default("UTC"),
  default_from_name: z.string().max(100).default(""),
  default_from_email: z.string().email().or(z.literal("")).default(""),
  default_reply_to: z.string().email().or(z.literal("")).default(""),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d4ed8"),
  email_footer: z.string().max(2000).default(""),
});

function isTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
  catch { return false; }
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const [profile, contactCount, campaignCount] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (profile.error || contactCount.error || campaignCount.error) return NextResponse.json({ error: profile.error?.message ?? contactCount.error?.message ?? campaignCount.error?.message }, { status: 500 });
  return NextResponse.json({ profile: profile.data, email: user.email, counts: { contacts: contactCount.count ?? 0, campaigns: campaignCount.count ?? 0 }, integrations: { supabase: true, resend: Boolean(process.env.RESEND_API_KEY), webhook: Boolean(process.env.RESEND_WEBHOOK_SECRET) } });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const sender = await resolveSenderForSave(supabase, user.id, input.data.default_from_email);
  if (sender.error) return NextResponse.json({ error: sender.error }, { status: sender.status });
  const { data, error } = await supabase.from("profiles").upsert({ id: user.id, ...input.data, default_from_email: sender.fromEmail, updated_at: new Date().toISOString() }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 503 });
  // All workspaces share one Resend account, so only show the domains this user was granted.
  const { domains: granted, error: grantError } = await getAllowedSenderDomains(supabase, user.id);
  if (grantError) return NextResponse.json({ error: grantError }, { status: 500 });
  const { data, error } = await getResend().domains.list();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const domains = (data?.data ?? []).filter((domain) => granted.has(domain.name.toLowerCase()));
  return NextResponse.json({ connected: true, domains: domains.map((domain) => ({ id: domain.id, name: domain.name, status: domain.status })) });
}
