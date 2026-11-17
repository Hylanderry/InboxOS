import { secureStringEquals } from "./auth-crypto.ts";

/**
 * claim_email_challenge returns false after the first successful verification.
 * Allow a repeated verification ONLY if the supplied code still matches the
 * stored digest; verified_at by itself is never proof of code possession.
 */
export function recoveryCodeIsVerified(
  claimedNow: boolean,
  previouslyVerifiedAt: string | null,
  submittedCodeHash: string,
  storedCodeHash: string,
): boolean {
  return (
    claimedNow === true ||
    (Boolean(previouslyVerifiedAt) && secureStringEquals(submittedCodeHash, storedCodeHash))
  );
}
