import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { response: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (user.app_metadata?.role !== "admin") return { response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { data, error } = await createAdminClient().from("lead_data_orders")
    .select("id,email,targeting,lead_count,amount_minor,currency,payment_provider,status,paid_at,fulfilled_at,admin_note,created_at")
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

const actionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["fulfill", "reopen", "refunded"]),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid action." }, { status: 400 });
  const { orderId, action, note } = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const transitions = {
    fulfill: { from: ["paid"], values: { status: "fulfilled", fulfilled_at: now } },
    reopen: { from: ["fulfilled"], values: { status: "paid", fulfilled_at: null } },
    refunded: { from: ["paid", "fulfilled"], values: { status: "refunded" } },
  } as const;
  const transition = transitions[action];
  const { data, error } = await admin.from("lead_data_orders")
    .update({ ...transition.values, ...(note !== undefined ? { admin_note: note || null } : {}), updated_at: now })
    .eq("id", orderId).in("status", [...transition.from])
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "The order is not in a state that allows this action. Refresh and try again." }, { status: 409 });
  const { error: auditError } = await admin.from("subscription_admin_audit").insert({
    actor_id: auth.user.id, target_user_id: null, action: `lead_order_${action}`, details: { order_id: orderId, note: note ?? null },
  });
  if (auditError) console.error("Lead order audit failed:", auditError.message);
  return NextResponse.json({ updated: true });
}
