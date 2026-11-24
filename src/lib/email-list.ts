const EMAIL_PATTERN = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi;

/** Pulls every email address out of pasted text or a .txt/.csv file, lowercased and de-duplicated in order. */
export function extractEmails(text: string) {
  return [...new Set((text.match(EMAIL_PATTERN) ?? []).map((email) => email.toLowerCase().replace(/^[.'-]+|[.'-]+$/g, "")))];
}
