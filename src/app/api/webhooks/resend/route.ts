import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { progressStatusesBelow } from "@/lib/recipient-status";

type ResendPayload = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    broadcast_id?: string;
    to?: string[];
    email?: string;
    unsubscribed?: boolean;
    origin?: string;
    [key: string]: unknown;
  };
};

function isResendPayload(value: unknown): value is ResendPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.type !== "string" || typeof payload.data !== "object" || payload.data === null) return false;

  const data = payload.data as Record<string, unknown>;
  return (payload.created_at === undefined || typeof payload.created_at === "string")
    && (data.email_id === undefined || typeof data.email_id === "string")
    && (data.broadcast_id === undefined || typeof data.broadcast_id === "string")
    && (data.to === undefined || (Array.isArray(data.to) && data.to.every((email) => typeof email === "string")))
    && (data.email === undefined || typeof data.email === "string")
    && (data.unsubscribed === undefined || typeof data.unsubscribed === "boolean")
    && (data.origin === undefined || typeof data.origin === "string");
}

export async function POST(request: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  }
  const payloadText = await request.text();
  let payload: ResendPayload;
  try {
    const verified = getResend().webhooks.verify({
      payload: payloadText,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
    if (!isResendPayload(verified)) return NextResponse.json({ error: "Malformed webhook event." }, { status: 400 });
    payload = verified;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  const eventId = request.headers.get("svix-id");
  if (!eventId || !payload.type || !payload.data) return NextResponse.json({ error: "Malformed webhook event." }, { status: 400 });

  const admin = createAdminClient();
  const email = (payload.data.email ?? payload.data.to?.[0] ?? "").trim().toLowerCase();
  const recipientEmails = [...new Set([payload.data.email, ...(payload.data.to ?? [])].filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const broadcastId = payload.data.broadcast_id;
  const updatedAt = new Date().toISOString();
  const affected = new Set<string>();
  const updateAddressStatuses = async (emails: string[], status: string) => {
    if (!emails.length) return null;
    const { data: addresses, error } = await admin.from("contact_emails")
      .update({ status, updated_at: updatedAt })
      .in("email", emails)
      .select("user_id,contact_id,is_primary");
    if (error) return error.message;
    addresses?.forEach((address) => affected.add(address.user_id));
    const primaryContactIds = (addresses ?? []).filter((address) => address.is_primary).map((address) => address.contact_id);
    if (primaryContactIds.length) {
      const { error: primaryError } = await admin.from("contacts")
        .update({ status, updated_at: updatedAt })
        .in("id", primaryContactIds);
      if (primaryError) return primaryError.message;
    }
    return null;
  };
  let campaign: { id: string; user_id: string } | null = null;
  if (broadcastId) {
    const { data, error } = await admin.from("campaigns").select("id,user_id").eq("resend_broadcast_id", broadcastId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    campaign = data;
  }
  if (payload.type === "contact.updated" && email && payload.data.unsubscribed === true) {
    const error = await updateAddressStatuses([email], "unsubscribed");
    if (error) return NextResponse.json({ error }, { status: 500 });
  } else if (payload.type === "suppression.added" && email) {
    const status = payload.data.origin === "complaint" ? "complained" : "bounced";
    const error = await updateAddressStatuses([email], status);
    if (error) return NextResponse.json({ error }, { status: 500 });
  } else if ((payload.type === "email.bounced" || payload.type === "email.complained" || payload.type === "email.suppressed") && recipientEmails.length) {
    const status = payload.type === "email.complained" ? "complained" : "bounced";
    const error = await updateAddressStatuses(recipientEmails, status);
    if (error) return NextResponse.json({ error }, { status: 500 });
  } else if (payload.type.startsWith("email.") && email) {
    const { data, error } = await admin.from("contact_emails").select("contact_id,user_id").eq("email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data?.forEach((row) => affected.add(row.user_id));
  }
  if (campaign) affected.add(campaign.user_id);

  if (payload.type.startsWith("email.") && campaign) {
    const occurredAt = payload.created_at && !Number.isNaN(Date.parse(payload.created_at)) ? payload.created_at : new Date().toISOString();
    const targets = recipientEmails;
    const contactRows = targets.length ? await admin.from("contact_emails").select("id,contact_id,email").eq("user_id", campaign.user_id).in("email", targets) : { data: [], error: null };
    if (contactRows.error) return NextResponse.json({ error: contactRows.error.message }, { status: 500 });
    const eventRows = (targets.length ? targets : [""]).map((to) => ({
      user_id: campaign!.user_id,
      campaign_id: campaign!.id,
      contact_id: contactRows.data?.find((contact) => contact.email === to)?.contact_id ?? null,
      resend_event_id: targets.length > 1 ? `${eventId}:${to}` : eventId,
      event_type: payload.type,
      occurred_at: occurredAt,
      payload: payload.data,
    }));
    const { error } = await admin.from("campaign_events").upsert(eventRows, { onConflict: "resend_event_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const recipientStatus: Record<string, string> = {
      "email.sent": "sent",
      "email.scheduled": "scheduled",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delivery_delayed",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.failed": "failed",
      "email.suppressed": "suppressed",
    };
    const nextStatus = recipientStatus[payload.type];
    const addressIds = (contactRows.data ?? []).map((address) => address.id);
    if (nextStatus && addressIds.length) {
      // Webhooks can arrive out of order. Progress states only move forward
      // (e.g. a late "delivered" must not overwrite "opened"); terminal
      // failure states (bounced, complained, failed, suppressed) always apply.
      let update = admin.from("campaign_recipients")
        .update({ status: nextStatus, ...(payload.data.email_id ? { resend_email_id: payload.data.email_id } : {}) })
        .eq("campaign_id", campaign.id)
        .in("contact_email_id", addressIds);
      const lowerStatuses = progressStatusesBelow(nextStatus);
      if (lowerStatuses) update = update.in("status", lowerStatuses);
      const { error: recipientUpdateError } = await update;
      if (recipientUpdateError) return NextResponse.json({ error: recipientUpdateError.message }, { status: 500 });
    }
    if (["email.sent", "email.delivered", "email.failed", "email.suppressed", "email.bounced", "email.complained"].includes(payload.type)) {
      const { count, error: pendingError } = await admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["pending", "scheduled"]);
      if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });
      if (!count) {
        const { count: sentCount, error: sentError } = await admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["sent", "delivered", "opened", "clicked"]);
        if (sentError) return NextResponse.json({ error: sentError.message }, { status: 500 });
        const { error: updateError } = await admin.from("campaigns").update({ status: sentCount ? "sent" : "failed", sent_at: occurredAt, updated_at: new Date().toISOString() }).eq("id", campaign.id).in("status", ["sending", "scheduled"]);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        const { error: jobError } = await admin.from("scheduled_jobs").update({ status: "done" }).eq("campaign_id", campaign.id).eq("user_id", campaign.user_id);
        if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
      }
    }
    if (payload.type === "email.scheduled") {
      const { error: updateError } = await admin.from("campaigns").update({ status: "scheduled" }).eq("id", campaign.id).in("status", ["sending", "scheduled"]);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }
  if (!campaign && affected.size && (payload.type === "contact.updated" || payload.type === "suppression.added")) {
    const occurredAt = payload.created_at && !Number.isNaN(Date.parse(payload.created_at)) ? payload.created_at : new Date().toISOString();
    const { data: addresses, error: contactError } = await admin.from("contact_emails").select("contact_id,user_id").eq("email", email).limit(1);
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
    const ownerId = addresses?.[0]?.user_id;
    if (ownerId) {
      const { error } = await admin.from("campaign_events").upsert({
        user_id: ownerId,
        contact_id: addresses?.[0]?.contact_id,
        resend_event_id: eventId,
        event_type: payload.type,
        occurred_at: occurredAt,
        payload: payload.data,
      }, { onConflict: "resend_event_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
