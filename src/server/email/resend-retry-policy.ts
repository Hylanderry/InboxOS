/** Retry transient Resend outcomes only. Network errors are considered
 * ambiguous, so any repeated request must reuse the same idempotency key.
 */
export function shouldRetryResend(
  status: number | null,
  attempt: number,
  maxAttempts: number,
): boolean {
  return (
    Number.isInteger(attempt) &&
    Number.isInteger(maxAttempts) &&
    attempt >= 1 &&
    maxAttempts >= 1 &&
    attempt < maxAttempts &&
    (status === null || status === 429 || (status >= 500 && status <= 599))
  );
}
