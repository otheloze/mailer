const PROGRESS_ORDER = ["pending", "scheduled", "sent", "delivery_delayed", "delivered", "opened", "clicked"];

/** For progress statuses, the statuses that may be advanced to `status`; null for failure states (always applied). */
export function progressStatusesBelow(status: string) {
  const rank = PROGRESS_ORDER.indexOf(status);
  if (rank === -1) return null;
  return PROGRESS_ORDER.slice(0, rank);
}
