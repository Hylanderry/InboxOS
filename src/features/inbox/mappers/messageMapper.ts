import type {
  ChatMessage,
  MessageType,
  MessageSender,
  MessageStatus,
  MessageReaction,
} from "../types";
import { formatTimeLabel, formatPhoneLabel } from "./chatMapper.ts";
import { sanitizeSenderName } from "../../../lib/emoji.ts";

/**
 * Formata duração numérica de segundos em formato legível mm:ss (P2-02)
 */
export function formatAudioDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || seconds < 0 || Number.isNaN(seconds)) {
    return "00:05";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Formata horário exclusivo para o balão da mensagem (estilo WhatsApp: HH:mm).
 * Nunca exibe 'Ontem' ou 'DD/MM' dentro do balão.
 */
export function formatMessageTime(iso?: string | null): string {
  if (!iso || iso.startsWith("1970")) return "";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type MessageDto = {
  type?: string;
  sender?: string;
  direction?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  duration?: number;
  media_duration?: number;
  quoted_message?: ChatMessage["quotedMessage"];
  quotedMessage?: ChatMessage["quotedMessage"];
  sender_phone?: string | null;
  senderPhone?: string | null;
  participant?: string | null;
  sender_name?: string | null;
  senderName?: string | null;
  pushName?: string | null;
  id?: string;
  chatId?: string;
  chat_id?: string;
  externalId?: string | null;
  external_id?: string | null;
  clientMessageId?: string | null;
  client_message_id?: string | null;
  sender_avatar?: string | null;
  senderAvatar?: string | null;
  isEdited?: boolean;
  reactions?: MessageReaction[];
  isGif?: boolean;
  is_gif?: boolean;
  mimetype?: string | null;
  media_mimetype?: string | null;
  fileName?: string | null;
  media_filename?: string | null;
  text?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  media_url?: string | null;
  mediaPath?: string | null;
  media_path?: string | null;
  audioUrl?: string | null;
  fileUrl?: string | null;
  fileSize?: string | null;
  time?: string;
  failedReason?: string | null;
};

export function mapMessageDto(input: unknown): ChatMessage {
  const dto = input && typeof input === "object" ? (input as MessageDto) : {};
  const type: MessageType = [
    "text",
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "deleted",
  ].includes(dto.type ?? "")
    ? (dto.type as MessageType)
    : "text";

  const rawSender = dto?.sender || (dto?.direction === "outbound" ? "agent" : "client");
  const sender: MessageSender = ["client", "agent", "system"].includes(rawSender ?? "")
    ? (rawSender as MessageSender)
    : "client";

  const status: MessageStatus = ["pending", "sent", "delivered", "read", "failed"].includes(
    dto.status ?? "",
  )
    ? (dto.status as MessageStatus)
    : "sent";

  const createdAt = dto?.createdAt || dto?.created_at || new Date().toISOString();
  const rawDuration =
    typeof dto?.duration === "number"
      ? dto.duration
      : typeof dto?.media_duration === "number"
        ? dto.media_duration
        : null;
  const rawQuoted = dto?.quoted_message || dto?.quotedMessage || null;

  const senderPhone = dto?.sender_phone || dto?.senderPhone || dto?.participant || null;
  const rawSenderName = dto?.sender_name || dto?.senderName || dto?.pushName || null;
  const senderName = sanitizeSenderName(rawSenderName, formatPhoneLabel(senderPhone));

  const quotedMessage = rawQuoted
    ? {
        ...rawQuoted,
        senderName: sanitizeSenderName(rawQuoted.senderName, rawQuoted.senderPhone),
        text: rawQuoted.text ?? "",
      }
    : null;

  // Reactions are JSONB and may contain legacy/null entries after a provider
  // retry. Normalize them at the API boundary so the timeline never crashes
  // while rendering a malformed reaction payload.
  const rawReactions = Array.isArray(dto?.reactions)
    ? dto.reactions
    : Array.isArray(rawQuoted?.reactions)
      ? rawQuoted.reactions
      : null;
  const reactions: MessageReaction[] | undefined = rawReactions
    ? rawReactions
        .filter((reaction): reaction is MessageReaction =>
          Boolean(
            reaction &&
            typeof reaction === "object" &&
            typeof (reaction as { emoji?: unknown }).emoji === "string",
          ),
        )
        .map((reaction) => ({
          emoji: reaction.emoji,
          ...(reaction.senderPhone ? { senderPhone: reaction.senderPhone } : {}),
          ...(reaction.at ? { at: reaction.at } : {}),
        }))
    : undefined;

  return {
    id: String(dto?.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    chatId: String(dto?.chatId || dto?.chat_id || ""),
    externalId: dto?.externalId || dto?.external_id || null,
    clientMessageId: dto?.clientMessageId || dto?.client_message_id || null,
    sender,
    senderName,
    senderPhone,
    senderAvatar: dto?.sender_avatar || dto?.senderAvatar || null,
    quotedMessage,
    isEdited: Boolean(rawQuoted?.isEdited || dto?.isEdited),
    reactions,
    isGif: Boolean(
      dto?.isGif ||
      dto?.is_gif ||
      dto?.mimetype === "image/gif" ||
      dto?.media_mimetype === "image/gif" ||
      (type === "video" &&
        (dto?.fileName?.includes(".gif") || dto?.media_filename?.includes(".gif"))),
    ),
    type,
    text: String(dto?.text || dto?.content || ""),
    mediaUrl: dto?.mediaUrl || dto?.media_url || null,
    mediaPath:
      dto?.mediaPath ||
      dto?.media_path ||
      (typeof (dto?.mediaUrl || dto?.media_url) === "string" &&
      String(dto?.mediaUrl || dto?.media_url).startsWith("/api/media/")
        ? String(dto?.mediaUrl || dto?.media_url).slice("/api/media/".length)
        : null),
    audioUrl: dto?.audioUrl || (type === "audio" ? dto?.mediaUrl || dto?.media_url : null),
    fileUrl: dto?.fileUrl || (type === "document" ? dto?.mediaUrl || dto?.media_url : null),
    fileName: dto?.fileName || dto?.media_filename || null,
    fileSize: dto?.fileSize || null,
    duration: rawDuration,
    mimetype: dto?.mimetype || dto?.media_mimetype || null,
    time:
      dto?.time && dto.time.includes(":") && !dto.time.includes("/")
        ? dto.time
        : formatMessageTime(createdAt),
    createdAt,
    status,
    failedReason: dto?.failedReason || null,
  };
}
