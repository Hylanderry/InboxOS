import type { Conversation, MessageType } from "../types";
import { conversationKey, cleanPhone } from "../../../lib/conversationKey.ts";
import { sanitizeChatName, sanitizeMessagePreview } from "../../../lib/emoji.ts";

/** Formata o telefone em formato visual WhatsApp (E.164 internacional) */
export function formatPhoneLabel(raw?: string | null): string {
  const digits = cleanPhone(raw);
  if (!digits) return "";

  // Grupos do WhatsApp
  if (digits.length > 15) {
    return "Grupo WhatsApp";
  }

  // Números brasileiros: +55 DD 9NNNN-NNNN (13 dígitos) ou +55 DD NNNN-NNNN (12 dígitos)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const half = rest.length === 9 ? 5 : 4;
    return `+55 ${ddd} ${rest.slice(0, half)}-${rest.slice(half)}`;
  }

  // Números dos EUA / Canadá (+1 NNN NNN-NNNN - 11 dígitos)
  if (digits.startsWith("1") && digits.length === 11) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7);
    return `+1 (${area}) ${prefix}-${line}`;
  }

  // Números internacionais padrão (10 a 14 dígitos): +CC AAA NNN NNNN
  if (digits.length >= 10 && digits.length <= 14) {
    const ccLen = digits.length >= 12 ? 3 : digits.length >= 11 ? 2 : 1;
    const countryCode = digits.slice(0, ccLen);
    const rest = digits.slice(ccLen);
    const mid = Math.floor(rest.length / 2);
    return `+${countryCode} ${rest.slice(0, mid)} ${rest.slice(mid)}`;
  }

  // LIDs do WhatsApp ou números curtos não padronizados (< 10 dígitos)
  return `+${digits}`;
}

export function formatTimeLabel(iso?: string | null): string {
  if (!iso || iso.startsWith("1970")) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return "Ontem";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    if (date.getFullYear() === now.getFullYear()) {
      return `${day}/${month}`;
    }
    return `${day}/${month}/${date.getFullYear()}`;
  } catch {
    return "";
  }
}

type ChatDto = {
  workspace_id?: string;
  workspaceId?: string;
  phone?: string | null;
  instanceName?: string;
  instance_name?: string;
  instanceId?: string | null;
  instance_id?: string | null;
  name?: string | null;
  isGroup?: boolean;
  is_group?: boolean;
  lastMessageType?: string;
  last_message_type?: string;
  timestamp?: string;
  last_message_at?: string;
  created_at?: string;
  createdAt?: string;
  unread?: number;
  unread_count?: number;
  id?: string;
  profilePicUrl?: string | null;
  profile_pic_url?: string | null;
  lastMessage?: string | null;
  last_message?: string | null;
  online?: boolean;
  pinned?: boolean;
  archived?: boolean;
  tag?: string | null;
  ai_paused?: boolean;
  aiPaused?: boolean;
  typing?: boolean;
  recordingAudio?: boolean;
  isAnnouncement?: boolean;
  is_announcement?: boolean;
  announce?: boolean;
  canSend?: boolean;
  can_send?: boolean;
  isAdmin?: boolean;
  is_admin?: boolean;
  leadId?: string | null;
  lead_id?: string | null;
  contactCategory?: Conversation["contactCategory"];
  contact_category?: Conversation["contactCategory"];
  humanHandoff?: boolean;
  human_handoff?: boolean;
  handoverPriority?: Conversation["handoverPriority"];
  handover_priority?: Conversation["handoverPriority"];
  handoverRequestedAt?: string | null;
  handover_requested_at?: string | null;
  handoverSla?: Conversation["handoverSla"];
  handover_sla?: Conversation["handoverSla"];
  handoverStatus?: Conversation["handoverStatus"];
  handover_status?: Conversation["handoverStatus"];
};

export function mapChatDto(input: unknown, fallbackWorkspaceId: string = "default"): Conversation {
  const dto = input && typeof input === "object" ? (input as ChatDto) : {};
  const workspaceId = String(dto?.workspace_id || dto?.workspaceId || fallbackWorkspaceId);
  const phone = cleanPhone(dto?.phone);
  const instanceName = String(dto?.instanceName || dto?.instance_name || "WhatsApp").trim();
  const instanceId = dto?.instanceId || dto?.instance_id || null;
  const rawName = dto?.name ? String(dto.name).trim() : "";
  const isGroup = Boolean(dto?.isGroup || dto?.is_group || phone.length > 15);
  const name = sanitizeChatName(rawName, isGroup, formatPhoneLabel(phone));

  const rawLastMessageType = dto.lastMessageType ?? dto.last_message_type;
  const lastMessageType: MessageType = [
    "text",
    "image",
    "video",
    "audio",
    "document",
    "sticker",
  ].includes(rawLastMessageType ?? "")
    ? (rawLastMessageType as MessageType)
    : "text";

  const timestamp =
    dto?.timestamp ||
    dto?.last_message_at ||
    dto?.created_at ||
    dto?.createdAt ||
    "1970-01-01T00:00:00.000Z";
  const rawUnread = dto?.unread ?? dto?.unread_count ?? 0;

  return {
    id: String(dto?.id || `c-${instanceName}-${phone}`),
    conversationKey: conversationKey(workspaceId, instanceName, phone),
    workspaceId,
    instanceId,
    instanceName,
    phone,
    name,
    avatar: dto?.profilePicUrl || dto?.profile_pic_url || null,
    lastMessage: sanitizeMessagePreview(dto?.lastMessage || dto?.last_message, lastMessageType),
    lastMessageType,
    time: formatTimeLabel(timestamp),
    timestamp,
    unread: typeof rawUnread === "number" ? Math.max(0, rawUnread) : 0,
    online: Boolean(dto?.online),
    pinned: Boolean(dto?.pinned),
    archived: Boolean(dto?.archived),
    tag: dto?.tag || null,
    isGroup,
    aiPaused: Boolean(dto?.ai_paused || dto?.aiPaused),
    typing: Boolean(dto?.typing),
    recordingAudio: Boolean(dto?.recordingAudio),
    isAnnouncement: Boolean(dto?.isAnnouncement || dto?.is_announcement || dto?.announce),
    canSend:
      dto?.canSend !== undefined
        ? Boolean(dto.canSend)
        : dto?.can_send !== undefined
          ? Boolean(dto.can_send)
          : true,
    isAdmin: Boolean(dto?.isAdmin || dto?.is_admin),
    leadId: dto?.leadId || dto?.lead_id || null,
    contactCategory:
      dto?.contactCategory || dto?.contact_category || (isGroup ? "group" : "personal"),
    humanHandoff: Boolean(dto?.humanHandoff || dto?.human_handoff),
    handoverPriority: dto?.handoverPriority || dto?.handover_priority || null,
    handoverRequestedAt: dto?.handoverRequestedAt || dto?.handover_requested_at || null,
    handoverSla: dto?.handoverSla || dto?.handover_sla || null,
    handoverStatus: dto?.handoverStatus || dto?.handover_status || null,
  };
}
