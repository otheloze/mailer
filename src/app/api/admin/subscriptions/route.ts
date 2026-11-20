import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getResend } from "@/lib/resend";

const userId = z.string().uuid();
const senderDomain = z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a valid domain such as example.com.");
const packageSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(40),
  price_cents: z.number().int().min(0).max(10_000_000),
  paystack_price_kobo: z.number().int().min(0).max(1_000_000_000),
  email_sending_credits: z.number().int().min(0).max(10_000_000),
  email_discovery_credits: z.number().int().min(0).max(10_000_000),
  duration_days: z.number().int().min(1).max(3650),
  rollover_policy: z.enum(["expire", "rollover"]),
  enabled: z.boolean(),
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account_status"), userId, status: z.enum(["active", "suspended", "deactivated"]), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("subscription_status"), userId, status: z.enum(["active", "suspended", "expired", "canceled"]) }),
  z.object({ action: z.literal("assign_package"), userId, packageSlug: z.string().regex(/^[a-z0-9-]{2,40}$/) }),
  z.object({ action: z.literal("adjust_credits"), userId, service: z.enum(["email_sending", "email_discovery"]), amount: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0), note: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("extend_subscription"), userId, days: z.number().int().min(1).max(3650) }),
  z.object({ action: z.literal("save_package"), package: packageSchema }),
  z.object({ action: z.literal("grant_sender_domain"), userId, domain: senderDomain }),
  z.object({ action: z.literal("revoke_sender_domain"), userId, domain: senderDomain }),
]);

async function getAdministrator() {
  const supabase = await createClient();
  if (!supabase) return { response: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (user.app_metadata?.role !== "admin") return { response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await getAdministrator();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  const users: { id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown>; banned_until?: string | null }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    users.push(...data.users);
    if (data.users.length < 1000) break;
    if (users.length >= 10000) return NextResponse.json({ error: "Client list exceeds the supported admin page size." }, { status: 413 });
  }
  const [packages, subscriptions, balances, controls, payments, transactions, audit, senderDomains] = await Promise.all([
    admin.from("subscription_packages").select("*").order("price_cents"),
    admin.from("client_subscriptions").select("id,user_id,package_id,status,started_at,expires_at,last_payment_at,package:subscription_packages(id,slug,name,price_cents,paystack_price_kobo,email_sending_credits,email_discovery_credits,duration_days,rollover_policy)"),
    admin.from("credit_balances").select("user_id,email_sending,email_discovery,updated_at"),
    admin.from("client_account_controls").select("user_id,status,note,updated_by,updated_at"),
    admin.from("subscription_payments").select("id,user_id,subscription_id,package_id,amount_cents,refunded_cents,currency,status,payment_provider,provider_reference,paid_at,created_at,package:subscription_packages(name,slug)").order("created_at", { ascending: false }).limit(5000),
    admin.from("credit_transactions").select("id,user_id,service,amount,balance_after,transaction_type,reference_key,related_reference,note,actor_id,created_at").order("created_at", { ascending: false }).limit(10000),
    admin.from("subscription_admin_audit").select("id,actor_id,target_user_id,action,details,created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("sender_domain_grants").select("user_id,domain").order("domain"),
  ]);
  const queryError = packages.error || subscriptions.error || balances.error || controls.error || payments.error || transactions.error || audit.error || senderDomains.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const now = Date.now();
  const currentUserId = auth.user.id;
  const clients = users.map((user) => {
    const subscription = subscriptions.data?.find((row) => row.user_id === user.id) ?? null;
    return {
      id: user.id,
      email: user.email ?? "",
      name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      created_at: user.created_at,
      banned_until: user.banned_until ?? null,
      account: controls.data?.find((row) => row.user_id === user.id) ?? { status: "active", note: null },
      subscription,
      effective_subscription_status: subscription?.status === "active" && Date.parse(subscription.expires_at) <= now ? "expired" : subscription?.status ?? "none",
      balances: balances.data?.find((row) => row.user_id === user.id) ?? { email_sending: 0, email_discovery: 0 },
      payments: payments.data?.filter((row) => row.user_id === user.id) ?? [],
      transactions: transactions.data?.filter((row) => row.user_id === user.id) ?? [],
      is_self: user.id === currentUserId,
      sender_domains: senderDomains.data?.filter((row) => row.user_id === user.id).map((row) => row.domain as string) ?? [],
    };
  });
  const active = clients.filter((client) => client.account.status === "active" && client.effective_subscription_status === "active").length;
  const expired = clients.filter((client) => client.effective_subscription_status === "expired").length;
  const revenueByCurrency = (payments.data ?? []).filter((payment) => payment.status === "paid" || payment.status === "refunded")
    .reduce<Record<string, number>>((totals, payment) => {
      totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount_cents - payment.refunded_cents;
      return totals;
    }, {});

  return NextResponse.json({
    // Your own account first, so self-service changes are not applied to the wrong client.
    clients: [...clients].sort((a, b) => Number(b.is_self) - Number(a.is_self)),
    packages: packages.data ?? [],
    audit: audit.data ?? [],
    stats: { total_clients: users.length, active_subscriptions: active, expired_subscriptions: expired, revenue_by_currency: revenueByCurrency },
  });
}

export async function POST(request: Request) {
  const auth = await getAdministrator();
  if ("response" in auth) return auth.response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid administrator action." }, { status: 400 });
  const { supabase, user } = auth;
  const admin = createAdminClient();
  let targetUserId: string | null = null;
  let action = "";
  let details: Record<string, unknown> = {};
  let operationError: string | null = null;

  switch (parsed.data.action) {
    case "account_status": {
      targetUserId = parsed.data.userId; action = parsed.data.action;
      if (targetUserId === user.id && parsed.data.status !== "active") {
        return NextResponse.json({ error: "You cannot suspend or deactivate your own administrator account." }, { status: 400 });
      }
      const { error } = await supabase.rpc("admin_set_account_status", {
        p_user_id: targetUserId, p_status: parsed.data.status, p_note: parsed.data.note ?? null,
      });
      operationError = error?.message ?? null;
      if (!operationError) {
        const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
          ban_duration: parsed.data.status === "active" ? "none" : "876000h",
        });
        operationError = authError?.message ?? null;
      }
      details = { status: parsed.data.status, note: parsed.data.note ?? null };
      break;
    }
    case "subscription_status": {
      targetUserId = parsed.data.userId; action = parsed.data.action; details = { status: parsed.data.status };
      const { error } = await supabase.rpc("admin_update_subscription_status", { p_user_id: targetUserId, p_status: parsed.data.status });
      operationError = error?.message ?? null;
      break;
    }
    case "assign_package": {
      targetUserId = parsed.data.userId; action = parsed.data.action; details = { package_slug: parsed.data.packageSlug };
      const { error } = await supabase.rpc("admin_assign_subscription", { p_user_id: targetUserId, p_package_slug: parsed.data.packageSlug });
      operationError = error?.message ?? null;
      break;
    }
    case "adjust_credits": {
      targetUserId = parsed.data.userId; action = parsed.data.action;
      details = { service: parsed.data.service, amount: parsed.data.amount, note: parsed.data.note };
      const { error } = await supabase.rpc("admin_adjust_service_credits", {
        p_user_id: targetUserId,
        p_service: parsed.data.service,
        p_amount: parsed.data.amount,
        p_reference_key: `admin-adjustment:${crypto.randomUUID()}`,
        p_note: parsed.data.note,
      });
      operationError = error?.message ?? null;
      break;
    }
    case "extend_subscription": {
      targetUserId = parsed.data.userId; action = parsed.data.action; details = { days: parsed.data.days };
      const { error } = await supabase.rpc("admin_extend_subscription", { p_user_id: targetUserId, p_days: parsed.data.days });
      operationError = error?.message ?? null;
      break;
    }
    case "grant_sender_domain": {
      targetUserId = parsed.data.userId; action = parsed.data.action; details = { domain: parsed.data.domain };
      // Only domains confirmed (verified) in Resend can be granted, otherwise sends would fail.
      const grantDomain = parsed.data.domain;
      if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured, so the domain cannot be checked." }, { status: 503 });
      const { data: resendDomains, error: resendError } = await getResend().domains.list();
      if (resendError) return NextResponse.json({ error: `Could not check Resend: ${resendError.message}` }, { status: 502 });
      const resendDomain = (resendDomains?.data ?? []).find((item) => item.name.toLowerCase() === grantDomain);
      if (!resendDomain) return NextResponse.json({ error: `${grantDomain} is not added in Resend yet. Add and verify it in Resend first.` }, { status: 409 });
      if (resendDomain.status !== "verified") return NextResponse.json({ error: `${grantDomain} is not verified in Resend yet (status: ${resendDomain.status}).` }, { status: 409 });
      const { error } = await admin.from("sender_domain_grants")
        .upsert({ user_id: targetUserId, domain: parsed.data.domain, granted_by: user.id }, { onConflict: "user_id,domain", ignoreDuplicates: true });
      operationError = error?.message ?? null;
      break;
    }
    case "revoke_sender_domain": {
      targetUserId = parsed.data.userId; action = parsed.data.action; details = { domain: parsed.data.domain };
      const { error } = await admin.from("sender_domain_grants").delete().eq("user_id", targetUserId).eq("domain", parsed.data.domain);
      operationError = error?.message ?? null;
      break;
    }
    case "save_package": {
      action = parsed.data.action; details = { package: parsed.data.package };
      const packageValues = { ...parsed.data.package, updated_at: new Date().toISOString() };
      const { error } = parsed.data.package.id
        ? await admin.from("subscription_packages").update(packageValues).eq("id", parsed.data.package.id)
        : await admin.from("subscription_packages").insert(packageValues);
      operationError = error?.message ?? null;
      break;
    }
  }
  if (operationError) return NextResponse.json({ error: operationError }, { status: 400 });
  const { error: auditError } = await admin.from("subscription_admin_audit").insert({
    actor_id: user.id,
    target_user_id: targetUserId,
    action,
    details,
  });
  if (auditError) return NextResponse.json({ error: `Action completed but audit recording failed: ${auditError.message}` }, { status: 500 });
  return NextResponse.json({ updated: true });
}
