import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function vaultKey() {
  const raw = process.env["INTEGRATION_VAULT_KEY"]?.trim() ?? "";
  const value = Buffer.from(raw, "base64");
  if (!raw || value.length !== 32)
    throw new Error("INTEGRATION_VAULT_KEY deve ser base64 de 32 bytes");
  return value;
}
export function sealSecret(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}
export function openSecret(row: { ciphertext: string; iv: string; auth_tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
