// Recipient statuses written by the Resend webhook (src/app/api/webhooks/resend).
// A recipient's status is the furthest point it has reached, so the
// cumulative counters below add up the statuses at or beyond each stage.
export const RECIPIENT_STATUSES = [
  "pending", "scheduled", "sent", "delivery_delayed", "delivered", "opened", "clicked",
  "bounced", "complained", "failed", "suppressed",
] as const;

export type RecipientStatus = typeof RECIPIENT_STATUSES[number];

export type SendProgress = {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  /** Recipients Resend has finished with (delivered or failed one way or another). */
  finished: number;
  /** True once nothing is waiting to go out. */
  done: boolean;
};

export function summarizeProgress(byStatus: Partial<Record<string, number>>): SendProgress {
  const n = (...statuses: RecipientStatus[]) => statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
  const total = n(...RECIPIENT_STATUSES);
  const queued = n("pending", "scheduled");
  const delivered = n("delivered", "opened", "clicked");
  const bounced = n("bounced", "suppressed");
  const complained = n("complained");
  const failed = n("failed");
  return {
    total,
    queued,
    sent: n("sent", "delivery_delayed") + delivered,
    delivered,
    opened: n("opened", "clicked"),
    clicked: n("clicked"),
    bounced,
    complained,
    failed,
    finished: delivered + bounced + complained + failed,
    done: total > 0 && queued === 0,
  };
}
