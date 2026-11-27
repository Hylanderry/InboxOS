import { requireMessageInstanceScope } from "@/server/evolution/message-scope";
import { fetchCredentialed } from "@/server/security/credentialed-fetch";
import {
  evolutionWebhookUrl,
  assertEvolutionWebhookConfigurationAllowed,
} from "@/server/evolution/webhook-url";
/**
 * Helpers server-only para integração com a Evolution API.
 * Nunca importe este arquivo em código de cliente (sufixo .server é bloqueado no bundle).
 */

import {
  evolutionWebhookBody,
  evolutionWebhookEvents,
  inspectStoredWebhook,
  secureTokenMatches,
} from "@/server/evolution/webhook-config";
import { contactDisplayName } from "@/server/evolution/contact-identity";
import {
  instanceWebhookToken,
  isInstanceTokenShape,
  matchWebhookCredential,
} from "@/server/evolution/instance-webhook-token";
import { buildMediaStoragePath } from "@/server/evolution/media-storage";
import { isValidPhone, isLidIdentifier, isBroadcastOrStatus } from "@/lib/conversationKey";

export interface EvolutionRequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
  /** Override the provider timeout for known slow, read-only catalog endpoints. */
  timeoutMs?: number;
}

/**
 * Eventos completos suportados e tratados pelo webhook da Evolution API.
 * Garante que reações, exclusões, edições, presenças e pins não sejam descartados.
 */
export const EVOLUTION_WEBHOOK_EVENTS = evolutionWebhookEvents;

async function getConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const managed = await resolveManagedIntegration("evolution");
  if (managed.disabled) throw new Error("Integração desativada no ADM");
  const rawUrl = managed.baseUrl || process.env["EVOLUTION_API_URL"];
  const apiKey = managed.secrets["api_key"] || process.env["EVOLUTION_API_KEY"];
  if (!rawUrl || !apiKey) {
    throw new Error("Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
  }
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  return { baseUrl: withProtocol.replace(/\/+$/, ""), apiKey };
}

export function webhookAuthSecret(): string {
  return process.env["EVOLUTION_WEBHOOK_TOKEN"] || process.env["EVOLUTION_API_KEY"] || "";
}

/** Executa uma chamada autenticada contra a Evolution API. */
export async function evolutionFetch<T = unknown>(
  path: string,
  options: EvolutionRequestOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { baseUrl, apiKey } = await getConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetchCredentialed(url, {
      method: options.method ?? "GET",
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw as unknown;
    }

    if (!res.ok) {
      const parsedRecord =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const responseRecord =
        parsedRecord["response"] && typeof parsedRecord["response"] === "object"
          ? (parsedRecord["response"] as Record<string, unknown>)
          : {};
      const message =
        parsedRecord["message"] ||
        parsedRecord["error"] ||
        responseRecord["message"] ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, data: parsed as T, error: String(message) };
    }

    return { ok: true, status: res.status, data: parsed as T };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "Falha de rede",
    };
  }
}

/** Configura e confirma o webhook realmente armazenado pela Evolution. */
export async function configureEvolutionWebhook(instanceName: string) {
  assertEvolutionWebhookConfigurationAllowed(process.env);
  const url = publicWebhookUrl();
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const managed = await resolveManagedIntegration("evolution");
  if (managed.disabled) throw new Error("Integração desativada no ADM");
  const masterSecret =
    managed.secrets["webhook_token"] || managed.secrets["api_key"] || webhookAuthSecret();
  if (!masterSecret) {
    return {
      success: false,
      error: "Webhook sem segredo de autenticação",
      missingEvents: [] as string[],
    };
  }
  // Cada instância recebe o PRÓPRIO token (derivado do segredo mestre + nome da instância).
  // Instâncias ainda com o segredo global são detectadas por inspectStoredWebhook ("auth")
  // e reescritas automaticamente aqui.
  const secret = instanceWebhookToken(masterSecret, instanceName);

  const setWebhook = (legacyGroupEvent: boolean) =>
    evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: evolutionWebhookBody(url, secret, legacyGroupEvent),
    });

  // A Evolution pode perder headers/URL após reiniciar. Evita uma escrita em
  // toda leitura, mas só considera o webhook saudável quando o contrato inteiro
  // armazenado confere, inclusive o segredo que será enviado ao Worker.
  let stored = await evolutionFetch<unknown>(`/webhook/find/${encodeURIComponent(instanceName)}`);
  let inspection = stored.ok
    ? inspectStoredWebhook(stored.data, url, secret)
    : { valid: false, issues: ["unavailable"], missingEvents: [] as string[] };
  if (inspection.valid) {
    return { success: true, error: undefined, missingEvents: [] as string[], repaired: false };
  }

  let configured = await setWebhook(false);
  if (!configured.ok) configured = await setWebhook(true);
  if (!configured.ok) {
    return {
      success: false,
      error: configured.error || "Falha ao configurar webhook",
      missingEvents: [] as string[],
    };
  }

  stored = await evolutionFetch<unknown>(`/webhook/find/${encodeURIComponent(instanceName)}`);
  inspection = stored.ok
    ? inspectStoredWebhook(stored.data, url, secret)
    : { valid: false, issues: ["unavailable"], missingEvents: [] as string[] };
  let missingEvents = inspection.missingEvents;

  if (missingEvents.includes("GROUPS_UPDATE")) {
    const legacyAttempt = await setWebhook(true);
    if (legacyAttempt.ok) {
      stored = await evolutionFetch<unknown>(`/webhook/find/${encodeURIComponent(instanceName)}`);
      inspection = stored.ok
        ? inspectStoredWebhook(stored.data, url, secret)
        : { valid: false, issues: ["unavailable"], missingEvents: [] as string[] };
      missingEvents = inspection.missingEvents;
    }
  }

  return {
    success: stored.ok && inspection.valid,
    error:
      stored.ok && !inspection.valid
        ? `Webhook inválido: ${inspection.issues.join(", ")}`
        : stored.error,
    missingEvents,
    repaired: stored.ok && inspection.valid,
  };
}

/** Normaliza um telefone/JID do WhatsApp para apenas dígitos. */
export function cleanPhone(value?: string | null): string {
  if (!value) return "";
  return String(value).split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
}

/**
 * Busca a foto de perfil do WhatsApp para um determinado número/JID via Evolution API.
 */
/**
 * Busca a foto de perfil do WhatsApp para um determinado número/JID via Evolution API.
 */
export async function fetchContactProfilePicture(
  instanceName: string,
  number: string,
  isGroup?: boolean,
  signal?: AbortSignal,
  workspaceId?: string,
): Promise<string | null> {
  let phone = cleanPhone(number);
  if (!phone) return null;
  const groupDetected =
    Boolean(isGroup) || String(number).endsWith("@g.us") || phone.startsWith("120363");

  // Se não for grupo e o número for um LID ou inválido, tenta resolver no whatsapp_contacts
  if (!groupDetected && (!isValidPhone(phone) || isLidIdentifier(number))) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: contact } = await supabaseAdmin
        .from("whatsapp_contacts")
        .select("phone, profile_pic_url, alternate_jid")
        .eq("instance_name", instanceName)
        .eq("workspace_id", workspaceId || "__missing_workspace__")
        .or(
          `remote_jid.eq.${number},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%,alternate_jid.ilike.%${phone}%`,
        )
        .limit(1)
        .maybeSingle();

      if (contact?.profile_pic_url) {
        return contact.profile_pic_url;
      }
      if (contact?.phone && isValidPhone(contact.phone)) {
        phone = contact.phone;
      } else if (contact?.alternate_jid) {
        const altClean = cleanPhone(contact.alternate_jid);
        if (isValidPhone(altClean)) phone = altClean;
      }
    } catch {
      // Segue para fallback
    }
  }

  if (!groupDetected && !isValidPhone(phone)) {
    return null;
  }

  const targetNumber = groupDetected
    ? String(number).includes("@g.us")
      ? String(number)
      : `${phone}@g.us`
    : String(number).includes("@") && !isLidIdentifier(number)
      ? String(number)
      : `${phone}@s.whatsapp.net`;

  let res = await evolutionFetch<{ profilePictureUrl?: string | null }>(
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: { number: targetNumber },
      ...(signal ? { signal } : {}),
    },
  );
  if (res.ok && res.data?.profilePictureUrl) {
    return res.data.profilePictureUrl;
  }

  // Fallback com número simples se a versão com sufixo falhar
  if (!groupDetected) {
    res = await evolutionFetch<{ profilePictureUrl?: string | null }>(
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: { number: phone },
        ...(signal ? { signal } : {}),
      },
    );
    if (res.ok && res.data?.profilePictureUrl) {
      return res.data.profilePictureUrl;
    }
  }

  return null;
}

/**
 * Envia o estado de presença do atendente ("digitando..." / "gravando áudio...") para o cliente no WhatsApp via Evolution API.
 */
export async function sendWhatsAppPresence(
  instanceName: string,
  number: string,
  presence: "composing" | "recording" | "paused",
  isGroup?: boolean,
  workspaceId?: string,
): Promise<boolean> {
  let phone = cleanPhone(number);
  if (!phone) return false;
  const groupDetected =
    Boolean(isGroup) || String(number).endsWith("@g.us") || phone.startsWith("120363");

  if (!groupDetected && !isValidPhone(phone)) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let contactQuery = supabaseAdmin
        .from("whatsapp_contacts")
        .select("phone, alternate_jid")
        .eq("instance_name", instanceName);
      if (workspaceId) contactQuery = contactQuery.eq("workspace_id", workspaceId);
      const { data: contact } = await contactQuery
        .or(
          `remote_jid.eq.${number},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%,alternate_jid.ilike.%${phone}%`,
        )
        .limit(1)
        .maybeSingle();

      if (contact?.phone && isValidPhone(contact.phone)) {
        phone = contact.phone;
      } else if (contact?.alternate_jid) {
        const altClean = cleanPhone(contact.alternate_jid);
        if (isValidPhone(altClean)) phone = altClean;
      }
    } catch {
      // Ignora
    }
  }

  if (!groupDetected && !isValidPhone(phone)) return false;

  const targetNumber = groupDetected
    ? String(number).includes("@g.us")
      ? String(number)
      : `${phone}@g.us`
    : phone;
  const res = await evolutionFetch(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      number: targetNumber,
      presence,
      delay: 1200,
    },
  });
  return res.ok;
}

export interface BusinessProfileData {
  isBusiness: boolean;
  address?: string | null;
  description?: string | null;
  website?: string[];
  email?: string | null;
  category?: string | null;
  businessHours?: Record<string, unknown> | null;
}
type BusinessProfileResponse = {
  isBusiness?: unknown;
  address?: unknown;
  description?: unknown;
  website?: unknown;
  email?: unknown;
  category?: unknown;
  business_hours?: unknown;
};

/**
 * Consulta perfil comercial do WhatsApp Business (Somente Leitura)
 */
export async function fetchBusinessProfile(
  instanceName: string,
  number: string,
): Promise<BusinessProfileData | null> {
  let phone = cleanPhone(number);
  if (!phone) return null;

  if (!isValidPhone(phone) || isLidIdentifier(number)) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: contact } = await supabaseAdmin
        .from("whatsapp_contacts")
        .select("phone, alternate_jid")
        .eq("instance_name", instanceName)
        .or(
          `remote_jid.eq.${number},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%,alternate_jid.ilike.%${phone}%`,
        )
        .limit(1)
        .maybeSingle();

      if (contact?.phone && isValidPhone(contact.phone)) {
        phone = contact.phone;
      } else if (contact?.alternate_jid) {
        const altClean = cleanPhone(contact.alternate_jid);
        if (isValidPhone(altClean)) phone = altClean;
      }
    } catch {
      // Fallback
    }
  }

  if (!isValidPhone(phone)) return null;

  const res = await evolutionFetch<BusinessProfileResponse>(
    `/chat/fetchBusinessProfile/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: { number: phone },
    },
  );
  if (res.ok && res.data) {
    return {
      isBusiness: Boolean(res.data.isBusiness),
      address: typeof res.data.address === "string" ? res.data.address : null,
      description: typeof res.data.description === "string" ? res.data.description : null,
      website: Array.isArray(res.data.website)
        ? res.data.website.filter((item): item is string => typeof item === "string")
        : typeof res.data.website === "string"
          ? [res.data.website]
          : [],
      email: typeof res.data.email === "string" ? res.data.email : null,
      category: typeof res.data.category === "string" ? res.data.category : null,
      businessHours:
        res.data.business_hours && typeof res.data.business_hours === "object"
          ? (res.data.business_hours as Record<string, unknown>)
          : null,
    };
  }
  return null;
}

/** Descobre o tipo de mídia do painel a partir do mimetype. */
export function mediaTypeFromMime(
  mimetype?: string | null,
): "image" | "video" | "audio" | "document" {
  const mime = (mimetype ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/** Limite de tamanho aceito para uma mídia (o armazenamento aceita até 50 MB). */
export const MAX_MEDIA_BYTES = 45 * 1024 * 1024;

/** Converte base64 (com ou sem data URL) em Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  let binary: string;
  try {
    binary = atob(clean.replace(/\s/g, ""));
  } catch {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Salva uma mídia base64 no bucket privado `chat-media` e devolve
 * a URL interna usada pelo painel para reproduzir o arquivo.
 */
export async function storeBase64Media(
  base64: string,
  mimetype: string | null | undefined,
  filename: string | null | undefined,
  workspaceId: string,
): Promise<{ url: string | null; path: string | null; error?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) return { url: null, path: null, error: "Arquivo vazio" };
    if (bytes.length > MAX_MEDIA_BYTES) {
      return { url: null, path: null, error: "Arquivo maior que 45 MB" };
    }
    const path = buildMediaStoragePath(workspaceId, mimetype, filename, "chat");

    const { error } = await supabaseAdmin.storage.from("chat-media").upload(path, bytes, {
      contentType: mimetype || "application/octet-stream",
      upsert: false,
    });
    if (error) return { url: null, path: null, error: error.message };

    return { url: `/api/media/${path}`, path };
  } catch (err: unknown) {
    return {
      url: null,
      path: null,
      error: err instanceof Error ? err.message : "Falha ao salvar mídia",
    };
  }
}

// Presence store em memória para digitação e gravação de áudio em tempo real
interface PresenceState {
  phone: string;
  instanceName?: string | undefined;
  status: "composing" | "recording" | "paused";
  updatedAt: number;
}

const presenceCache = new Map<string, PresenceState>();

export function recordPresence(
  phone: string,
  status: "composing" | "recording" | "paused",
  instanceName?: string,
) {
  const clean = cleanPhone(phone);
  if (!clean) return;
  if (status === "paused") {
    presenceCache.delete(clean);
  } else {
    presenceCache.set(clean, { phone: clean, instanceName, status, updatedAt: Date.now() });
  }
}

export function getActivePresences(): Record<string, "composing" | "recording"> {
  const now = Date.now();
  const active: Record<string, "composing" | "recording"> = {};
  for (const [phone, item] of presenceCache.entries()) {
    if (now - item.updatedAt > 7000) {
      presenceCache.delete(phone);
    } else {
      active[phone] = item.status as "composing" | "recording";
    }
  }
  return active;
}

// Group metadata is scoped per tenant/instance (see group-metadata-cache.ts).
export {
  recordGroupMetadata,
  getGroupMetadata,
  getAllGroupMetadata,
} from "@/server/evolution/group-metadata-cache";
export type { GroupMetadataState } from "@/server/evolution/group-metadata-cache";
import { recordGroupMetadata, getGroupMetadata } from "@/server/evolution/group-metadata-cache";

/**
 * Consulta nome salvo do contato na tabela de chats para manter consistência de agenda.
 */
export async function resolveContactSavedName(
  workspaceId: string,
  instanceName: string,
  phone: string,
): Promise<string | null> {
  const clean = cleanPhone(phone);
  if (!clean) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("saved_name, push_name")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .eq("phone", clean)
      .limit(1)
      .maybeSingle();

    return (
      contactDisplayName({
        savedName: data?.saved_name,
        pushName: data?.push_name,
        phone: clean,
      }) || null
    );
  } catch {
    // A resolução de nome é auxiliar; o número continua sendo o fallback seguro.
  }
  return null;
}

/**
 * Busca ativamente informações oficiais de um grupo na Evolution API (assunto, foto, permissões).
 */
export async function fetchGroupInfo(
  workspaceId: string,
  instanceName: string,
  groupIdOrJid: string,
): Promise<{
  subject: string;
  desc?: string | null;
  picture?: string | null;
  announce: boolean;
  restrict: boolean;
  isAdmin: boolean;
  canSend: boolean;
} | null> {
  const cleanId = cleanPhone(groupIdOrJid);
  if (!cleanId) return null;
  const jid = groupIdOrJid.includes("@g.us") ? groupIdOrJid : `${cleanId}@g.us`;

  try {
    type GroupInfo = {
      subject?: unknown;
      name?: unknown;
      announce?: unknown;
      restrict?: unknown;
      desc?: unknown;
      description?: unknown;
      pictureUrl?: unknown;
    };
    type GroupResponse = GroupInfo & { group?: GroupInfo };
    const res = await evolutionFetch<GroupResponse>(
      `/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(jid)}`,
    );
    const raw = res.ok && res.data ? res.data.group || res.data : null;
    if (raw) {
      const subject = String(raw.subject || raw.name || "").trim();
      const announce = Boolean(raw.announce);
      const restrict = Boolean(raw.restrict);
      const desc: string | null =
        typeof raw.desc === "string"
          ? raw.desc
          : typeof raw.description === "string"
            ? raw.description
            : null;

      let picture: string | null = null;
      try {
        const pfpRes = await evolutionFetch<{ profilePictureUrl?: unknown }>(
          `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
          {
            method: "POST",
            body: { number: jid },
          },
        );
        picture =
          pfpRes.ok && typeof pfpRes.data?.profilePictureUrl === "string"
            ? pfpRes.data.profilePictureUrl
            : null;
      } catch {
        // Alguns contatos e grupos não expõem foto pela Evolution API.
      }

      const recorded = recordGroupMetadata(workspaceId, instanceName, cleanId, {
        announce,
        restrict,
        subject,
        desc,
      });

      return {
        subject: subject || "Grupo WhatsApp",
        desc,
        picture: typeof raw.pictureUrl === "string" ? raw.pictureUrl : picture,
        announce,
        restrict,
        isAdmin: recorded?.isAdmin ?? false,
        canSend: recorded?.canSend ?? (announce ? false : true),
      };
    }
  } catch (err) {
    console.warn("[evolution.server] Falha ao consultar metadados do grupo:", err);
  }
  return null;
}

// Falha fechada: mutações externas NUNCA podem operar sem instância resolvida.
export async function deleteMessageByExternalId(
  workspaceId: string,
  externalId: string,
  instanceId: string,
) {
  const scopedInstanceId = requireMessageInstanceScope(instanceId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const query = supabaseAdmin
    .from("messages")
    .update({ type: "deleted", text: "Mensagem apagada" })
    .eq("workspace_id", workspaceId)
    .eq("external_id", externalId);
  return query.eq("instance_id", scopedInstanceId);
}

export async function editMessageByExternalId(
  workspaceId: string,
  externalId: string,
  newText: string,
  instanceId: string,
) {
  const scopedInstanceId = requireMessageInstanceScope(instanceId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lookup = supabaseAdmin
    .from("messages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("external_id", externalId);
  const { data: existing, error: lookupError } = await lookup
    .eq("instance_id", scopedInstanceId)
    .maybeSingle();
  if (lookupError) return { error: lookupError };

  if (existing) {
    return supabaseAdmin
      .from("messages")
      .update({
        text: newText,
        is_edited: true,
      })
      .eq("id", existing.id)
      .eq("workspace_id", workspaceId)
      .eq("instance_id", scopedInstanceId);
  }
  return null;
}

export async function addReactionToMessage(
  workspaceId: string,
  externalId: string,
  reactionEmoji: string,
  senderPhone: string | undefined,
  instanceId: string,
) {
  const scopedInstanceId = requireMessageInstanceScope(instanceId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lookup = supabaseAdmin
    .from("messages")
    .select("id, reactions")
    .eq("workspace_id", workspaceId)
    .eq("external_id", externalId);
  const { data: existing, error: lookupError } = await lookup
    .eq("instance_id", scopedInstanceId)
    .maybeSingle();
  if (lookupError) return { error: lookupError };

  if (existing) {
    const existingReactions = Array.isArray(existing.reactions) ? existing.reactions : [];

    // Se o emoji estiver vazio, significa que a reação foi removida
    const updatedReactions = existingReactions.filter(
      (r) =>
        !r || typeof r !== "object" || (r as { senderPhone?: unknown }).senderPhone !== senderPhone,
    );
    if (reactionEmoji) {
      updatedReactions.push({ emoji: reactionEmoji, senderPhone, at: new Date().toISOString() });
    }

    return supabaseAdmin
      .from("messages")
      .update({
        reactions: updatedReactions,
      })
      .eq("id", existing.id)
      .eq("workspace_id", workspaceId)
      .eq("instance_id", scopedInstanceId);
  }
  return null;
}

export interface UpsertMessageInput {
  instanceName: string;
  phone: string;
  name?: string | null;
  profilePicUrl?: string | null;
  sender: "client" | "agent" | "system";
  senderName?: string | null;
  senderPhone?: string | null;
  senderAvatar?: string | null;
  quotedMessage?: unknown;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "deleted";
  text?: string | null;
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  mediaDuration?: number | null;
  externalId?: string | null;
  clientMessageId?: string | null;
  status?: "pending" | "sent" | "delivered" | "read" | "failed";
  incrementUnread?: boolean;
  isGroup?: boolean;
  workspaceId: string;
  createdAt?: string | number | Date | null;
  remoteJid?: string | null;
  identityKind?: "phone" | "lid" | "group" | "broadcast";
}

function parseEventIsoDate(value?: string | number | Date | null): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const num = Number(value);
  if (!Number.isNaN(num) && num > 0) {
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Garante a conversa e grava a mensagem no banco com integridade atômica. */
export async function persistMessage(input: UpsertMessageInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const phone = cleanPhone(input.phone);
  if (!phone) return { error: "Telefone inválido" };

  // Rejeita broadcasts, status e JIDs inválidos para não poluir a tabela de chats
  if (isBroadcastOrStatus(input.phone)) return { error: "Broadcast ignorado" };

  // Para contatos individuais (não grupos), validar comprimento do telefone
  if (!input.isGroup && !isValidPhone(phone)) {
    return { error: `Telefone inválido (${phone.length} dígitos)` };
  }

  const wsId = input.workspaceId;
  const eventAt = parseEventIsoDate(input.createdAt);

  const { data: instanceIdentity, error: instanceIdentityError } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id")
    .eq("workspace_id", wsId)
    .eq("instance_name", input.instanceName)
    .maybeSingle();
  if (instanceIdentityError) return { error: instanceIdentityError.message };
  if (!instanceIdentity?.id) return { error: "Instância não pertence ao workspace" };

  // Evita mensagens duplicadas quando o WhatsApp reenvia o mesmo evento (P1-06, P1-07)
  if (input.externalId) {
    const { data: duplicate } = await supabaseAdmin
      .from("messages")
      .select("id, chat_id")
      .eq("workspace_id", wsId)
      .eq("instance_id", instanceIdentity.id)
      .eq("external_id", input.externalId)
      .maybeSingle();
    if (duplicate) return { chatId: duplicate.chat_id, message: duplicate, duplicated: true };
  }

  let existing: {
    id: string;
    unread: number;
    name: string | null;
    profile_pic_url: string | null;
    phone: string | null;
  } | null = null;

  // 1. Busca pelo telefone/JID exato
  const { data: byPhone } = await supabaseAdmin
    .from("chats")
    .select("id, unread, name, profile_pic_url, phone")
    .eq("workspace_id", wsId)
    .eq("instance_name", input.instanceName)
    .eq("phone", phone)
    .maybeSingle();

  existing = byPhone;

  const { data: storedContact } = input.isGroup
    ? { data: null }
    : await supabaseAdmin
        .from("whatsapp_contacts")
        .select("saved_name, push_name, profile_pic_url")
        .eq("workspace_id", wsId)
        .eq("instance_name", input.instanceName)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();

  const preview =
    input.type === "text"
      ? (input.text ?? "")
      : ((
          {
            image: "Foto",
            video: "Vídeo",
            audio: "Áudio",
            document: "Documento",
            sticker: "Figurinha",
            deleted: "Mensagem apagada",
          } as Record<string, string>
        )[input.type] ?? "Mensagem");

  const chatId = existing?.id ?? null;
  let resolvedProfilePicture = input.profilePicUrl || storedContact?.profile_pic_url || null;

  const groupMeta = input.isGroup ? getGroupMetadata(wsId, input.instanceName, phone) : null;

  // Prioridade de nome para contatos: 1. Nome salvo na agenda do celular (saved_name) | 2. Nome de grupo oficial (groupMeta.subject) | 3. Nome de perfil (push_name)
  let resolvedName: string | null = null;
  if (input.isGroup) {
    const isSenderName = Boolean(
      existing?.name &&
      ((input.senderName && existing.name === input.senderName) ||
        (input.senderPhone && existing.name.includes(input.senderPhone))),
    );
    const existingGroupValid =
      existing?.name &&
      existing.name !== "Grupo WhatsApp" &&
      !existing.name.startsWith("+") &&
      !isSenderName;

    resolvedName =
      groupMeta?.subject ||
      (input.name && input.name !== "Grupo WhatsApp" ? input.name : null) ||
      (existingGroupValid ? (existing?.name ?? null) : null) ||
      "Grupo WhatsApp";

    // Se o nome estiver genérico ou corrompido, confirma o assunto oficial antes
    // de responder ao webhook. Tarefas soltas podem ser encerradas pelo Worker.
    if (resolvedName === "Grupo WhatsApp" || isSenderName || !existingGroupValid) {
      const info = await fetchGroupInfo(wsId, input.instanceName, phone);
      if (info?.subject && info.subject !== "Grupo WhatsApp") resolvedName = info.subject;
      if (info?.picture) resolvedProfilePicture = info.picture;
    }
  } else {
    // Para contatos individuais, nunca usar o pushName do próprio aparelho.
    // The sender kind is already scoped to the connected tenant/instance.
    // Never use an agent pushName as a contact identity.
    const isOwnerPushName = input.sender === "agent";
    const candidateName = isOwnerPushName ? null : input.name;
    const existingIsInvalid =
      !existing?.name ||
      existing.name === input.instanceName ||
      existing.name === "Contato" ||
      existing.name.startsWith("+");

    // 1. Prioridade absoluta para o nome salvo na agenda do celular
    if (storedContact?.saved_name && storedContact.saved_name.trim()) {
      resolvedName = storedContact.saved_name.trim();
    } else if (!existingIsInvalid && existing?.name) {
      resolvedName = existing.name;
    } else {
      resolvedName =
        storedContact?.push_name ||
        candidateName ||
        contactDisplayName({
          savedName: storedContact?.saved_name,
          pushName: storedContact?.push_name || candidateName,
          phone,
        }) ||
        null;
    }
  }

  const messageStatus = input.status || (input.sender === "client" ? "delivered" : "sent");
  const identityKind =
    input.identityKind ?? (input.isGroup ? "group" : isValidPhone(phone) ? "phone" : "lid");
  const remoteJid =
    input.remoteJid ??
    (identityKind === "group"
      ? `${phone}@g.us`
      : identityKind === "lid"
        ? `${phone}@lid`
        : `${phone}@s.whatsapp.net`);

  const { data: persisted, error: persistError } = await supabaseAdmin.rpc(
    "persist_inbox_message",
    {
      p_workspace_id: wsId,
      p_instance_name: input.instanceName,
      p_phone: phone,
      p_remote_jid: remoteJid,
      p_identity_kind: identityKind,
      p_name: resolvedName,
      p_profile_pic_url: resolvedProfilePicture,
      p_is_group: input.isGroup ?? false,
      p_sender: input.sender,
      p_sender_name: input.senderName ?? null,
      p_sender_phone: input.senderPhone ?? null,
      p_sender_avatar: input.senderAvatar ?? null,
      p_quoted_message: input.quotedMessage ?? null,
      p_type: input.type,
      p_text: input.text ?? null,
      p_media_url: input.mediaUrl ?? null,
      p_media_mimetype: input.mediaMimetype ?? null,
      p_media_filename: input.mediaFilename ?? null,
      p_media_duration: input.mediaDuration ?? null,
      p_external_id: input.externalId ?? null,
      p_client_message_id: input.clientMessageId ?? null,
      p_status: messageStatus,
      p_created_at: eventAt,
      p_increment_unread: Boolean(input.incrementUnread),
    } as never,
  );

  if (persistError) return { error: persistError.message };
  const result = persisted as {
    chat_id?: string | null;
    message?: unknown;
    duplicated?: boolean;
  } | null;
  return {
    chatId: result?.chat_id ?? chatId,
    message: result?.message ?? null,
    duplicated: Boolean(result?.duplicated),
  };
}

/** Validates the current, server-managed Evolution webhook credential. */
export async function isValidManagedWebhookRequest(request: Request): Promise<boolean> {
  // Sem credencial: 401 imediato, sem tocar no cofre/banco.
  if (!request.headers.get("x-webhook-token") && !request.headers.get("apikey")) return false;
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const managed = await resolveManagedIntegration("evolution");
  if (managed.disabled) return false;
  const tokens = (
    managed.secrets["webhook_token"]
      ? [managed.secrets["webhook_token"]]
      : managed.secrets["api_key"]
        ? [managed.secrets["api_key"]]
        : [process.env["EVOLUTION_WEBHOOK_TOKEN"], process.env["EVOLUTION_API_KEY"]]
  ).filter((v): v is string => !!v);
  if (!tokens.length) return false;
  // Credentials in query strings leak into access logs and tracing. Evolution
  // is configured to send this token in a request header instead.
  const provided = request.headers.get("x-webhook-token") || request.headers.get("apikey") || "";
  // Portão barato (ainda sem saber a instância): segredo global legado OU um token com a forma
  // de token por instância. A autorização real é feita por verifyInstanceWebhookRequest, assim
  // que o nome da instância do evento é conhecido.
  return secureTokenMatches(provided, tokens) || isInstanceTokenShape(provided);
}

/** Confirma que o token apresentado pertence à instância declarada no evento. */
export async function verifyInstanceWebhookRequest(
  request: Request,
  instanceName: string,
): Promise<boolean> {
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const managed = await resolveManagedIntegration("evolution");
  if (managed.disabled) return false;
  const provided = request.headers.get("x-webhook-token") || request.headers.get("apikey") || "";
  const match = matchWebhookCredential({
    provided,
    instanceName,
    masterSecrets: [
      managed.secrets["webhook_token"],
      managed.secrets["api_key"],
      process.env["EVOLUTION_WEBHOOK_TOKEN"],
      process.env["EVOLUTION_API_KEY"],
    ],
    // Migração: enquanto houver instâncias com o segredo global, aceitar. Depois que o
    // watchdog reconfigurar todas, definir EVOLUTION_WEBHOOK_LEGACY_TOKEN=deny.
    allowLegacy: process.env["EVOLUTION_WEBHOOK_LEGACY_TOKEN"] !== "deny",
  });
  if (match === "legacy") {
    console.warn("[evolution-webhook] segredo global legado usado", { instanceName });
  }
  return match !== null;
}
export function publicWebhookUrl(): string {
  // Never configure preview callbacks against the production host.
  return evolutionWebhookUrl(process.env);
}
