// Pure trial logic. Safe to import from middleware and client components.
/** Results a trial user gets from their single discovery. */
export const TRIAL_DISCOVERY_RESULTS = 3;

export type TrialAction = "test_email" | "discovery";

export type TrialStatus = {
  has_full_access: boolean;
  trial_eligible: boolean;
  test_email_available: boolean;
  discovery_available: boolean;
};

/** True when a user has no access and nothing left in the trial, so they must subscribe. */
export function mustSubscribe(status: TrialStatus | null | undefined) {
  if (!status) return false; // unknown state: never lock someone out on an error
  if (status.has_full_access) return false;
  return !status.test_email_available && !status.discovery_available;
}

/** Short human-readable summary of what is left of the trial. */
export function trialSummary(status: TrialStatus) {
  const parts = [
    `${status.test_email_available ? "1 test email" : "test email used"}`,
    `${status.discovery_available ? `1 discovery (${TRIAL_DISCOVERY_RESULTS} results)` : "discovery used"}`,
  ];
  return parts.join(" · ");
}

export const TRIAL_USED_MESSAGE = "Your free trial for this feature has been used. Choose a subscription to continue.";
