/**
 * Módulo centralizado para normalização de mensagens da Evolution API.
 * Elimina duplicações de extractText, extractMediaInfo e previewFor.
 */

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker";

export interface ExtractedMedia {
  kind: MediaKind | null;
  mimetype: string | null;
  fileName: string | null;
  duration: number | null;
}

interface EvolutionContextInfo {
  quotedMessage?: unknown;
  stanzaId?: unknown;
  text?: unknown;
  participantAlt?: unknown;
  participant?: unknown;
  remoteJid?: unknown;
  participantName?: unknown;
  pushName?: unknown;
  name?: unknown;
}

interface EvolutionMediaPayload {
  caption?: unknown;
  mimetype?: unknown;
  seconds?: unknown;
  fileName?: unknown;
  contextInfo?: EvolutionContextInfo;
}

export interface EvolutionMessagePayload {
  conversation?: unknown;
  ephemeralMessage?: { message?: unknown };
  viewOnceMessage?: { message?: unknown };
  viewOnceMessageV2?: { message?: unknown };
  documentWithCaptionMessage?: { message?: unknown };
  ptvMessage?: EvolutionMediaPayload & { message?: unknown };
  extendedTextMessage?: { text?: unknown; contextInfo?: EvolutionContextInfo };
  imageMessage?: EvolutionMediaPayload;
  videoMessage?: EvolutionMediaPayload;
  audioMessage?: EvolutionMediaPayload;
  documentMessage?: EvolutionMediaPayload;
  stickerMessage?: EvolutionMediaPayload;
  buttonsResponseMessage?: {
    selectedDisplayText?: unknown;
    selectedButtonId?: unknown;
  };
  listResponseMessage?: { title?: unknown; description?: unknown };
  templateButtonReplyMessage?: { selectedDisplayText?: unknown };
  locationMessage?: { name?: unknown; address?: unknown };
  contactMessage?: { displayName?: unknown };
  contactsArrayMessage?: { contacts?: unknown[] };
  pollCreationMessage?: { name?: unknown };
  contextInfo?: EvolutionContextInfo;
  protocolMessage?: {
    type?: unknown;
    key?: { id?: string };
    editedMessage?: unknown;
  };
  reactionMessage?: { key?: { id?: string }; text?: string };
}

/** Busca base64 em respostas da Evolution que variam entre versões.
 * O valor pode vir no registro, em message ou dentro de data/mediaData.
 */
export function extractMediaBase64(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "");
    if (/^data:[^;]+;base64,/i.test(normalized)) return normalized;
    if (normalized.length >= 128 && /^[A-Za-z0-9+/=]+$/.test(normalized)) return normalized;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMediaBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["base64", "mediaData", "fileData", "data", "message"]) {
    if (!(key in record)) continue;
    const found = extractMediaBase64(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

export function isGifMedia(
  rawMessage: unknown,
  mimetype?: string | null,
  filename?: string | null,
) {
  const mime = String(mimetype ?? "").toLowerCase();
  if (mime === "image/gif" || mime === "video/gif") return true;
  if (
    String(filename ?? "")
      .toLowerCase()
      .endsWith(".gif")
  )
    return true;
  const message = unwrapMessage(rawMessage) as Record<string, unknown>;
  const video = message["videoMessage"];
  return Boolean(
    video && typeof video === "object" && (video as Record<string, unknown>)["gifPlayback"],
  );
}

interface EvolutionMessageRecord {
  contextInfo?: EvolutionContextInfo;
  message?: { extendedTextMessage?: { contextInfo?: EvolutionContextInfo } };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function messageValue(value: unknown): EvolutionMessagePayload | null {
  return objectValue(value) as EvolutionMessagePayload | null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Desembrulha containers de mensagens temporárias, visualização única
 * e documentos encapsulados (ephemeralMessage, viewOnceMessage, documentWithCaptionMessage).
 */
export function unwrapMessage(rawMessage: unknown): EvolutionMessagePayload {
  let current = messageValue(rawMessage);
  if (!current) return {};
  while (
    current?.ephemeralMessage?.message ||
    current?.viewOnceMessage?.message ||
    current?.viewOnceMessageV2?.message ||
    current?.documentWithCaptionMessage?.message ||
    current?.ptvMessage?.message
  ) {
    current = messageValue(
      current.ephemeralMessage?.message ||
        current.viewOnceMessage?.message ||
        current.viewOnceMessageV2?.message ||
        current.documentWithCaptionMessage?.message ||
        current.ptvMessage?.message,
    );
    if (!current) return {};
  }
  return current;
}

/**
 * Extrai texto limpo de qualquer estrutura de mensagem do WhatsApp/Evolution.
 */
export function extractText(rawMessage: unknown): string {
  if (!rawMessage) return "";
  const message = unwrapMessage(rawMessage);

  // Texto direto ou legendas
  const directText =
    stringValue(message.conversation) ||
    stringValue(message.extendedTextMessage?.text) ||
    stringValue(message.imageMessage?.caption) ||
    stringValue(message.videoMessage?.caption) ||
    stringValue(message.ptvMessage?.caption) ||
    stringValue(message.documentMessage?.caption);
  if (directText) return directText;

  // Botões e Respostas Interativas
  const buttonText =
    stringValue(message.buttonsResponseMessage?.selectedDisplayText) ||
    stringValue(message.buttonsResponseMessage?.selectedButtonId);
  if (buttonText) return buttonText;
  const listTitle = stringValue(message.listResponseMessage?.title);
  if (listTitle) {
    const description = stringValue(message.listResponseMessage?.description);
    const desc = description ? ` - ${description}` : "";
    return `${listTitle}${desc}`;
  }
  const templateText = stringValue(message.templateButtonReplyMessage?.selectedDisplayText);
  if (templateText) return templateText;

  // Localização
  if (message.locationMessage) {
    const loc = message.locationMessage;
    const locationName = stringValue(loc.name) || "";
    const address = stringValue(loc.address) || "";
    const name =
      locationName || address ? `${locationName} ${address}`.trim() : "Localização compartilhada";
    return `[Localização: ${name}]`;
  }

  // Contato / vCard
  if (message.contactMessage) {
    const name = stringValue(message.contactMessage.displayName) || "Contato compartilhado";
    return `[Contato: ${name}]`;
  }
  if (message.contactsArrayMessage?.contacts?.length) {
    return `[${message.contactsArrayMessage.contacts.length} contatos compartilhados]`;
  }

  // Enquete / Poll
  if (message.pollCreationMessage?.name) {
    return `[Enquete: ${String(message.pollCreationMessage.name)}]`;
  }

  return "";
}

/**
 * Extrai metadados completos de mídia a partir do objeto da mensagem.
 */
export function extractMediaInfo(rawMessage: unknown): ExtractedMedia {
  if (!rawMessage) return { kind: null, mimetype: null, fileName: null, duration: null };
  const message = unwrapMessage(rawMessage);

  if (message.imageMessage) {
    return {
      kind: "image",
      mimetype: stringValue(message.imageMessage.mimetype) ?? "image/jpeg",
      fileName: null,
      duration: null,
    };
  }

  if (message.videoMessage || message.ptvMessage) {
    const videoObj = message.videoMessage ?? message.ptvMessage!;
    return {
      kind: "video",
      mimetype: stringValue(videoObj.mimetype) ?? "video/mp4",
      fileName: null,
      duration: numberValue(videoObj.seconds),
    };
  }

  if (message.audioMessage) {
    return {
      kind: "audio",
      mimetype: stringValue(message.audioMessage.mimetype) ?? "audio/ogg",
      fileName: null,
      duration: numberValue(message.audioMessage.seconds),
    };
  }

  if (message.stickerMessage) {
    return {
      kind: "sticker",
      mimetype: stringValue(message.stickerMessage.mimetype) ?? "image/webp",
      fileName: null,
      duration: null,
    };
  }

  if (message.documentMessage) {
    return {
      kind: "document",
      mimetype: stringValue(message.documentMessage.mimetype) ?? "application/octet-stream",
      fileName: stringValue(message.documentMessage.fileName) ?? "documento",
      duration: null,
    };
  }

  return { kind: null, mimetype: null, fileName: null, duration: null };
}

/**
 * Gera um preview textual apropriado para listagens de conversa.
 */
export function previewFor(type: string, text?: string | null): string {
  if (type === "text") return text ?? "";
  const labels: Record<string, string> = {
    image: "Foto",
    video: "Vídeo",
    audio: "Áudio",
    document: "Documento",
    sticker: "Figurinha",
  };
  return labels[type] ?? (text || "Mensagem");
}

/**
 * Normaliza timestamp em ISO string a partir de segundos, milissegundos ou ISO.
 */
export function normalizeTimestamp(raw: unknown): string {
  const fallback = () => new Date().toISOString();
  if (raw == null || raw === "") return fallback();
  const num = Number(raw);
  const millis =
    Number.isFinite(num) && num > 0 ? (num < 1e11 ? num * 1000 : num) : Date.parse(String(raw));
  if (!Number.isFinite(millis) || Math.abs(millis) > 8.64e15) return fallback();
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback();
}

/**
 * Extrai informações da mensagem citada (quote / resposta) de forma robusta.
 * Suporta estruturas diretas da Evolution API (contextInfo na raiz do registro ou no extendedTextMessage).
 */
export function extractQuotedMessage(
  message: unknown,
  rawRecord?: unknown,
): {
  id?: string | null;
  text?: string | null;
  senderPhone?: string | null;
  senderName?: string | null;
  type?: string;
} | null {
  const typedMessage = messageValue(message);
  const typedRecord = objectValue(rawRecord) as EvolutionMessageRecord | null;
  const contextInfo =
    typedRecord?.contextInfo ??
    typedMessage?.contextInfo ??
    typedMessage?.extendedTextMessage?.contextInfo ??
    typedMessage?.imageMessage?.contextInfo ??
    typedMessage?.videoMessage?.contextInfo ??
    typedMessage?.audioMessage?.contextInfo ??
    typedMessage?.documentMessage?.contextInfo ??
    typedMessage?.stickerMessage?.contextInfo ??
    typedRecord?.message?.extendedTextMessage?.contextInfo;

  if (!contextInfo) return null;

  const quotedMsg = unwrapMessage(contextInfo.quotedMessage);
  if (!quotedMsg && !contextInfo.stanzaId) return null;

  const quotedText = extractText(quotedMsg) || stringValue(contextInfo.text);

  const quotedMedia = extractMediaInfo(quotedMsg);
  const type = quotedMedia.kind || (quotedText ? "text" : "unknown");

  const rawParticipant =
    contextInfo.participantAlt || contextInfo.participant || contextInfo.remoteJid;
  const digits = rawParticipant ? String(rawParticipant).replace(/\D/g, "") : null;
  const validPhone = digits && digits.length >= 8 && digits.length <= 15 ? digits : null;
  const rawName = contextInfo.participantName || contextInfo.pushName || contextInfo.name || null;

  return {
    id: stringValue(contextInfo.stanzaId),
    text: quotedText ?? (quotedMedia.kind ? previewFor(quotedMedia.kind) : null),
    senderPhone: validPhone,
    senderName: rawName ? String(rawName).trim() : null,
    type,
  };
}
