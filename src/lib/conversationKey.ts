/**
 * Validação e normalização centralizada de telefones/JIDs do WhatsApp.
 * Todas as funções de limpeza de telefone DEVEM usar este módulo.
 */

/**
 * Extrai apenas dígitos de um JID ou telefone do WhatsApp.
 * Remove sufixos (@s.whatsapp.net, @g.us, @lid, etc.) e separadores (:).
 */
export function cleanPhone(value?: string | null): string {
  if (!value) return "";
  return String(value).split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
}

export const normalizePhone = cleanPhone;

/**
 * Verifica se uma string de dígitos é um telefone E.164 plausível.
 * Regras: 8 a 14 dígitos, não começa com 0.
 * JIDs de grupo (>14 dígitos, ex: 120363...) e LIDs (15 dígitos) retornam false.
 */
export function isValidPhone(digits: string): boolean {
  if (!digits || digits.length < 8 || digits.length > 14) return false;
  if (digits.startsWith("0")) return false;
  return /^\d+$/.test(digits);
}

/**
 * Verifica se um JID bruto ou string de dígitos é um identificador LID do WhatsApp (ex: 12345@lid).
 * LIDs são identificadores internos do WhatsApp de 15 dígitos que NÃO são telefones reais.
 */
export function isLidIdentifier(jid?: string | null): boolean {
  if (!jid) return false;
  const str = String(jid);
  if (str.includes("@lid")) return true;
  const digits = str.replace(/\D/g, "");
  return digits.length >= 15;
}

/**
 * Verifica se um JID é um broadcast/status do WhatsApp que deve ser ignorado.
 */
export function isBroadcastOrStatus(jid?: string | null): boolean {
  if (!jid) return false;
  const str = String(jid).toLowerCase();
  return (
    str.includes("status@broadcast") ||
    str.includes("@broadcast") ||
    str.includes("status@") ||
    str === "status"
  );
}

/**
 * Limpa e valida um telefone. Retorna string vazia se o telefone for inválido.
 * Use esta função ao invés de cleanPhone quando precisar rejeitar números inválidos.
 */
export function cleanAndValidatePhone(value?: string | null): string {
  const digits = cleanPhone(value);
  return isValidPhone(digits) ? digits : "";
}

/**
 * Gera a chave composta única e determinística para isolar uma conversa.
 * Garante que o mesmo contato (telefone) em instâncias ou workspaces distintos
 * gere conversas e caches 100% independentes.
 */
export function conversationKey(workspaceId: string, instanceName: string, phone: string): string {
  const clean = cleanPhone(phone);
  const inst = (instanceName || "default").trim().toLowerCase();
  const ws = (workspaceId || "default").trim().toLowerCase();
  return `${ws}:${inst}:${clean}`;
}

/**
 * Decompõe uma conversationKey em seus componentes.
 */
export function parseConversationKey(key: string): {
  workspaceId: string;
  instanceName: string;
  phone: string;
} {
  const parts = key.split(":");
  if (parts.length >= 3) {
    return {
      workspaceId: parts[0]!,
      instanceName: parts[1]!,
      phone: parts.slice(2).join(":"),
    };
  }
  return {
    workspaceId: "default",
    instanceName: "default",
    phone: cleanPhone(key),
  };
}
