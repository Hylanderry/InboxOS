import { cleanPhone, isBroadcastOrStatus, isValidPhone } from "../../lib/conversationKey.ts";

type ChatEventInput = {
  id?: string;
  remoteJid?: string;
  subject?: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string | null;
  profilePictureUrl?: string | null;
};

export function buildChatEventUpsert(
  input: unknown,
  workspaceId: string,
  instanceName: string,
  instanceId?: string,
): Record<string, unknown> | null {
  const chat = input && typeof input === "object" ? (input as ChatEventInput) : {};
  const rawJid = String(chat?.id || chat?.remoteJid || "");
  const isGroup = rawJid.endsWith("@g.us");
  const phone = cleanPhone(rawJid);
  if (!phone || isBroadcastOrStatus(rawJid) || (!isGroup && !isValidPhone(phone))) return null;

  const officialName = String(
    isGroup ? chat?.subject || chat?.name || "" : chat?.name || chat?.pushName || "",
  ).trim();
  const picture = chat?.profilePicUrl || chat?.profilePictureUrl || null;

  return {
    workspace_id: workspaceId,
    ...(instanceId ? { instance_id: instanceId } : {}),
    instance_name: instanceName,
    phone,
    remote_jid: rawJid,
    is_group: isGroup,
    ...(officialName && officialName !== "Grupo WhatsApp" ? { name: officialName } : {}),
    ...(picture ? { profile_pic_url: picture } : {}),
  };
}
