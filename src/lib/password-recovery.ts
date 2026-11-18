// A short-lived marker cookie tells /auth/callback that the emailed link it is
// about to exchange is a password-recovery link, so it should land on the
// "set a new password" page. A cookie is used instead of a `?next=` query on
// the redirect URL because Supabase only honours redirect URLs that match its
// allow-list, and this way the existing /auth/callback entry keeps working.
export const RECOVERY_COOKIE = "mm_password_recovery";
export const RECOVERY_MAX_AGE_SECONDS = 60 * 60;
