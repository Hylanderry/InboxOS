import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
function sec(s: string) {
  const v = s.trim();
  if (v.length < 32) throw new Error("AUTH_CRYPTO_SECRET must have at least 32 characters");
  return v;
}
export function hashAuthValue(secret: string, purpose: string, value: string) {
  return createHmac("sha256", sec(secret)).update(`${purpose}\0${value}`).digest("hex");
}
export function secureStringEquals(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function generateSixDigitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
export function passwordHistoryFingerprint(secret: string, userId: string, password: string) {
  const key = sec(secret),
    salt = createHmac("sha256", key).update(`password-history-salt\0${userId}`).digest(),
    d = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:v1:${d.toString("base64url")}`;
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
