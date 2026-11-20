import { z } from "zod";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend } from "@/lib/resend";
import { hasCampaignBodyContent, renderCampaignEmail } from "@/lib/render-email";
import { refundSettledCredits, reserveCredits, settleCredits } from "@/lib/credits";
import { rateLimitResponse } from "@/lib/rate-limit";
import { getAllowedSenderDomains, isDomainAllowed, senderDomainError } from "@/lib/sender-domains";
import { claimTrial, getTrialStatus, releaseTrial, trialFromAddress, TRIAL_USED_MESSAGE } from "@/lib/trial";
import { loadEligibleAddresses, reconcileSegment, storeResendContactId } from "@/lib/segments";

// Large audiences require Segment reconciliation before sending; allow up to 5 minutes (Vercel Pro).
export const maxDuration = 300;

const schema = z.object({
  scheduledAt: z.string().datetime().optional(),
  testEmail: z.string().trim().toLowerCase().email().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid send request." }, { status: 400 });
  // Accounts without a subscription get one free test email, sent over SMTP instead of Resend.
  const trialStatus = input.data.testEmail ? await getTrialStatus(supabase) : null;
  const isTrialSend = Boolean(trialStatus && !trialStatus.has_full_access);
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Configure RESEND_API_KEY before sending." }, { status: 503 });
  const { id } = await params;
  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const { domains: senderDomains, error: domainLookupError } = await getAllowedSenderDomains(supabase, user.id);
  if (domainLookupError) return NextResponse.json({ error: domainLookupError }, { status: 500 });

  if (input.data.testEmail && isTrialSend) {
    const limited = await rateLimitResponse(`test-send:${user.id}`, 10, 3600);
    if (limited) return limited;
    if (!trialStatus?.trial_eligible || !trialStatus.test_email_available) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
    const trialFrom = trialFromAddress();
    if (!trialFrom) return NextResponse.json({ error: "Trial test emails are not available right now. Please contact support." }, { status: 503 });
    if (!campaign.subject || !campaign.html) return NextResponse.json({ error: "Add a subject and email design before sending a test." }, { status: 400 });
    if (!hasCampaignBodyContent(campaign.html)) return NextResponse.json({ error: "Add visible content to the email body before sending a test." }, { status: 400 });
    // Trial tests may only go to the account's own address.
    const ownEmail = user.email?.toLowerCase();
    if (!ownEmail || input.data.testEmail !== ownEmail) return NextResponse.json({ error: `During the free trial, test emails can only be sent to your account email (${user.email}).` }, { status: 403 });
    const claim = await claimTrial(supabase, "test_email");
    if (claim.error) return NextResponse.json({ error: claim.error }, { status: 500 });
    if (!claim.granted) return NextResponse.json({ error: TRIAL_USED_MESSAGE, code: "trial_used" }, { status: 402 });
    try {
      const html = await renderCampaignEmail({ html: campaign.html, previewText: campaign.preview_text, companyName: null, mailingAddress: "" });
      // Sent through Resend (not the cPanel mailbox) from the platform's own verified address,
      // so a trial user cannot choose the sender and delivery reputation is Resend's.
      const { data: sent, error: sendError } = await getResend().emails.send({
        from: `${campaign.from_name || "MYMAILMARKET"} <${trialFrom}>`,
        to: [ownEmail],
        subject: `[Test] ${campaign.subject}`,
        html: html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/unsubscribe`),
        text: campaign.text_content || undefined,
        replyTo: campaign.reply_to || undefined,
      });
      if (sendError || !sent?.id) throw new Error(sendError?.message ?? "Resend did not return a message id.");
      return NextResponse.json({ accepted: true, id: sent.id, trial: true });
    } catch (error) {
      await releaseTrial(user.id, "test_email");
      console.error("Trial test email failed:", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "The test email could not be sent. Your free test has not been used; please try again." }, { status: 502 });
    }
  }

  if (input.data.testEmail) {
    const limited = await rateLimitResponse(`test-send:${user.id}`, 10, 3600);
    if (limited) return limited;
    if (!campaign.from_email || !campaign.subject || !campaign.html) return NextResponse.json({ error: "Add a sender, subject, and email design before sending a test." }, { status: 400 });
    const domainError = senderDomainError(campaign.from_email, senderDomains);
    if (domainError) return NextResponse.json({ error: domainError }, { status: 403 });
    // Test sends may only go to the account owner or to an address on the workspace's own approved domains.
    const testRecipient = input.data.testEmail;
    if (testRecipient !== user.email?.toLowerCase() && !isDomainAllowed(testRecipient, senderDomains)) {
      return NextResponse.json({ error: `Test emails can only be sent to your account email (${user.email}) or an address on your approved sender domain.` }, { status: 403 });
    }
    if (!hasCampaignBodyContent(campaign.html)) return NextResponse.json({ error: "Add visible content to the email body before sending a test." }, { status: 400 });
    const html = await renderCampaignEmail({
      html: campaign.html,
      previewText: campaign.preview_text,
      companyName: null,
      mailingAddress: "",
    });
    const reservationKey = `test-email:${user.id}:${crypto.randomUUID()}`;
    const reservation = await reserveCredits(supabase, "email_sending", 1, reservationKey, `Campaign test: ${campaign.name}`);
    if (reservation.error) return NextResponse.json({ error: reservation.error }, { status: /credit|subscription|account/i.test(reservation.error) ? 402 : 500 });
    let sentId: string | undefined;
    let sendErrorMessage: string | null = null;
    try {
      const { data: sent, error: sendError } = await getResend().emails.send({
        from: `${campaign.from_name || "MYMAILMARKET"} <${campaign.from_email}>`,
        to: [testRecipient],
        subject: `[Test] ${campaign.subject}`,
        html: html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/unsubscribe`),
        text: campaign.text_content || undefined,
        replyTo: campaign.reply_to || undefined,
      });
      sentId = sent?.id;
      sendErrorMessage = sendError?.message ?? null;
    } catch (error) {
      sendErrorMessage = error instanceof Error ? error.message : "Resend test-send request failed.";
    }
    if (sendErrorMessage) {
      const refundError = await settleCredits(user.id, reservationKey, 0);
      return NextResponse.json({ error: `${sendErrorMessage}${refundError ? ` Credit release failed: ${refundError}` : ""}` }, { status: refundError ? 500 : 502 });
    }
    const settlementError = await settleCredits(user.id, reservationKey, 1);
    return NextResponse.json({ accepted: true, id: sentId, warning: settlementError ? `Email accepted, but credit settlement failed: ${settlementError}` : undefined });
  }

  // Free-trial accounts can send one test email but not campaigns; say so instead of surfacing the credit check.
  const accessStatus = await getTrialStatus(supabase);
  if (accessStatus && !accessStatus.has_full_access) {
    return NextResponse.json({
      error: "Sending to your audience needs a subscription. Your free trial includes one test email and one discovery. Choose a plan to send campaigns.",
      code: "subscription_required",
    }, { status: 402 });
  }
  const limited = await rateLimitResponse(`campaign-send:${user.id}`, 20, 3600);
  if (limited) return limited;
  if (campaign.status !== "draft" && campaign.status !== "scheduled") return NextResponse.json({ error: "This campaign has already been sent or is being sent." }, { status: 409 });
  if (campaign.status === "scheduled" && !input.data.scheduledAt) return NextResponse.json({ error: "Choose a new future time to update a scheduled campaign." }, { status: 400 });
  if (!campaign.audience_id) return NextResponse.json({ error: "Choose an audience before sending." }, { status: 400 });
  if (!campaign.from_email || !campaign.subject || !campaign.html) return NextResponse.json({ error: "Add a sender, subject, and email design before sending." }, { status: 400 });
  const domainError = senderDomainError(campaign.from_email, senderDomains);
  if (domainError) return NextResponse.json({ error: domainError }, { status: 403 });
  if (!hasCampaignBodyContent(campaign.html)) return NextResponse.json({ error: "Add visible content to the email body before sending." }, { status: 400 });
  if (input.data.scheduledAt && Date.parse(input.data.scheduledAt) <= Date.now()) return NextResponse.json({ error: "Choose a future schedule time." }, { status: 400 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("company_name,email_footer").eq("id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile?.email_footer?.trim()) return NextResponse.json({ error: "Add your company mailing address in Settings before sending a marketing campaign." }, { status: 400 });
  const { data: audience, error: audienceError } = await supabase.from("audiences").select("resend_segment_id").eq("id", campaign.audience_id).eq("user_id", user.id).maybeSingle();
  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
  if (!audience?.resend_segment_id) return NextResponse.json({ error: "This audience is not connected to a Resend Segment. Configure Resend and create a synced audience." }, { status: 409 });
  const segmentId: string = audience.resend_segment_id;
  const { addresses: eligibleAddresses, error: eligibleError } = await loadEligibleAddresses(supabase, user.id, campaign.audience_id);
  if (eligibleError) return NextResponse.json({ error: eligibleError }, { status: 500 });
  if (!eligibleAddresses.length) return NextResponse.json({ error: "This audience has no subscribed email addresses with recorded consent." }, { status: 400 });
  let html: string;
  try {
    html = await renderCampaignEmail({
      html: campaign.html,
      previewText: campaign.preview_text,
      companyName: profile.company_name,
      mailingAddress: profile.email_footer,
    });
  } catch (error) {
    return NextResponse.json({ error: `Could not render the campaign email: ${error instanceof Error ? error.message : "Unknown rendering error."}` }, { status: 400 });
  }

  // Delivery state is written with the service role; clients cannot change campaign status.
  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin.from("campaigns").update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).eq("status", campaign.status).select("id").maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claim) return NextResponse.json({ error: "This campaign is already being processed. Refresh before trying again." }, { status: 409 });

  if (campaign.status === "scheduled" && campaign.resend_broadcast_id) {
    const { error: cancelError } = await getResend().broadcasts.cancel(campaign.resend_broadcast_id);
    if (cancelError) {
      const recoveryError = await resetCampaign(admin, id, user.id, "scheduled");
      return NextResponse.json({ error: `Could not replace the scheduled Resend broadcast: ${cancelError.message}${recoveryError}` }, { status: 502 });
    }
    if (campaign.credit_reservation_key) {
      const refundError = await refundSettledCredits(
        user.id,
        campaign.credit_reservation_key,
        `scheduled-cancel:${id}:${campaign.credit_reservation_key}`,
        "Scheduled campaign canceled before delivery.",
      );
      if (refundError) {
        await resetCampaign(admin, id, user.id, "draft");
        return NextResponse.json({ error: `Resend canceled the previous schedule, but its credits could not be released: ${refundError}` }, { status: 500 });
      }
    }
  }

  // Broadcasts go to the whole Resend Segment, so make it match the eligible list exactly
  // before sending. This removes anyone who unsubscribed, was deleted, or moved audience.
  let reconciliation;
  try {
    reconciliation = await reconcileSegment(segmentId, eligibleAddresses, (address, contactId) => storeResendContactId(supabase, user.id, address, contactId));
  } catch (error) {
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `${error instanceof Error ? error.message : "Could not synchronize the Resend Segment."}${recoveryError}` }, { status: 502 });
  }
  if (reconciliation.removeFailures.length) {
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `Could not remove ${reconciliation.removeFailures.length} ineligible contact(s) from the Resend Segment, so the campaign was not sent. Try again shortly. ${reconciliation.removeFailures.slice(0, 3).join("; ")}${recoveryError}` }, { status: 502 });
  }
  // Charge only for addresses that are actually in the Segment and not unsubscribed at Resend.
  const recipients = eligibleAddresses.filter((address) => !reconciliation.failedAddEmails.has(address.email) && !reconciliation.unsubscribedEmails.has(address.email));
  if (!recipients.length) {
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `No eligible recipients could be added to the Resend Segment.${reconciliation.addFailures.length ? ` ${reconciliation.addFailures.slice(0, 3).join("; ")}` : ""}${recoveryError}` }, { status: 502 });
  }

  const { error: clearRecipientsError } = await supabase.from("campaign_recipients").delete().eq("campaign_id", id);
  if (clearRecipientsError) {
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `${clearRecipientsError.message}${recoveryError}` }, { status: 500 });
  }
  for (let offset = 0; offset < recipients.length; offset += 500) {
    const rows = recipients.slice(offset, offset + 500).map((address) => ({
      campaign_id: id,
      contact_id: address.contactId,
      contact_email_id: address.id,
      status: "pending",
    }));
    const { error: recipientError } = await supabase.from("campaign_recipients").insert(rows);
    if (recipientError) {
      const { error: deleteError } = await supabase.from("campaign_recipients").delete().eq("campaign_id", id);
      const recoveryError = await resetCampaign(admin, id, user.id, "draft");
      return NextResponse.json({ error: `${recipientError.message}${deleteError ? ` Recipient cleanup failed: ${deleteError.message}` : ""}${recoveryError}` }, { status: 500 });
    }
  }

  const reservationKey = `campaign-send:${id}:${crypto.randomUUID()}`;
  const reservation = await reserveCredits(supabase, "email_sending", recipients.length, reservationKey, `Campaign: ${campaign.name}`);
  if (reservation.error) {
    const { error: deleteError } = await supabase.from("campaign_recipients").delete().eq("campaign_id", id);
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    const status = /credit|subscription|account/i.test(reservation.error) ? 402 : 500;
    return NextResponse.json({ error: `${reservation.error}${deleteError ? ` Recipient cleanup failed: ${deleteError.message}` : ""}${recoveryError}` }, { status });
  }

  const resend = getResend();
  let broadcastId: string | undefined;
  let broadcastErrorMessage: string | null = null;
  try {
    const { data: broadcast, error: broadcastError } = await resend.broadcasts.create({
      segmentId,
      from: `${campaign.from_name || "MYMAILMARKET"} <${campaign.from_email}>`,
      subject: campaign.subject,
      html,
      text: campaign.text_content || undefined,
      replyTo: campaign.reply_to ? [campaign.reply_to] : undefined,
      name: campaign.name,
    });
    broadcastId = broadcast?.id;
    broadcastErrorMessage = broadcastError?.message ?? null;
  } catch (error) {
    broadcastErrorMessage = error instanceof Error ? error.message : "Resend broadcast creation failed.";
  }
  if (broadcastErrorMessage) {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    const { error: jobError } = await supabase.from("scheduled_jobs").update({ status: "canceled" }).eq("campaign_id", id).eq("user_id", user.id);
    return NextResponse.json({ error: `${broadcastErrorMessage}${refundError ? ` Credit release failed: ${refundError}` : ""}${recoveryError}${jobError ? ` Schedule cleanup failed: ${jobError.message}` : ""}` }, { status: refundError ? 500 : 502 });
  }
  if (!broadcastId) {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `Resend did not return a broadcast ID.${refundError ? ` Credit release failed: ${refundError}` : ""}${recoveryError}` }, { status: refundError ? 500 : 502 });
  }
  const scheduledAt = input.data.scheduledAt ?? null;
  const { error: persistIdError } = await admin.from("campaigns").update({
    resend_broadcast_id: broadcastId,
    scheduled_at: scheduledAt,
    credit_reservation_key: reservationKey,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id).eq("status", "sending");
  if (persistIdError) {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    return NextResponse.json({ error: `Created Resend draft ${broadcastId}, but could not save its ID before sending: ${persistIdError.message}${refundError ? ` Credit release failed: ${refundError}` : ""}${recoveryError}` }, { status: 500 });
  }
  let startErrorMessage: string | null = null;
  try {
    const { error: startError } = await resend.broadcasts.send(broadcastId, scheduledAt ? { scheduledAt } : {});
    startErrorMessage = startError?.message ?? null;
  } catch (error) {
    startErrorMessage = error instanceof Error ? error.message : "Resend broadcast send request failed.";
  }
  if (startErrorMessage) {
    const refundError = await settleCredits(user.id, reservationKey, 0);
    const recoveryError = await resetCampaign(admin, id, user.id, "draft");
    const { error: jobError } = await supabase.from("scheduled_jobs").update({ status: "canceled" }).eq("campaign_id", id).eq("user_id", user.id);
    return NextResponse.json({ error: `${startErrorMessage}${refundError ? ` Credit release failed: ${refundError}` : ""}${recoveryError}${jobError ? ` Schedule cleanup failed: ${jobError.message}` : ""}` }, { status: refundError ? 500 : 502 });
  }
  const settlementError = await settleCredits(user.id, reservationKey, recipients.length);
  const { error: updateError } = await admin.from("campaigns").update({
    status: scheduledAt ? "scheduled" : "sending",
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id).eq("status", "sending");
  if (updateError) return NextResponse.json({ error: `Resend accepted broadcast ${broadcastId}, but campaign status could not be saved: ${updateError.message}` }, { status: 500 });
  if (scheduledAt) {
    const { error: jobError } = await supabase.from("scheduled_jobs").upsert({ user_id: user.id, campaign_id: id, run_at: scheduledAt, status: "pending" }, { onConflict: "campaign_id" });
    if (jobError) return NextResponse.json({ error: `Resend scheduled the broadcast, but local schedule tracking failed: ${jobError.message}` }, { status: 500 });
  }
  const { error: activityError } = await supabase.from("activity_logs").insert({
    user_id: user.id,
    action: scheduledAt ? "campaigns.scheduled" : "campaigns.send_requested",
    entity_type: "campaign",
    entity_id: id,
    details: {
      broadcast_id: broadcastId,
      eligible_contacts: eligibleAddresses.length,
      recipients: recipients.length,
      segment_added: reconciliation.added,
      segment_removed: reconciliation.removed,
      provider_unsubscribed: reconciliation.unsubscribedEmails.size,
      add_failures: reconciliation.addFailures.length,
    },
  });
  const warnings = [
    reconciliation.addFailures.length ? `${reconciliation.addFailures.length} address(es) could not be added to the Resend Segment and were not charged.` : null,
    reconciliation.unsubscribedEmails.size ? `${reconciliation.unsubscribedEmails.size} address(es) are unsubscribed at Resend and were skipped.` : null,
    settlementError ? `Broadcast accepted, but credit settlement failed: ${settlementError}` : null,
    activityError ? `Broadcast accepted, but activity logging failed: ${activityError.message}` : null,
  ].filter(Boolean);
  return NextResponse.json({ accepted: true, broadcastId, eligibleContacts: recipients.length, scheduledAt, warning: warnings.length ? warnings.join(" ") : undefined });
}

async function resetCampaign(admin: SupabaseClient, id: string, userId: string, status: "draft" | "scheduled") {
  const values = status === "draft"
    ? { status, resend_broadcast_id: null, scheduled_at: null, credit_reservation_key: null, updated_at: new Date().toISOString() }
    : { status, updated_at: new Date().toISOString() };
  const { error } = await admin.from("campaigns").update(values).eq("id", id).eq("user_id", userId).eq("status", "sending");
  return error ? ` Campaign state recovery failed: ${error.message}` : "";
}
