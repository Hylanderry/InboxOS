export interface ContactIdentityInput {
  savedName?: string | null | undefined;
  pushName?: string | null | undefined;
  phone?: string | null | undefined;
  profilePictureUrl?: string | null | undefined;
}

function clean(value?: string | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatWhatsAppPhone(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const area = digits.slice(2, 4);
    const local = digits.slice(4);
    const split = local.length === 9 ? 5 : 4;
    return `+55 ${area} ${local.slice(0, split)}-${local.slice(split)}`;
  }
  if (digits.startsWith("1") && digits.length === 11) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7);
    return `+1 (${area}) ${prefix}-${line}`;
  }
  if (digits.length >= 10 && digits.length <= 14) {
    const ccLen = digits.length >= 12 ? 3 : digits.length >= 11 ? 2 : 1;
    const countryCode = digits.slice(0, ccLen);
    const rest = digits.slice(ccLen);
    const mid = Math.floor(rest.length / 2);
    return `+${countryCode} ${rest.slice(0, mid)} ${rest.slice(mid)}`;
  }
  return `+${digits}`;
}

export function contactDisplayName(input: ContactIdentityInput): string {
  return clean(input.savedName) || clean(input.pushName) || formatWhatsAppPhone(input.phone);
}

export function scopedIdentityKey(
  workspaceId: string,
  instanceName: string,
  identity: string,
): string {
  return `${workspaceId}:${instanceName}:${String(identity).trim().toLowerCase()}`;
}

export function senderIdentity(input: ContactIdentityInput) {
  const phone = String(input.phone ?? "").replace(/\D/g, "");
  return {
    name: contactDisplayName(input),
    phone,
    formattedPhone: formatWhatsAppPhone(phone),
    profilePictureUrl: input.profilePictureUrl ?? null,
  };
}

export function collectDirectLidMappings(records: unknown[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const record of records) {
    const key =
      record &&
      typeof record === "object" &&
      "key" in record &&
      record.key &&
      typeof record.key === "object"
        ? (record.key as Record<string, unknown>)
        : {};
    const remoteJid = String(key["remoteJid"] ?? "");
    if (!remoteJid.endsWith("@lid")) continue;
    const lid = remoteJid.split("@")[0]!.replace(/\D/g, "");
    const phone = String(key["remoteJidAlt"] ?? "")
      .split("@")[0]!
      .replace(/\D/g, "");
    if (lid.length < 15 || phone.length < 8 || phone.length > 14 || phone.startsWith("0")) continue;
    result.set(lid, phone);
  }
  return result;
}
