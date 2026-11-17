import {
  evaluatePassword,
  isValidCnpj,
  normalizePhoneE164,
  type SupportedCountryCode,
} from "../../features/auth/auth-validation.ts";
import { hashAuthValue } from "./auth-crypto.ts";
export interface RegistrationPayload {
  accountKind: "person" | "company";
  firstName?: string;
  lastName?: string;
  companyName?: string;
  taxId?: string;
  email: string;
  countryCode: SupportedCountryCode;
  phone: string;
  password: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  invitationId?: string | null;
  invitationToken?: string | null;
}
export interface ValidRegistrationPayload {
  accountKind: "person" | "company";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  taxCountry: "BR" | null;
  taxIdType: "CNPJ" | null;
  taxId: string | null;
  taxIdNormalized: string | null;
  email: string;
  countryCode: SupportedCountryCode;
  phoneE164: string;
  password: string;
  invitationId: string | null;
  invitationToken: string | null;
}
type E =
  | "payload"
  | "accountKind"
  | "name"
  | "companyName"
  | "email"
  | "countryCode"
  | "phone"
  | "password"
  | "taxId"
  | "legal";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  COUNTRIES = new Set([
    "BR",
    "AR",
    "CO",
    "CL",
    "MX",
    "US",
    "CA",
    "AU",
    "PT",
    "ES",
    "FR",
    "DE",
    "IT",
    "GB",
    "NL",
    "IE",
  ]);
function isPayload(x: unknown): x is RegistrationPayload {
  if (!x || typeof x !== "object") return false;
  const v = x as Partial<RegistrationPayload> & Record<never, never>;
  return (
    (v.accountKind === "person" || v.accountKind === "company") &&
    typeof v.email === "string" &&
    typeof v.countryCode === "string" &&
    typeof v.phone === "string" &&
    typeof v.password === "string" &&
    typeof v.acceptedTerms === "boolean" &&
    typeof v.acceptedPrivacy === "boolean"
  );
}
export function normalizeAuthEmail(e: string) {
  return e.trim().toLowerCase();
}
export function validateRegistrationPayload(
  input: unknown,
): { ok: true; value: ValidRegistrationPayload } | { ok: false; errors: E[] } {
  if (!isPayload(input)) return { ok: false, errors: ["payload"] };
  const errors: E[] = [],
    email = normalizeAuthEmail(input.email),
    first = input.firstName?.trim() || null,
    last = input.lastName?.trim() || null,
    company = input.companyName?.trim() || null,
    country = input.countryCode,
    taxNorm = input.taxId?.replace(/\D/g, "") || null,
    phone = COUNTRIES.has(country) ? normalizePhoneE164(country, input.phone) : null;
  if (input.accountKind === "person" && (!first || !last)) errors.push("name");
  if (input.accountKind === "company" && !company) errors.push("companyName");
  if (!EMAIL.test(email) || email.length > 320) errors.push("email");
  if (!COUNTRIES.has(country)) errors.push("countryCode");
  if (!phone) errors.push("phone");
  if (!evaluatePassword(input.password).valid) errors.push("password");
  if (input.accountKind === "company" && !isValidCnpj(input.taxId ?? "")) errors.push("taxId");
  if (!input.acceptedTerms || !input.acceptedPrivacy) errors.push("legal");
  if (errors.length || !phone) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    value: {
      accountKind: input.accountKind,
      firstName: first,
      lastName: last,
      companyName: company,
      taxCountry: input.accountKind === "company" ? "BR" : null,
      taxIdType: input.accountKind === "company" ? "CNPJ" : null,
      taxId: input.accountKind === "company" ? input.taxId?.trim() || null : null,
      taxIdNormalized: input.accountKind === "company" ? taxNorm : null,
      email,
      countryCode: country,
      phoneE164: phone,
      password: input.password,
      invitationId: input.invitationId?.trim() || null,
      invitationToken: input.invitationToken?.trim() || null,
    },
  };
}
export function registrationRateLimitKeys(
  secret: string,
  c: { email: string; deviceToken?: string | null; ip?: string | null },
) {
  const e = normalizeAuthEmail(c.email),
    d = c.deviceToken?.trim() || "unknown-device",
    ip = c.ip?.trim() || "unknown-ip";
  return [
    hashAuthValue(secret, "register-email", e),
    hashAuthValue(secret, "register-device", d),
    hashAuthValue(secret, "register-ip", ip),
    hashAuthValue(secret, "register-composite", `${e}\0${d}\0${ip}`),
  ];
}
