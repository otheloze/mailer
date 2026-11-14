import { describe, expect, it } from "vitest";
import { progressStatusesBelow } from "./recipient-status";

describe("progressStatusesBelow", () => {
  it("only lets progress statuses move forward", () => {
    expect(progressStatusesBelow("delivered")).toEqual(["pending", "scheduled", "sent", "delivery_delayed"]);
    expect(progressStatusesBelow("clicked")).not.toContain("clicked");
    expect(progressStatusesBelow("delivered")).not.toContain("opened");
    expect(progressStatusesBelow("pending")).toEqual([]);
  });

  it("returns null for failure states so they always apply", () => {
    for (const status of ["bounced", "complained", "failed", "suppressed"]) expect(progressStatusesBelow(status)).toBeNull();
  });
});
