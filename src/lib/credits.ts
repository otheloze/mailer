import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reserves credits as the signed-in user. Reserving only ever lowers the
 * caller's own balance, so it is safe to run with the user's session.
 */
export async function reserveCredits(
  supabase: SupabaseClient,
  service: "email_sending" | "email_discovery",
  amount: number,
  referenceKey: string,
  note: string,
) {
  const { data, error } = await supabase.rpc("reserve_service_credits", {
    p_service: service,
    p_amount: amount,
    p_reference_key: referenceKey,
    p_note: note,
  });
  if (error) return { error: error.message };
  return { error: null, reservation: data as { transaction_id: string; reserved: number; balance_after: number } };
}

/**
 * Settles a reservation. Runs with the service role because settling can
 * return credits; clients are not permitted to call it directly.
 */
export async function settleCredits(userId: string, referenceKey: string, consumed: number) {
  try {
    const { error } = await createAdminClient().rpc("server_settle_service_credit_reservation", {
      p_user_id: userId,
      p_reference_key: referenceKey,
      p_consumed: consumed,
    });
    return error ? error.message : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Credit settlement failed.";
  }
}

/** Refunds a settled reservation (for example, a canceled scheduled campaign). Server-only. */
export async function refundSettledCredits(userId: string, referenceKey: string, refundKey: string, note: string) {
  try {
    const { error } = await createAdminClient().rpc("server_refund_service_credit_reservation", {
      p_user_id: userId,
      p_reference_key: referenceKey,
      p_refund_key: refundKey,
      p_note: note,
    });
    return error ? error.message : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Credit refund failed.";
  }
}
