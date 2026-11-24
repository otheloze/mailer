import { describe, expect, it } from "vitest";
import { summarizeProgress } from "./send-progress";

describe("summarizeProgress", () => {
  it("counts each stage cumulatively", () => {
    const progress = summarizeProgress({ pending: 5, sent: 3, delivered: 4, opened: 2, clicked: 1, bounced: 1, failed: 1 });
    expect(progress).toMatchObject({ total: 17, queued: 5, sent: 10, delivered: 7, opened: 3, clicked: 1, bounced: 1, failed: 1, finished: 9, done: false });
  });

  it("is done once nothing is queued", () => {
    expect(summarizeProgress({ delivered: 2, bounced: 1 }).done).toBe(true);
    expect(summarizeProgress({ scheduled: 2 }).done).toBe(false);
  });

  it("is not done for an empty campaign", () => {
    expect(summarizeProgress({}).done).toBe(false);
  });
});
