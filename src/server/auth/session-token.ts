import { hashAuthValue } from "./auth-crypto.ts";
export function parseSupabaseSessionClaims(
  token: string,
): { sessionId: string; expiresAt: number } | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as {
      session_id?: unknown;
      exp?: unknown;
    };
    return typeof c.session_id === "string" && typeof c.exp === "number"
      ? { sessionId: c.session_id, expiresAt: c.exp }
      : null;
  } catch {
    return null;
  }
}
export function appSessionTokenHash(secret: string, sessionId: string) {
  return hashAuthValue(secret, "app-session", sessionId);
}
