import { describe, expect, it } from "vitest";
import { mustSubscribe, trialSummary, type TrialStatus } from "@/lib/trial-shared";

const base: TrialStatus = { has_full_access: false, trial_eligible: true, test_email_available: true, discovery_available: true };

describe("mustSubscribe", () => {
  it("lets a fresh trial user in", () => expect(mustSubscribe(base)).toBe(false));
  it("keeps access while one trial action remains", () => {
    expect(mustSubscribe({ ...base, test_email_available: false })).toBe(false);
    expect(mustSubscribe({ ...base, discovery_available: false })).toBe(false);
  });
  it("requires a subscription once both are used", () => {
    expect(mustSubscribe({ ...base, test_email_available: false, discovery_available: false })).toBe(true);
  });
  it("never gates subscribers, admins or demo users", () => {
    expect(mustSubscribe({ has_full_access: true, trial_eligible: false, test_email_available: false, discovery_available: false })).toBe(false);
  });
  it("requires a subscription for lapsed subscribers", () => {
    expect(mustSubscribe({ has_full_access: false, trial_eligible: false, test_email_available: false, discovery_available: false })).toBe(true);
  });
  it("does not lock anyone out when the status is unknown", () => expect(mustSubscribe(null)).toBe(false));
});

describe("trialSummary", () => {
  it("describes what is left", () => {
    expect(trialSummary(base)).toBe("1 test email · 1 discovery (3 results)");
    expect(trialSummary({ ...base, test_email_available: false })).toBe("test email used · 1 discovery (3 results)");
  });
});
