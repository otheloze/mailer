import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TrialAction, TrialStatus } from "@/lib/trial-shared";

export * from "@/lib/trial-shared";

/** Platform sender for trial test emails; must be on a Resend-verified domain. */
export function trialFromAddress() {
  return process.env.TRIAL_FROM_EMAIL || process.env.SUPPORT_FROM_EMAIL || process.env.ORDER_FROM_EMAIL || null;
}

export async function getTrialStatus(supabase: SupabaseClient): Promise<TrialStatus | null> {
  const { data, error } = await supabase.rpc("get_trial_status");
  if (error || !data) return null;
  return data as TrialStatus;
}

/** Atomically uses one trial action as the signed-in user. False when unavailable. */
export async function claimTrial(supabase: SupabaseClient, action: TrialAction) {
  const { data, error } = await supabase.rpc("claim_trial_action", { p_action: action });
  if (error) return { granted: false as const, error: error.message };
  return { granted: data === true, error: null };
}

/** Gives a trial action back after a failure. Server only. */
export async function releaseTrial(userId: string, action: TrialAction) {
  try {
    const { error } = await createAdminClient().rpc("release_trial_action", { p_user_id: userId, p_action: action });
    return error ? error.message : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not release the trial action.";
  }
}
