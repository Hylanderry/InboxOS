export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export const REGISTRATION_LEGAL_CONSENT_COOKIE = "inboxos_registration_legal_consent";
export const REGISTRATION_LEGAL_CONSENT_TTL_SECONDS = 30 * 60;
export const REGISTRATION_LEGAL_CONSENT_TTL_MS = REGISTRATION_LEGAL_CONSENT_TTL_SECONDS * 1000;

function cookieValue(cookieString: string, name: string) {
  const encodedName = `${encodeURIComponent(name)}=`;
  for (const part of cookieString.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(encodedName)) continue;
    try {
      return decodeURIComponent(trimmed.slice(encodedName.length));
    } catch {
      return null;
    }
  }
  return null;
}

export function getRegistrationLegalConsentExpiry(cookieString: string) {
  const value = cookieValue(cookieString, REGISTRATION_LEGAL_CONSENT_COOKIE);
  if (!value) return null;
  const expiresAt = Number(value);
  return Number.isSafeInteger(expiresAt) ? expiresAt : null;
}

export function hasRegistrationLegalConsentCookie(cookieString: string, now = Date.now()) {
  const expiresAt = getRegistrationLegalConsentExpiry(cookieString);
  return expiresAt !== null && expiresAt > now;
}

export function createRegistrationLegalConsentCookie(now = Date.now()) {
  const expiresAt = now + REGISTRATION_LEGAL_CONSENT_TTL_MS;
  return `${REGISTRATION_LEGAL_CONSENT_COOKIE}=${expiresAt}; Max-Age=${REGISTRATION_LEGAL_CONSENT_TTL_SECONDS}; Path=/auth/register; SameSite=Lax`;
}

export function clearRegistrationLegalConsentCookie() {
  return `${REGISTRATION_LEGAL_CONSENT_COOKIE}=; Max-Age=0; Path=/auth/register; SameSite=Lax`;
}

export function hasReachedLegalDocumentEnd({
  scrollTop,
  clientHeight,
  scrollHeight,
}: ScrollMetrics) {
  return scrollTop + clientHeight >= scrollHeight;
}
