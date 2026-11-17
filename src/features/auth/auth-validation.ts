export type SupportedCountryCode =
  | "BR"
  | "AR"
  | "CO"
  | "CL"
  | "MX"
  | "US"
  | "CA"
  | "AU"
  | "PT"
  | "ES"
  | "FR"
  | "DE"
  | "IT"
  | "GB"
  | "NL"
  | "IE";

export interface AuthCountry {
  code: SupportedCountryCode;
  label: string;
  dialCode: string;
  minNationalDigits: number;
  maxNationalDigits: number;
}

export const AUTH_COUNTRIES: readonly AuthCountry[] = [
  { code: "BR", label: "Brasil", dialCode: "+55", minNationalDigits: 10, maxNationalDigits: 11 },
  { code: "AR", label: "Argentina", dialCode: "+54", minNationalDigits: 10, maxNationalDigits: 11 },
  { code: "CO", label: "Colômbia", dialCode: "+57", minNationalDigits: 10, maxNationalDigits: 10 },
  { code: "CL", label: "Chile", dialCode: "+56", minNationalDigits: 9, maxNationalDigits: 9 },
  { code: "MX", label: "México", dialCode: "+52", minNationalDigits: 10, maxNationalDigits: 10 },
  {
    code: "US",
    label: "Estados Unidos",
    dialCode: "+1",
    minNationalDigits: 10,
    maxNationalDigits: 10,
  },
  { code: "CA", label: "Canadá", dialCode: "+1", minNationalDigits: 10, maxNationalDigits: 10 },
  { code: "AU", label: "Austrália", dialCode: "+61", minNationalDigits: 9, maxNationalDigits: 9 },
  { code: "PT", label: "Portugal", dialCode: "+351", minNationalDigits: 9, maxNationalDigits: 9 },
  { code: "ES", label: "Espanha", dialCode: "+34", minNationalDigits: 9, maxNationalDigits: 9 },
  { code: "FR", label: "França", dialCode: "+33", minNationalDigits: 9, maxNationalDigits: 9 },
  { code: "DE", label: "Alemanha", dialCode: "+49", minNationalDigits: 10, maxNationalDigits: 11 },
  { code: "IT", label: "Itália", dialCode: "+39", minNationalDigits: 9, maxNationalDigits: 10 },
  {
    code: "GB",
    label: "Reino Unido",
    dialCode: "+44",
    minNationalDigits: 10,
    maxNationalDigits: 10,
  },
  {
    code: "NL",
    label: "Países Baixos",
    dialCode: "+31",
    minNationalDigits: 9,
    maxNationalDigits: 9,
  },
  { code: "IE", label: "Irlanda", dialCode: "+353", minNationalDigits: 9, maxNationalDigits: 9 },
] as const;

export function getAuthCountry(code: string) {
  return AUTH_COUNTRIES.find((country) => country.code === code) ?? null;
}

export function normalizePhoneE164(
  countryCode: SupportedCountryCode,
  rawPhone: string,
): string | null {
  const country = getAuthCountry(countryCode);
  if (!country) return null;
  const dialDigits = country.dialCode.replace(/\D/g, "");
  let national = rawPhone.replace(/\D/g, "");
  if (rawPhone.trim().startsWith("+") && national.startsWith(dialDigits))
    national = national.slice(dialDigits.length);
  if (national.length < country.minNationalDigits || national.length > country.maxNationalDigits)
    return null;
  const value = `${country.dialCode}${national}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

function digit(base: string, weights: readonly number[]) {
  const total = base
    .split("")
    .reduce((sum, value, index) => sum + Number(value) * (weights[index] ?? 0), 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const first = digit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export interface PasswordEvaluation {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: "Muito curta" | "Fraca" | "Razoável" | "Boa" | "Forte";
}

export function evaluatePassword(password: string): PasswordEvaluation {
  if (password.length < 8) return { valid: false, score: 0, label: "Muito curta" };
  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 14) score++;
  score = Math.min(4, score);
  const labels = ["Muito curta", "Fraca", "Razoável", "Boa", "Forte"] as const;
  return { valid: true, score: score as 1 | 2 | 3 | 4, label: labels[score] ?? labels[1] };
}

export function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}
