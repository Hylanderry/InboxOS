/**
 * Normalização de textos recebidos do WhatsApp.
 * Emojis fazem parte de nomes, títulos e mensagens e devem ser preservados.
 */

// Compatibilidade para consumidores antigos que ainda precisam localizar emojis.
export const EMOJI_REGEX =
  /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu;

/**
 * Normaliza espaços sem remover caracteres válidos do WhatsApp, incluindo emojis.
 */
export function stripEmojis(text?: string | null): string {
  if (!text) return "";
  return String(text)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Higieniza o nome do remetente.
 * Retorna o nome completo ou o telefone formatado. Nunca retorna "Participante".
 */
export function sanitizeSenderName(name?: string | null, phoneFormatted?: string | null): string {
  const clean = stripEmojis(name);
  if (clean) return clean;
  if (phoneFormatted && phoneFormatted.trim()) return phoneFormatted.trim();
  return "";
}

/**
 * Higieniza o nome do chat/grupo.
 * Preserva o título como o WhatsApp o forneceu, inclusive emojis.
 */
export function sanitizeChatName(
  name?: string | null,
  isGroup = false,
  fallbackPhone?: string | null,
): string {
  const clean = stripEmojis(name);
  if (clean) return clean;
  if (isGroup) return "Grupo WhatsApp";
  if (fallbackPhone && fallbackPhone.trim()) return fallbackPhone.trim();
  return "";
}

/**
 * Higieniza a pré-visualização de mensagem na lista de conversas.
 * Preserva o texto recebido; usa um rótulo estável quando a prévia vem vazia.
 */
export function sanitizeMessagePreview(rawText?: string | null, type?: string | null): string {
  const clean = stripEmojis(rawText);

  // Mapeia tipos de mídia para rótulos estáveis quando não há texto útil.
  if (type && type !== "text") {
    const labels: Record<string, string> = {
      image: "Foto",
      video: "Vídeo",
      audio: "Áudio",
      document: "Documento",
      sticker: "Figurinha",
      deleted: "Mensagem apagada",
    };
    const cleanWithoutDecorativeEmoji = stripEmojis(clean);
    if (
      !clean ||
      clean.toLowerCase() === type.toLowerCase() ||
      Object.values(labels).some(
        (l) => l.toLowerCase() === cleanWithoutDecorativeEmoji.toLowerCase(),
      )
    ) {
      return labels[type] || "Mídia";
    }
  }

  return clean || (type === "deleted" ? "Mensagem apagada" : "Conversa iniciada");
}
