import { afterEach, describe, expect, it, vi } from "vitest";
import { isResendLastSegment, isResendNotFound, planSegmentReconciliation, withResendRetry, type EligibleAddress } from "./segments";

const address = (email: string): EligibleAddress => ({ id: email, email, resendContactId: null, firstName: null, lastName: null });

describe("planSegmentReconciliation", () => {
  it("adds missing eligible addresses and removes ineligible members", () => {
    const plan = planSegmentReconciliation(
      [
        { id: "c1", email: "keep@example.com", unsubscribed: false },
        { id: "c2", email: "gone@example.com", unsubscribed: false },
        { id: "c3", email: "Opted.Out@example.com", unsubscribed: true },
      ],
      [address("keep@example.com"), address("new@example.com"), address("opted.out@example.com")],
    );
    expect(plan.toRemove.map((member) => member.id)).toEqual(["c2"]);
    expect(plan.toAdd.map((item) => item.email)).toEqual(["new@example.com"]);
    expect([...plan.unsubscribedEmails]).toEqual(["opted.out@example.com"]);
  });

  it("removes everyone when nothing is eligible", () => {
    const plan = planSegmentReconciliation([{ id: "c1", email: "a@example.com", unsubscribed: false }], []);
    expect(plan.toRemove).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(0);
  });
});

describe("withResendRetry", () => {
  afterEach(() => vi.useRealTimers());

  it("returns immediately on success or non-rate-limit errors", async () => {
    const ok = vi.fn().mockResolvedValue({ data: { id: "1" }, error: null });
    expect(await withResendRetry(ok)).toEqual({ data: { id: "1" }, error: null });
    expect(ok).toHaveBeenCalledTimes(1);

    const failed = vi.fn().mockResolvedValue({ data: null, error: { message: "bad", statusCode: 422 } });
    expect((await withResendRetry(failed)).error?.message).toBe("bad");
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("retries rate-limited calls", async () => {
    vi.useFakeTimers();
    const call = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "slow down", statusCode: 429 } })
      .mockResolvedValueOnce({ data: { id: "2" }, error: null });
    const pending = withResendRetry(call);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ data: { id: "2" }, error: null });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("converts thrown errors into error results", async () => {
    const call = vi.fn().mockRejectedValue(new Error("network down"));
    expect((await withResendRetry(call)).error?.message).toBe("network down");
  });
});

describe("isResendNotFound", () => {
  it("treats 404s and not-found messages as already gone", () => {
    expect(isResendNotFound({ message: "x", statusCode: 404 })).toBe(true);
    expect(isResendNotFound({ message: "x", name: "not_found" })).toBe(true);
    expect(isResendNotFound({ message: "Segment not found" })).toBe(true);
  });

  it("does not hide other errors", () => {
    expect(isResendNotFound(null)).toBe(false);
    expect(isResendNotFound({ message: "Invalid API key", statusCode: 401 })).toBe(false);
  });
});

describe("isResendLastSegment", () => {
  it("spots Resend refusing to delete the account's last Segment", () => {
    expect(isResendLastSegment({ message: "Cannot delete last audience." })).toBe(true);
    expect(isResendLastSegment({ message: "Cannot delete last segment" })).toBe(true);
    expect(isResendLastSegment({ message: "Invalid API key" })).toBe(false);
    expect(isResendLastSegment(null)).toBe(false);
  });
});
