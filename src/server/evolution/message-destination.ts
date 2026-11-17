export type MessageIdentityKind = "phone" | "lid" | "group" | "broadcast";

interface MessageDestinationInput {
  remoteJid: string | null | undefined;
  phoneE164: string | null | undefined;
  identityKind: MessageIdentityKind;
}

const digitsOnly = (value: string | null | undefined) => value?.replace(/\D/g, "") ?? "";

export function buildMessageDestination(input: MessageDestinationInput): string {
  const remoteJid = input.remoteJid?.trim() ?? "";

  if (input.identityKind === "group") {
    if (remoteJid.endsWith("@g.us")) return remoteJid;
    const digits = digitsOnly(remoteJid || input.phoneE164);
    return digits ? `${digits}@g.us` : remoteJid;
  }

  if (input.identityKind === "broadcast") {
    return remoteJid;
  }

  if (input.identityKind === "phone") {
    const digits = digitsOnly(input.phoneE164 || remoteJid);
    return digits ? `${digits}@s.whatsapp.net` : remoteJid;
  }

  if (remoteJid.endsWith("@lid")) return remoteJid;
  const digits = digitsOnly(remoteJid || input.phoneE164);
  return digits ? `${digits}@lid` : remoteJid;
}
