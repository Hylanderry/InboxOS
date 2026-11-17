/** Pure eligibility guard for the one-time System Admin bootstrap.
 * A matching but unverified e-mail must never grant system privileges.
 * Caller must still use the atomic database RPC to resolve concurrent claims.
 */
export interface BootstrapIdentity {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

export function eligibleBootstrapIdentity(
  sessionUserId: string,
  authUser: BootstrapIdentity | null | undefined,
  allowedEmails: string | undefined,
): boolean {
  if (
    !authUser ||
    authUser.id !== sessionUserId ||
    !authUser.email ||
    !authUser.email_confirmed_at
  ) {
    return false;
  }
  const confirmationTime = Date.parse(authUser.email_confirmed_at);
  if (!Number.isFinite(confirmationTime) || confirmationTime > Date.now()) {
    return false;
  }
  const email = authUser.email.trim().toLowerCase();
  if (!email || email.length > 254) return false;
  return (allowedEmails ?? "").split(",").some((allowed) => allowed.trim().toLowerCase() === email);
}
