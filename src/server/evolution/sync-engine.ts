import { randomUUID } from "node:crypto";
import {
  cleanPhone,
  evolutionFetch,
  storeBase64Media,
  fetchContactProfilePicture,
  getGroupMetadata,
  recordGroupMetadata,
} from "@/lib/evolution.server";
import {
  extractMediaBase64,
  extractText,
  extractMediaInfo,
  isGifMedia,
  previewFor,
  type EvolutionMessagePayload,
} from "@/server/evolution/normalize-message";
import type { Database } from "@/integrations/supabase/types";
import {
  collectDirectLidMappings,
  contactDisplayName,
  scopedIdentityKey,
} from "@/server/evolution/contact-identity";
import { TenantCache } from "@/server/evolution/tenant-cache";
import { evolutionMessagePageBody } from "@/server/evolution/message-query";
import { WHATSAPP_CONTACTS_ON_CONFLICT } from "@/server/evolution/schema-contract";
import { isValidPhone, isBroadcastOrStatus } from "@/lib/conversationKey";
import { syncCrmLeadsFromWhatsApp } from "@/server/product/crm-contact-sync.server";
import { isEvolutionMessageAfterConnection } from "@/server/evolution/event-contract";
import { logServerError, logServerWarning } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

type EvolutionContact = {
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  phoneNumber?: string;
  name?: string;
  savedName?: string;
  contactName?: string;
  verifiedName?: string;
  pushName?: string;
  profilePicUrl?: string;
  profilePictureUrl?: string;
  picture?: string;
  isSaved?: boolean;
  isMyContact?: boolean;
};

type EvolutionParticipant = {
  id?: string;
  jid?: string;
  phoneNumber?: string;
  admin?: string;
  role?: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string;
  profilePictureUrl?: string;
};

type EvolutionGroup = {
  id?: string;
  jid?: string;
  subject?: string;
  name?: string;
  desc?: string;
  description?: string;
  announce?: boolean;
  restrict?: boolean;
  owner?: string;
  size?: number;
  pictureUrl?: string;
  profilePicUrl?: string;
  profilePictureUrl?: string;
  picture?: string;
  participants?: EvolutionParticipant[];
};

type EvolutionMessageKey = {
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  participant?: string;
  participantAlt?: string;
  fromMe?: boolean;
};

type EvolutionRawMessage = EvolutionMessagePayload & { base64?: string | null };
type EvolutionMessageRecord = {
  id?: string;
  key?: EvolutionMessageKey;
  message?: EvolutionRawMessage;
  participant?: string;
  pushName?: string;
  base64?: string | null;
  messageTimestamp?: string | number;
  createdAt?: string | number;
  contextInfo?: unknown;
};

type ChatSummary = Pick<
  Database["public"]["Tables"]["chats"]["Row"],
  "id" | "phone" | "name" | "profile_pic_url" | "is_group" | "remote_jid"
>;
type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
type StoredContact = {
  remote_jid: string;
  alternate_jid: string | null;
  phone: string | null;
  push_name: string | null;
  saved_name: string | null;
  profile_pic_url: string | null;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function providerArray<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value.filter((item) => objectValue(item) !== null) as unknown as T[])
    : [];
}

function contactsFrom(value: unknown): EvolutionContact[] {
  if (Array.isArray(value)) return providerArray<EvolutionContact>(value);
  const root = objectValue(value);
  return providerArray<EvolutionContact>(
    root?.["contacts"] ?? root?.["chats"] ?? root?.["records"],
  );
}

function isGroupJid(value: unknown): boolean {
  return String(value ?? "")
    .trim()
    .endsWith("@g.us");
}

async function fetchContactCatalog(instanceName: string) {
  const encodedName = encodeURIComponent(instanceName);
  const contacts = await evolutionFetch<unknown>(`/chat/findContacts/${encodedName}`, {
    method: "POST",
    body: { where: {} },
  });
  if (contacts.ok) return contacts;

  // Algumas versões da Evolution retornam 500/404 no catálogo de contatos.
  // findChats é somente leitura e preserva nome/foto dos chats já conhecidos.
  return evolutionFetch<unknown>(`/chat/findChats/${encodedName}`, {
    method: "POST",
    body: { where: {}, page: 1, limit: 1000 },
  });
}

function groupsFrom(value: unknown): EvolutionGroup[] {
  if (Array.isArray(value)) return providerArray<EvolutionGroup>(value);
  return providerArray<EvolutionGroup>(objectValue(value)?.["groups"]);
}

function messagesFrom(value: unknown): EvolutionMessageRecord[] {
  if (Array.isArray(value)) return providerArray<EvolutionMessageRecord>(value);
  const root = objectValue(value);
  const messages = root?.["messages"];
  if (Array.isArray(messages)) return providerArray<EvolutionMessageRecord>(messages);
  return providerArray<EvolutionMessageRecord>(
    objectValue(messages)?.["records"] ?? root?.["records"],
  );
}

/**
 * Normaliza timestamp vindo da Evolution API em ISO string
 */
function toIso(value: unknown): string {
  if (value == null || value === "") return new Date().toISOString();
  const num = Number(value);
  const millis =
    Number.isFinite(num) && num > 0 ? (num < 1e11 ? num * 1000 : num) : Date.parse(String(value));
  if (!Number.isFinite(millis) || Math.abs(millis) > 8.64e15) return new Date().toISOString();
  const parsed = new Date(millis);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

/**
 * Extrai informações de mensagem citada (quote / contextInfo)
 */
function extractQuotedMessage(
  message: unknown,
  rawRecord: unknown,
  workspaceId: string,
  instanceName: string,
) {
  const raw = objectValue(rawRecord);
  const msg = objectValue(message);
  const nestedContext = (key: string) => objectValue(objectValue(msg?.[key])?.["contextInfo"]);
  const rawMessage = objectValue(raw?.["message"]);
  const context =
    objectValue(raw?.["contextInfo"]) ??
    objectValue(msg?.["contextInfo"]) ??
    nestedContext("extendedTextMessage") ??
    nestedContext("imageMessage") ??
    nestedContext("videoMessage") ??
    nestedContext("audioMessage") ??
    nestedContext("documentMessage") ??
    nestedContext("stickerMessage") ??
    objectValue(objectValue(rawMessage?.["extendedTextMessage"])?.["contextInfo"]);

  if (!context || (!context["quotedMessage"] && !context["stanzaId"])) return null;

  const quoted = context["quotedMessage"];
  const text = extractText(quoted) || String(context["text"] || "") || null;
  const info = extractMediaInfo(quoted);
  const participant = context["participant"] ? cleanPhone(String(context["participant"])) : null;
  const senderName = participant
    ? contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, participant)) || null
    : String(context["participantName"] || "") || null;

  return {
    id: String(context["stanzaId"] || "") || null,
    senderName,
    senderPhone: participant,
    text: text || (info.kind ? previewFor(info.kind) : "Mensagem"),
    type: info.kind ?? "text",
  };
}

/**
 * Cache em memória para resolução rápida de contatos e LIDs
 */
const contactNameCache = new TenantCache<string>();
const contactPicCache = new TenantCache<string>();
const contactPhoneCache = new TenantCache<string>();
const lastContactRefresh = new Map<string, number>();

export async function refreshContactsCache(
  instanceName: string,
  workspaceId: string,
  fetchRemote = true,
) {
  const now = Date.now();
  const refreshKey = `${workspaceId}:${instanceName}`;
  if (now - (lastContactRefresh.get(refreshKey) ?? 0) < 60000) {
    return;
  }
  try {
    const res = fetchRemote ? await fetchContactCatalog(instanceName) : null;
    if (res?.ok) {
      const list = contactsFrom(res.data);
      for (const c of list) {
        if (isGroupJid(c.remoteJid || c.id)) continue;
        const primaryPhone = cleanPhone(c.remoteJid || c.id);
        const altPhone = cleanPhone(c.remoteJidAlt || c.phoneNumber);
        const rawJid = String(c.remoteJid || c.id || "");
        const lidMatch = rawJid.match(/^(\d+)@lid$/);
        const lidDigits = lidMatch ? lidMatch[1] : null;

        const realPhone = isValidPhone(altPhone)
          ? altPhone
          : isValidPhone(primaryPhone)
            ? primaryPhone
            : "";

        const name = contactDisplayName({
          savedName: c.name || c.savedName || c.contactName || c.verifiedName,
          pushName: c.pushName,
          phone: realPhone || altPhone || primaryPhone,
        });
        const pic = c.profilePicUrl || c.profilePictureUrl || c.picture || null;

        const identities = [primaryPhone, altPhone, lidDigits].filter(Boolean) as string[];
        for (const identity of identities) {
          const key = scopedIdentityKey(workspaceId, instanceName, identity);
          if (name && !name.match(/^\d+$/)) contactNameCache.set(key, name);
          if (pic) contactPicCache.set(key, pic);
          if (realPhone) contactPhoneCache.set(key, realPhone);
        }
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storedContacts: Array<{
      remote_jid: string;
      alternate_jid: string | null;
      phone: string | null;
      saved_name: string | null;
      push_name: string | null;
      profile_pic_url: string | null;
    }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from("whatsapp_contacts")
        .select("remote_jid,alternate_jid,phone,saved_name,push_name,profile_pic_url")
        .eq("workspace_id", workspaceId)
        .eq("instance_name", instanceName)
        .range(from, from + 999);
      if (pageError) throw pageError;
      storedContacts.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    for (const contact of storedContacts) {
      const phone = cleanPhone(contact.phone);
      const identities = [
        cleanPhone(contact.remote_jid),
        cleanPhone(contact.alternate_jid),
        phone,
      ].filter(Boolean);
      const name = contactDisplayName({
        savedName: contact.saved_name,
        pushName: contact.push_name,
        phone: isValidPhone(phone) ? phone : undefined,
      });
      for (const identity of identities) {
        const key = scopedIdentityKey(workspaceId, instanceName, identity);
        if (isValidPhone(phone)) contactPhoneCache.set(key, phone);
        if (name) contactNameCache.set(key, name);
        if (contact.profile_pic_url) contactPicCache.set(key, contact.profile_pic_url);
      }
    }
    lastContactRefresh.set(refreshKey, now);
    console.info("[sync-engine] contact cache refreshed", {
      workspaceId,
      instanceName,
      names: contactNameCache.sizeOf(workspaceId),
    });
  } catch (err) {
    logServerError("[sync-engine] contact refresh failed", err);
  }
}

async function backfillMissingGroupSenders(_instanceName: string, _workspaceId: string) {
  return 0;
}

/**
 * Sincroniza mensagens mais recentes de forma ultrarrápida (em tempo real)
 */
export async function syncRecentMessages(
  instanceName: string,
  workspaceId: string,
  limit = 50,
  options: {
    refreshRemoteContacts?: boolean;
    mediaDownloadLimit?: number;
    profilePictureLimit?: number;
  } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ownedInstance } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id,connected_at,status")
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!ownedInstance) return { success: false, error: "Instância não pertence ao workspace" };
  if (ownedInstance.status !== "open")
    return { success: false, error: "Instância não está conectada", count: 0 };

  // Atualiza cache de contatos se necessário
  await refreshContactsCache(instanceName, workspaceId, options.refreshRemoteContacts ?? true);

  // Pré-carrega metadados e nomes oficiais de grupos da Evolution API para garantir que
  // mensagens de grupos nunca sejam associadas a nomes provisórios como "Grupo WhatsApp"
  try {
    const groupListRes = await evolutionFetch<unknown>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
    );
    if (groupListRes.ok) {
      const gList = groupsFrom(groupListRes.data);
      for (const g of gList) {
        const gJid = g.id || g.jid;
        const gPhone = cleanPhone(gJid);
        const gSubject = String(g.subject || g.name || "").trim();
        if (gPhone && gSubject) {
          recordGroupMetadata(workspaceId, instanceName, gPhone, {
            subject: gSubject,
            desc: g.desc || g.description || null,
            announce: Boolean(g.announce),
            restrict: Boolean(g.restrict),
          });
          contactNameCache.set(scopedIdentityKey(workspaceId, instanceName, gPhone), gSubject);
        }
      }
    }
  } catch {
    // Silencioso se grupos não puderem ser pré-carregados
  }

  if (limit >= 500) await backfillMissingGroupSenders(instanceName, workspaceId);

  // A Evolution limita cada página a 500 registros. Percorre as páginas para
  // recuperar lacunas deixadas por uma interrupção longa do webhook.
  const pageSize = Math.min(Math.max(limit, 1), 500);
  const maxPages = Math.max(1, Math.ceil(limit / pageSize));
  const records: EvolutionMessageRecord[] = [];
  const seenRecordIds = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const msgRes = await evolutionFetch<unknown>(
      `/chat/findMessages/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: evolutionMessagePageBody(pageSize, page),
      },
    );
    if (!msgRes.ok) {
      return {
        success: false,
        error: msgRes.error || `Falha ao buscar mensagens (página ${page})`,
      };
    }
    const pageRecords = messagesFrom(msgRes.data);
    for (const record of pageRecords) {
      const recordId = String(record?.key?.id ?? record?.id ?? "");
      if (recordId && seenRecordIds.has(recordId)) continue;
      if (recordId) seenRecordIds.add(recordId);
      records.push(record);
    }
    if (pageRecords.length < pageSize) break;
  }

  // Evolution's findMessages endpoint is a history endpoint. Even when this
  // repair routine is invoked explicitly, only records from the current
  // connection epoch are eligible; no pre-connection message may enter InboxOS.
  const liveRecords = records.filter((record) =>
    isEvolutionMessageAfterConnection(
      record?.messageTimestamp ?? record?.createdAt,
      ownedInstance.connected_at,
    ),
  );
  records.length = 0;
  records.push(...liveRecords);

  if (records.length === 0) {
    return { success: true, count: 0 };
  }

  // 1. Identifica quais mensagens já existem no Supabase
  const externalIds = records
    .map((record) => record.key?.id ?? record.id)
    .filter((id): id is string => Boolean(id));

  const existingIds = new Set<string>();
  const existingByExternalId = new Map<
    string,
    {
      id: string;
      sender_phone: string | null;
      sender_name: string | null;
      sender_avatar: string | null;
    }
  >();
  for (let start = 0; start < externalIds.length; start += 300) {
    const { data: found } = await supabaseAdmin
      .from("messages")
      .select("id,external_id,sender_phone,sender_name,sender_avatar")
      .eq("workspace_id", workspaceId)
      .eq("instance_id", ownedInstance.id)
      .in("external_id", externalIds.slice(start, start + 300));

    for (const row of found ?? []) {
      if (row.external_id) {
        existingIds.add(row.external_id);
        existingByExternalId.set(row.external_id, row);
      }
    }
  }

  // 2. Mapa de conversas do workspace para vincular as mensagens
  const { data: savedChats } = await supabaseAdmin
    .from("chats")
    .select("id, phone, name, profile_pic_url, is_group, remote_jid")
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName);

  const chatByPhone = new Map<string, ChatSummary>(
    (savedChats ?? []).map((chat) => [chat.phone, chat]),
  );

  let insertedCount = 0;
  const rowsToInsert: MessageInsert[] = [];
  const lastByChat = new Map<string, { text: string; type: string; at: string }>();
  const messagePictureJobs: Array<() => Promise<unknown>> = [];
  const queuedPicturePhones = new Set<string>();
  let existingSenderUpdateCount = 0;
  let historicalMediaDownloadCount = 0;

  for (const record of records) {
    const key = record?.key ?? {};
    const externalId = key.id ?? record?.id ?? null;
    if (!externalId) continue;

    const existingMessage = existingByExternalId.get(externalId);
    if (existingMessage) {
      const existingRemoteJid = String(key.remoteJid ?? "");
      if (existingRemoteJid.endsWith("@g.us") && !key.fromMe) {
        const rawParticipant = key.participantAlt || key.participant || record?.participant || "";
        const directCandidate = cleanPhone(key.participantAlt || "");
        const directPhone = isValidPhone(directCandidate) ? directCandidate : "";
        const participantIdentity = cleanPhone(rawParticipant);
        const senderPhone = existingMessage.sender_phone || directPhone || null;
        const senderName =
          existingMessage.sender_name ||
          (senderPhone
            ? contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, senderPhone))
            : null) ||
          (participantIdentity
            ? contactNameCache.get(
                scopedIdentityKey(workspaceId, instanceName, participantIdentity),
              )
            : null) ||
          record?.pushName ||
          senderPhone ||
          null;
        const senderAvatar =
          existingMessage.sender_avatar ||
          (senderPhone
            ? contactPicCache.get(scopedIdentityKey(workspaceId, instanceName, senderPhone))
            : null) ||
          (participantIdentity
            ? contactPicCache.get(scopedIdentityKey(workspaceId, instanceName, participantIdentity))
            : null) ||
          null;

        if (
          existingSenderUpdateCount < 10 &&
          (senderPhone !== existingMessage.sender_phone ||
            senderName !== existingMessage.sender_name ||
            senderAvatar !== existingMessage.sender_avatar)
        ) {
          existingSenderUpdateCount += 1;
          await supabaseAdmin
            .from("messages")
            .update({
              sender_phone: senderPhone,
              sender_name: senderName,
              sender_avatar: senderAvatar,
            })
            .eq("id", existingMessage.id)
            .eq("workspace_id", workspaceId)
            .eq("instance_id", ownedInstance.id);
        }
      }
      continue;
    }
    existingIds.add(externalId);

    // Identifica o chat / JID
    const rawRemoteJid = String(key.remoteJid ?? "");
    const isGroup = rawRemoteJid.endsWith("@g.us");

    // Em grupos, o identificador do chat é SEMPRE o JID do grupo (remoteJid), NUNCA o remoteJidAlt do membro
    const rawPhoneCandidate = isGroup
      ? cleanPhone(key.remoteJid)
      : cleanPhone(key.remoteJidAlt || key.remoteJid);

    if (!rawPhoneCandidate) continue;

    // Resolução de LID: Se não for grupo e o candidato for um LID, consulta a cache
    let phone = rawPhoneCandidate;
    if (!isGroup && !isValidPhone(rawPhoneCandidate)) {
      const resolvedFromCache = contactPhoneCache.get(
        scopedIdentityKey(workspaceId, instanceName, rawPhoneCandidate),
      );
      if (resolvedFromCache && isValidPhone(resolvedFromCache)) {
        phone = resolvedFromCache;
      }
    }

    // Ignora broadcasts e status
    if (isBroadcastOrStatus(rawRemoteJid)) continue;

    // Para contatos individuais, valida comprimento do telefone (8–14 dígitos)
    if (!isGroup && !isValidPhone(phone)) continue;

    const lidDigits = !isGroup && rawRemoteJid.endsWith("@lid") ? cleanPhone(rawRemoteJid) : "";
    if (lidDigits && lidDigits !== phone && isValidPhone(phone)) {
      const orphanLidChat = chatByPhone.get(lidDigits);
      const realPhoneChat = chatByPhone.get(phone);
      if (orphanLidChat && realPhoneChat) {
        await supabaseAdmin
          .from("messages")
          .update({ chat_id: realPhoneChat.id })
          .eq("chat_id", orphanLidChat.id)
          .eq("workspace_id", workspaceId)
          .eq("instance_id", ownedInstance.id);
        await supabaseAdmin
          .from("chats")
          .delete()
          .eq("id", orphanLidChat.id)
          .eq("workspace_id", workspaceId)
          .eq("instance_name", instanceName);
        chatByPhone.delete(lidDigits);
      } else if (orphanLidChat) {
        await supabaseAdmin
          .from("chats")
          .update({ phone })
          .eq("id", orphanLidChat.id)
          .eq("workspace_id", workspaceId)
          .eq("instance_name", instanceName);
        chatByPhone.delete(lidDigits);
        chatByPhone.set(phone, { ...orphanLidChat, phone });
      }
    }

    let chat = chatByPhone.get(phone);
    const createdAt = toIso(record?.messageTimestamp ?? record?.createdAt);

    // Se a conversa não existe ainda no Supabase, busca ou cria atomicamente
    // para evitar duplicação sob concorrência (dois workers processando o mesmo phone).
    if (!chat) {
      // Primeiro tenta buscar chat existente pela chave composta natural
      const { data: existingChat } = await supabaseAdmin
        .from("chats")
        .select("id, phone, name, profile_pic_url, is_group, remote_jid")
        .eq("workspace_id", workspaceId)
        .eq("instance_name", instanceName)
        .eq("phone", phone)
        .maybeSingle();

      if (existingChat) {
        chat = existingChat;
        chatByPhone.set(phone, existingChat);
      } else {
        const fromMe = Boolean(key.fromMe);
        // A provider pushName is not a tenant-safe identity. Any message marked
        // fromMe belongs to the connected instance, so never use its pushName to
        // name the contact or leak the operator's personal brand.
        const isOwnerPush = fromMe;
        const safePush = isOwnerPush ? null : record?.pushName;

        // NUNCA usar safePush (pushName do membro) para nomear um grupo do WhatsApp!
        const groupSubject = isGroup
          ? getGroupMetadata(workspaceId, instanceName, phone)?.subject ||
            contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, phone)) ||
            "Grupo WhatsApp"
          : null;

        const contactName = isGroup
          ? groupSubject
          : (contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, phone)) ??
            safePush ??
            null);

        const contactPic =
          contactPicCache.get(scopedIdentityKey(workspaceId, instanceName, phone)) ?? null;

        const { data: newChat, error: chatErr } = await supabaseAdmin
          .from("chats")
          .upsert(
            {
              id: randomUUID(),
              workspace_id: workspaceId,
              instance_id: ownedInstance.id,
              instance_name: instanceName,
              phone,
              phone_e164: isGroup ? null : phone,
              remote_jid: isGroup ? rawRemoteJid : `${phone}@s.whatsapp.net`,
              identity_kind: isGroup ? "group" : "phone",
              name: contactName,
              profile_pic_url: contactPic,
              is_group: isGroup,
              last_message_at: createdAt,
            },
            // The production schema may still expose only a partial composite
            // index; using the generated primary key keeps this path compatible
            // until the full identity index is applied.
            { onConflict: "id" },
          )
          .select("id, phone, name, profile_pic_url, is_group, remote_jid")
          .maybeSingle();

      if (!chatErr && newChat) {
        chat = newChat;
        chatByPhone.set(phone, newChat);

        // Se ainda não tem foto, dispara busca em background
        if (!newChat.profile_pic_url && !isGroup && !queuedPicturePhones.has(phone)) {
          queuedPicturePhones.add(phone);
          messagePictureJobs.push(() =>
            fetchContactProfilePicture(instanceName, phone, undefined, undefined, workspaceId)
              .then(async (pic) => {
                if (pic && newChat.id) {
                  await supabaseAdmin
                    .from("chats")
                    .update({ profile_pic_url: pic })
                    .eq("id", newChat.id)
                    .eq("workspace_id", workspaceId)
                    .eq("instance_name", instanceName);
                }
              })
              .catch(() => {}),
          );
        }
      }
    }
    }

    if (isGroup && chat && chat.remote_jid !== rawRemoteJid) {
      await supabaseAdmin
        .from("chats")
        .update({ remote_jid: rawRemoteJid })
        .eq("id", chat.id)
        .eq("workspace_id", workspaceId)
        .eq("instance_name", instanceName);
      chat.remote_jid = rawRemoteJid;
    }

    // Corrige e atualiza o nome oficial do grupo ou contato na tabela chats se estiver genérico ou cru
    if (isGroup && chat) {
      const officialSubject =
        getGroupMetadata(workspaceId, instanceName, phone)?.subject ||
        contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, phone));
      if (
        officialSubject &&
        (!chat.name || chat.name === "Grupo WhatsApp" || chat.name !== officialSubject)
      ) {
        await supabaseAdmin
          .from("chats")
          .update({ name: officialSubject })
          .eq("id", chat.id)
          .eq("workspace_id", workspaceId)
          .eq("instance_name", instanceName);
        chat.name = officialSubject;
      }
    } else if (!isGroup && chat) {
      const savedContact = contactNameCache.get(
        scopedIdentityKey(workspaceId, instanceName, phone),
      );
      if (
        savedContact &&
        (!chat.name || chat.name.startsWith("+") || /^\d+$/.test(chat.name.replace(/\D/g, "")))
      ) {
        await supabaseAdmin
          .from("chats")
          .update({ name: savedContact })
          .eq("id", chat.id)
          .eq("workspace_id", workspaceId)
          .eq("instance_name", instanceName);
        chat.name = savedContact;
      }
    }

    if (!chat) continue;

    const message = record?.message ?? {};

    // 1. Mensagem Apagada (REVOKE)
    if (message?.protocolMessage?.type === 0 || message?.protocolMessage?.type === "REVOKE") {
      const targetId = message.protocolMessage.key?.id;
      if (targetId) {
        const { deleteMessageByExternalId } = await import("@/lib/evolution.server");
        await deleteMessageByExternalId(workspaceId, targetId, ownedInstance.id);
        continue;
      }
    }

    // 2. Mensagem Editada
    if (message?.protocolMessage?.type === 14 || message?.protocolMessage?.editedMessage) {
      const targetId = message.protocolMessage.key?.id;
      const newText = extractText(message.protocolMessage.editedMessage || {});
      if (targetId && newText) {
        const { editMessageByExternalId } = await import("@/lib/evolution.server");
        await editMessageByExternalId(workspaceId, targetId, newText, ownedInstance.id);
        continue;
      }
    }

    // 3. Reação a Mensagem
    if (message?.reactionMessage) {
      const targetId = message.reactionMessage.key?.id;
      const emoji = message.reactionMessage.text || "";
      const rawPart = isGroup ? key.participantAlt || key.participant : null;
      const rPhone = cleanPhone(rawPart || key.remoteJid);
      if (targetId) {
        const { addReactionToMessage } = await import("@/lib/evolution.server");
        await addReactionToMessage(workspaceId, targetId, emoji, rPhone, ownedInstance.id);
        continue;
      }
    }

    const info = extractMediaInfo(message);
    const text = extractText(message);
    const type = info.kind ?? "text";
    if (type === "text" && !text) continue;

    // Download de Mídia (Áudio, Imagem, Vídeo, Documento)
    let mediaUrl: string | null = null;
    const mediaDownloadLimit = options.mediaDownloadLimit ?? 5;
    if (info.kind && historicalMediaDownloadCount < mediaDownloadLimit) {
      historicalMediaDownloadCount += 1;
      // Tenta obter base64 direto da mensagem ou da rota getBase64FromMediaMessage
      let base64: string | null = extractMediaBase64(record) || extractMediaBase64(message);
      if (!base64 && externalId) {
        try {
          const fetched = await evolutionFetch<unknown>(
            `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              body: {
                message: {
                  key: {
                    id: externalId,
                    remoteJid: key.remoteJid || undefined,
                    fromMe: Boolean(key.fromMe),
                  },
                },
                convertToMp4: false,
              },
            },
          );
          base64 = extractMediaBase64(fetched.data);
        } catch {
          // Erro de download silencioso
        }
      }

      if (base64) {
        const stored = await storeBase64Media(base64, info.mimetype, info.fileName, workspaceId);
        mediaUrl = stored.url;
      }
    }

    // Remetente em grupos ou mensagens diretas
    const fromMe = Boolean(key.fromMe);
    const sender = fromMe ? "agent" : "client";

    // Telefone real do participante
    const rawParticipant = isGroup
      ? key.participantAlt || key.participant || record?.participant
      : null;
    const isParticipantLid = Boolean(rawParticipant && String(rawParticipant).includes("@lid"));
    const participantPhone =
      isParticipantLid && key.participantAlt
        ? cleanPhone(key.participantAlt)
        : cleanPhone(rawParticipant);
    const senderPhone =
      fromMe || (isParticipantLid && !key.participantAlt) ? null : participantPhone || null;

    // Resolução de LID e nomes (mesmo que seja @lid, busca no contactNameCache)
    const rawLidDigits = rawParticipant ? String(rawParticipant).replace(/\D/g, "") : null;
    const safePushName =
      record?.pushName && !record.pushName.match(/^\d+$/) ? record.pushName : null;
    const senderName = fromMe
      ? null
      : (senderPhone
          ? contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, senderPhone))
          : null) ||
        (rawLidDigits
          ? contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, rawLidDigits))
          : null) ||
        safePushName ||
        (!isGroup ? chat.name : null) ||
        (senderPhone ? contactDisplayName({ phone: senderPhone }) : null);

    // Foto do remetente (com busca assíncrona automática)
    let senderAvatar = senderPhone
      ? contactPicCache.get(scopedIdentityKey(workspaceId, instanceName, senderPhone)) || null
      : null;
    if (!senderAvatar && !isGroup && chat.profile_pic_url) {
      senderAvatar = chat.profile_pic_url;
    }
    if (senderPhone && !senderAvatar && !queuedPicturePhones.has(senderPhone)) {
      queuedPicturePhones.add(senderPhone);
      messagePictureJobs.push(() =>
        fetchContactProfilePicture(instanceName, senderPhone, undefined, undefined, workspaceId)
          .then(async (pic) => {
            if (pic) {
              contactPicCache.set(scopedIdentityKey(workspaceId, instanceName, senderPhone), pic);
              await supabaseAdmin
                .from("messages")
                .update({ sender_avatar: pic })
                .eq("workspace_id", workspaceId)
                .eq("instance_id", ownedInstance.id)
                .eq("sender_phone", senderPhone);
            }
          })
          .catch(() => {}),
      );
    }

    // Mensagem citada (quote)
    const quoted = extractQuotedMessage(message, record, workspaceId, instanceName);

    rowsToInsert.push({
      workspace_id: workspaceId,
      instance_id: ownedInstance.id,
      chat_id: chat.id,
      remote_jid: isGroup ? rawRemoteJid : `${phone}@s.whatsapp.net`,
      external_id: externalId,
      sender,
      sender_name: senderName,
      sender_phone: senderPhone,
      sender_avatar: senderAvatar,
      quoted_message: quoted,
      type,
      text: text || null,
      media_url: mediaUrl,
      media_mimetype: info.mimetype,
      media_filename: info.fileName,
      media_duration: info.duration,
      is_gif: isGifMedia(message, info.mimetype, info.fileName),
      status: fromMe ? "sent" : "delivered",
      created_at: createdAt,
    });

    const current = lastByChat.get(chat.id);
    if (!current || current.at < createdAt) {
      lastByChat.set(chat.id, { text: previewFor(type, text), type, at: createdAt });
    }
  }

  // Insere em lote no Supabase
  if (rowsToInsert.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("messages").insert(rowsToInsert);
    if (!insErr) {
      insertedCount = rowsToInsert.length;
    } else if (insErr.code === "23505") {
      // Pode haver corrida entre webhook, sincronização manual e fallback do chat.
      // Reexecuta por item para que uma duplicata não descarte o restante do lote.
      for (const row of rowsToInsert) {
        const { error: rowError } = await supabaseAdmin.from("messages").insert(row);
        if (!rowError) insertedCount += 1;
        else if (rowError.code !== "23505") {
          logServerError("[sync-engine] message insert failed", rowError);
        }
      }
    } else {
      logServerError("[sync-engine] message batch insert failed", insErr);
    }
  }

  // Atualiza última mensagem nos chats
  const recentChatUpdates = [...lastByChat.entries()]
    .sort(([, left], [, right]) => right.at.localeCompare(left.at))
    .slice(0, 10);
  for (const [chatId, info] of recentChatUpdates) {
    await supabaseAdmin
      .from("chats")
      .update({
        last_message: info.text,
        last_message_type: info.type,
        last_message_at: info.at,
      })
      .eq("id", chatId)
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName);
  }

  const limitedMessagePictureJobs = messagePictureJobs.slice(0, options.profilePictureLimit ?? 3);
  for (let start = 0; start < limitedMessagePictureJobs.length; start += 3) {
    await Promise.allSettled(limitedMessagePictureJobs.slice(start, start + 3).map((job) => job()));
  }

  return { success: true, count: insertedCount };
}

/**
 * Sincroniza todos os grupos reais da Evolution API com nomes oficiais,
 * fotos de perfil e permissões de envio (detecção de bloqueio por admin).
 */
export async function syncGroups(
  instanceName: string,
  workspaceId: string,
  options: {
    includeParticipants?: boolean;
    syncParticipantContacts?: boolean;
    fetchMissingPictures?: boolean;
  } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { recordGroupMetadata } = await import("@/lib/evolution.server");

  // 1. Busca os dados da própria instância para saber o telefone do bot/número
  const { data: instData } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id,phone,status")
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!instData) {
    return { success: false, error: "Instância não pertence ao workspace", count: 0 };
  }
  if (instData.status !== "open") {
    return { success: false, error: "Instância não está conectada", count: 0 };
  }
  const myPhone = cleanPhone(instData?.phone);

  const includeParticipants = options.includeParticipants ?? false;
  const syncParticipantContacts = options.syncParticipantContacts ?? includeParticipants;
  const fetchMissingPictures = options.fetchMissingPictures ?? true;

  // 2. A rotina normal usa o payload leve. Participantes em massa tornam uma
  // única invocação grande demais para os limites de uma função serverless.
  let groupList: EvolutionGroup[] = [];
  try {
    const res = await evolutionFetch<unknown>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=${includeParticipants ? "true" : "false"}`,
      // Evolution can take 30–35s to enumerate a large WhatsApp account.
      // Keep the normal request bounded, but allow this read-only catalog call
      // enough time to complete before the Vercel background worker deadline.
      { timeoutMs: 45_000 },
    );
    if (res.ok) {
      groupList = groupsFrom(res.data);
    } else if (includeParticipants) {
      const fallback = await evolutionFetch<unknown>(
        `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
        { timeoutMs: 45_000 },
      );
      if (!fallback.ok) {
        return {
          success: false,
          error: safePublicError(
            fallback.error ?? res.error,
            "Falha ao consultar grupos na Evolution API",
          ),
        };
      }
      groupList = groupsFrom(fallback.data);
    } else {
      return {
        success: false,
        error: safePublicError(res.error, "Falha ao consultar grupos na Evolution API"),
      };
    }
  } catch (err) {
    logServerError("[sync-engine] group sync failed", err);
    return { success: false, error: "Falha ao consultar grupos na Evolution API" };
  }

  let syncedCount = 0;
  const currentGroupIds: string[] = [];
  const pictureJobs: Array<() => Promise<void>> = [];
  const participantRows = new Map<
    string,
    {
      workspace_id: string;
      instance_name: string;
      remote_jid: string;
      alternate_jid: string | null;
      phone: string;
      updated_at: string;
    }
  >();
  for (const g of groupList) {
    const rawJid = g.id || g.jid;
    if (!rawJid) continue;
    const groupId = cleanPhone(rawJid);
    if (!groupId) continue;
    currentGroupIds.push(groupId);

    const remoteSubject = String(g.subject || g.name || "").trim();
    const subject = remoteSubject || "Grupo WhatsApp";
    const announce = Boolean(g.announce);
    const restrict = Boolean(g.restrict);
    const desc = g.desc || g.description || null;

    // Verifica se nossa instância é admin
    let isAdmin = false;
    const participants: EvolutionParticipant[] = Array.isArray(g.participants)
      ? g.participants
      : [];
    for (const participant of participants) {
      const participantJid = String(participant?.id || "").trim();
      const phoneJid = String(participant?.phoneNumber || "").trim();
      const participantPhone = cleanPhone(phoneJid || participantJid);
      if (!participantJid || !isValidPhone(participantPhone)) continue;
      participantRows.set(participantJid, {
        workspace_id: workspaceId,
        instance_name: instanceName,
        remote_jid: participantJid,
        alternate_jid: phoneJid || null,
        phone: participantPhone,
        updated_at: new Date().toISOString(),
      });
    }
    if (myPhone) {
      const mePart = participants.find(
        (participant) => cleanPhone(participant.id || participant.phoneNumber) === myPhone,
      );
      isAdmin =
        mePart?.admin === "admin" ||
        mePart?.admin === "superadmin" ||
        cleanPhone(g.owner) === myPhone;
    }

    // Se o grupo é restrito a admins e nós não somos admin, não podemos enviar
    const canSend = announce ? isAdmin : true;

    // Registra no cache de permissões em tempo real
    recordGroupMetadata(workspaceId, instanceName, groupId, {
      announce,
      restrict,
      isAdmin,
      canSend,
      subject,
      desc,
    });
  }

  // Busca chats existentes para preservar mensagens recentes e timestamps sem sobrescrevê-los
  const { data: existingGroupChats } = await supabaseAdmin
    .from("chats")
    .select(
      "id, phone, remote_jid, last_message, last_message_at, profile_pic_url, is_admin, can_send, group_metadata",
    )
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName)
    .eq("is_group", true);

  const existingMap = new Map((existingGroupChats ?? []).map((c) => [c.phone, c]));

  // Prepara registros para lote único no Supabase (alta performance)
  const groupRowsToUpsert = groupList.flatMap((g) => {
    const rawJid = g.id || g.jid;
    if (!rawJid) return [];
    const groupId = cleanPhone(rawJid);
    if (!groupId) return [];
    const remoteSubject = String(g.subject || g.name || "").trim();
    const subject = remoteSubject || "Grupo WhatsApp";
    const announce = Boolean(g.announce);
    const restrict = Boolean(g.restrict);
    const desc = g.desc || g.description || null;

    const existingChat = existingMap.get(groupId);
    const hasParticipantDetails = Array.isArray(g.participants);
    let isAdmin = hasParticipantDetails ? false : Boolean(existingChat?.is_admin);
    const participants: EvolutionParticipant[] = Array.isArray(g.participants)
      ? g.participants
      : [];
    if (myPhone) {
      const mePart = participants.find(
        (participant) => cleanPhone(participant.id || participant.phoneNumber) === myPhone,
      );
      isAdmin =
        mePart?.admin === "admin" ||
        mePart?.admin === "superadmin" ||
        cleanPhone(g.owner) === myPhone;
    }
    const canSend = announce
      ? hasParticipantDetails
        ? isAdmin
        : Boolean(existingChat?.can_send)
      : true;
    recordGroupMetadata(workspaceId, instanceName, groupId, {
      announce,
      restrict,
      isAdmin,
      canSend,
      subject,
      desc,
    });
    const existingMetadata: Record<string, unknown> =
      existingChat?.group_metadata &&
      typeof existingChat.group_metadata === "object" &&
      !Array.isArray(existingChat.group_metadata)
        ? (existingChat.group_metadata as Record<string, unknown>)
        : {};
    const payloadPicture =
      g.pictureUrl || g.profilePicUrl || g.profilePictureUrl || g.picture || null;

    return [
      {
        // Use the primary key as the conflict target. Older production
        // databases may still have only a partial composite index on
        // (workspace_id, instance_id, remote_jid), which PostgREST cannot
        // infer for an upsert and which previously caused sync_groups 502s.
        id: existingChat?.id ?? randomUUID(),
        workspace_id: workspaceId,
        instance_id: instData?.id ?? null,
        instance_name: instanceName,
        phone: groupId,
        remote_jid: String(rawJid).includes("@g.us") ? String(rawJid) : `${rawJid}@g.us`,
        identity_kind: "group",
        ...(remoteSubject ? { name: remoteSubject } : {}),
        is_group: true,
        is_announcement: announce,
        can_send: canSend,
        is_admin: isAdmin,
        archived: false,
        ...(payloadPicture ? { profile_pic_url: payloadPicture } : {}),
        ...(existingChat?.last_message
          ? { last_message: existingChat.last_message }
          : { last_message: "Grupo do WhatsApp" }),
        ...(existingChat?.last_message_at
          ? { last_message_at: existingChat.last_message_at }
          : { last_message_at: new Date().toISOString() }),
        group_metadata: {
          description: desc,
          restrict,
          participantCount: hasParticipantDetails
            ? participants.length
            : Number(g.size ?? existingMetadata["participantCount"] ?? 0),
        },
      },
    ];
  });

  if (groupRowsToUpsert.length > 0) {
    const { data: savedChats, error: upsertErr } = await supabaseAdmin
      .from("chats")
      .upsert(groupRowsToUpsert, { onConflict: "id" })
      .select("id, phone, remote_jid, profile_pic_url");
    if (upsertErr)
      return {
        success: false,
        error: safePublicError(upsertErr, "Falha ao salvar grupos"),
        count: 0,
      };
    syncedCount = savedChats?.length || groupRowsToUpsert.length;

    if (instData?.id && savedChats?.length) {
      const chatByPhone = new Map(savedChats.map((chat) => [chat.phone, chat.id]));
      const groupParticipantRows = groupList.flatMap((group) => {
        const chatId = chatByPhone.get(cleanPhone(group.id || group.jid));
        if (!chatId || !Array.isArray(group.participants)) return [];
        return group.participants.flatMap((participant) => {
          const participantJid = String(participant?.id || participant?.jid || "").trim();
          if (!participantJid) return [];
          const role = String(participant?.admin || participant?.role || "member").toLowerCase();
          const displayName = String(participant?.name || participant?.pushName || "").trim();
          const profilePicture = String(
            participant?.profilePicUrl || participant?.profilePictureUrl || "",
          ).trim();
          return [
            {
              workspace_id: workspaceId,
              instance_id: instData.id,
              chat_id: chatId,
              participant_jid: participantJid,
              phone_e164: cleanPhone(participant?.phoneNumber || participantJid) || null,
              ...(displayName ? { display_name: displayName } : {}),
              ...(profilePicture ? { profile_pic_url: profilePicture } : {}),
              role: role === "superadmin" ? "superadmin" : role === "admin" ? "admin" : "member",
            },
          ];
        });
      });
      for (let start = 0; start < groupParticipantRows.length; start += 500) {
        await supabaseAdmin
          .from("group_participants")
          .upsert(groupParticipantRows.slice(start, start + 500), {
            onConflict: "chat_id,participant_jid",
          });
      }
    }

    for (const savedChat of savedChats ?? []) {
      if (fetchMissingPictures && !savedChat.profile_pic_url) {
        pictureJobs.push(async () =>
          fetchContactProfilePicture(
            instanceName,
            savedChat.remote_jid || `${savedChat.phone}@g.us`,
            undefined,
            undefined,
            workspaceId,
          ).then(async (pic) => {
            if (pic && savedChat.id) {
              await supabaseAdmin
                .from("chats")
                .update({ profile_pic_url: pic })
                .eq("id", savedChat.id)
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName);
            }
          }),
        );
      }
    }
  }

  // Evita disparar dezenas de chamadas de foto simultâneas contra a Evolution.
  const limitedPictureJobs = pictureJobs.slice(0, 6);
  for (let start = 0; start < limitedPictureJobs.length; start += 6) {
    await Promise.allSettled(limitedPictureJobs.slice(start, start + 6).map((job) => job()));
  }

  if (syncParticipantContacts) {
    const participantContacts = [...participantRows.values()];
    for (let start = 0; start < participantContacts.length; start += 750) {
      const { error: participantError } = await supabaseAdmin.from("whatsapp_contacts").upsert(
        participantContacts.slice(start, start + 750).map((contact) => ({
          ...contact,
          instance_id: instData?.id ?? null,
          identity_kind: contact.remote_jid.endsWith("@lid") ? "lid" : "phone",
        })),
        {
          onConflict: WHATSAPP_CONTACTS_ON_CONFLICT,
        },
      );
      if (participantError)
        return {
          success: false,
          error: safePublicError(participantError, "Falha ao salvar participantes"),
          count: syncedCount,
        };
    }
  }
  lastContactRefresh.delete(`${workspaceId}:${instanceName}`);

  const { data: savedGroups, error: savedGroupsError } = await supabaseAdmin
    .from("chats")
    .select("id, phone")
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName)
    .eq("is_group", true);
  if (savedGroupsError)
    return {
      success: false,
      error: safePublicError(savedGroupsError, "Falha ao consultar grupos salvos"),
      count: syncedCount,
    };
  const currentSet = new Set(currentGroupIds);
  const staleIds = (savedGroups ?? [])
    .filter((group) => !currentSet.has(group.phone))
    .map((group) => group.id);
  if (staleIds.length > 0) {
    const { error: archiveError } = await supabaseAdmin
      .from("chats")
      .update({ archived: true })
      .in("id", staleIds)
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName);
    if (archiveError)
      return {
        success: false,
        error: safePublicError(archiveError, "Falha ao atualizar grupos arquivados"),
        count: syncedCount,
      };
  }

  return { success: true, count: syncedCount, archived: staleIds.length };
}

/**
 * Atualiza participantes, nomes, papéis e fotos de um único grupo. Essa
 * granularidade mantém cada execução abaixo dos limites do Worker e permite
 * repetir somente o grupo que falhou.
 */
export async function syncGroupParticipants(
  instanceName: string,
  workspaceId: string,
  groupJid: string,
) {
  const groupId = cleanPhone(groupJid);
  const canonicalJid = String(groupJid).trim();
  if (!groupId || !String(groupJid).endsWith("@g.us")) {
    return { success: false, error: "Identificador de grupo inválido", count: 0 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { recordGroupMetadata } = await import("@/lib/evolution.server");
  const [{ data: instance }, { data: chat }] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_instances")
      .select("id,phone,status")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .maybeSingle(),
    supabaseAdmin
      .from("chats")
      .select("id,profile_pic_url,group_metadata,is_announcement")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .eq("phone", groupId)
      .maybeSingle(),
  ]);
  if (!instance || instance.status !== "open" || !chat) {
    return { success: false, error: "Grupo ou instância não pertence ao workspace", count: 0 };
  }

  const info = await evolutionFetch<unknown>(
    `/group/participants/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(canonicalJid)}`,
  );
  if (!info.ok) {
    return {
      success: false,
      error: safePublicError(info.error, "Falha ao consultar participantes"),
      count: 0,
    };
  }
  const infoData = objectValue(info.data);
  const raw: unknown = infoData?.["group"] ?? info.data;
  const group = objectValue(raw) as EvolutionGroup | null;
  const participants = Array.isArray(raw)
    ? providerArray<EvolutionParticipant>(raw)
    : providerArray<EvolutionParticipant>(group?.participants);
  const participantJids = participants
    .map((participant) => String(participant?.id || participant?.jid || "").trim())
    .filter(Boolean);

  const storedContacts: StoredContact[] = [];
  const participantPhones = [
    ...new Set(
      participants
        .map((participant) => cleanPhone(participant?.phoneNumber || participant?.id))
        .filter(Boolean),
    ),
  ];
  for (let start = 0; start < participantJids.length; start += 250) {
    const { data } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("remote_jid,alternate_jid,phone,push_name,saved_name,profile_pic_url")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .in("remote_jid", participantJids.slice(start, start + 250));
    storedContacts.push(...(data ?? []));
  }
  for (let start = 0; start < participantPhones.length; start += 250) {
    const { data } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("remote_jid,alternate_jid,phone,push_name,saved_name,profile_pic_url")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .in("phone", participantPhones.slice(start, start + 250));
    storedContacts.push(...(data ?? []));
  }
  const contactsByIdentity = new Map<string, StoredContact>();
  for (const contact of storedContacts) {
    for (const identity of [contact.remote_jid, contact.alternate_jid, contact.phone]) {
      if (identity) contactsByIdentity.set(String(identity), contact);
      const phone = cleanPhone(identity);
      if (phone) contactsByIdentity.set(phone, contact);
    }
  }

  const participantRows = participants.flatMap((participant) => {
    const participantJid = String(participant?.id || participant?.jid || "").trim();
    if (!participantJid) return [];
    const phone = cleanPhone(participant?.phoneNumber || participantJid);
    const stored =
      contactsByIdentity.get(participantJid) ||
      contactsByIdentity.get(String(participant?.phoneNumber || "")) ||
      contactsByIdentity.get(phone);
    const role = String(participant?.admin || participant?.role || "member").toLowerCase();
    const displayName = String(
      stored?.saved_name || stored?.push_name || participant?.name || participant?.pushName || "",
    ).trim();
    const profilePicture = String(
      participant?.profilePicUrl || participant?.profilePictureUrl || stored?.profile_pic_url || "",
    ).trim();
    return [
      {
        workspace_id: workspaceId,
        instance_id: instance.id,
        chat_id: chat.id,
        participant_jid: participantJid,
        phone_e164: phone || null,
        ...(displayName ? { display_name: displayName } : {}),
        ...(profilePicture ? { profile_pic_url: profilePicture } : {}),
        role: role === "superadmin" ? "superadmin" : role === "admin" ? "admin" : "member",
      },
    ];
  });
  for (let start = 0; start < participantRows.length; start += 300) {
    const { error } = await supabaseAdmin
      .from("group_participants")
      .upsert(participantRows.slice(start, start + 300), {
        onConflict: "chat_id,participant_jid",
      });
    if (error)
      return {
        success: false,
        error: safePublicError(error, "Falha ao salvar participantes"),
        count: start,
      };
  }

  const { data: existingParticipants } = await supabaseAdmin
    .from("group_participants")
    .select("id,participant_jid")
    .eq("chat_id", chat.id)
    .eq("workspace_id", workspaceId)
    .eq("instance_id", instance.id);
  const currentParticipants = new Set(participantJids);
  const staleParticipantIds = (existingParticipants ?? [])
    .filter((participant) => !currentParticipants.has(participant.participant_jid))
    .map((participant) => participant.id);
  if (staleParticipantIds.length > 0) {
    await supabaseAdmin
      .from("group_participants")
      .delete()
      .in("id", staleParticipantIds)
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instance.id);
  }

  const myPhone = cleanPhone(instance.phone);
  const me = participants.find(
    (participant) => cleanPhone(participant?.phoneNumber || participant?.id) === myPhone,
  );
  const isAdmin =
    me?.admin === "admin" || me?.admin === "superadmin" || cleanPhone(group?.owner) === myPhone;
  const announce = Boolean(group?.announce);
  const restrict = Boolean(group?.restrict);
  const subject = String(group?.subject || group?.name || "").trim();
  const existingMetadata =
    chat.group_metadata && typeof chat.group_metadata === "object"
      ? (chat.group_metadata as Record<string, unknown>)
      : {};
  const existingDescription =
    typeof existingMetadata["description"] === "string" ? existingMetadata["description"] : null;
  const storedAnnounce = Boolean(chat.is_announcement);
  const effectiveAnnounce = group?.announce == null ? storedAnnounce : announce;
  const effectiveRestrict =
    group?.restrict == null ? Boolean(existingMetadata["restrict"]) : restrict;
  const canSend = effectiveAnnounce ? isAdmin : true;

  const picture = group?.pictureUrl || group?.profilePicUrl || null;
  const { error: chatError } = await supabaseAdmin
    .from("chats")
    .update({
      ...(subject ? { name: subject } : {}),
      ...(picture ? { profile_pic_url: picture } : {}),
      is_announcement: effectiveAnnounce,
      is_admin: isAdmin,
      can_send: canSend,
      group_metadata: {
        ...existingMetadata,
        description: group?.desc || group?.description || existingDescription,
        restrict: effectiveRestrict,
        participantCount: participants.length,
      },
    })
    .eq("id", chat.id)
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName);
  if (chatError)
    return {
      success: false,
      error: safePublicError(chatError, "Falha ao atualizar o grupo"),
      count: 0,
    };

  recordGroupMetadata(workspaceId, instanceName, groupId, {
    announce: effectiveAnnounce,
    restrict: effectiveRestrict,
    isAdmin,
    canSend,
    subject: subject || "Grupo WhatsApp",
    desc: group?.desc || group?.description || existingDescription,
  });

  return { success: true, count: participantRows.length, removed: staleParticipantIds.length };
}

/**
 * Importa e sincroniza a agenda completa de contatos reais da Evolution API para o banco
 */
export async function syncContacts(instanceName: string, workspaceId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id,status")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!instance || instance.status !== "open")
      return { success: false, error: "Instância não está conectada" };
    const res = await fetchContactCatalog(instanceName);

    if (!res.ok) {
      return { success: false, error: safePublicError(res.error, "Falha ao buscar contatos") };
    }

    const list = contactsFrom(res.data);
    // Carrega os poucos chats diretos uma única vez e usa o histórico recente
    // para resolver LIDs que a agenda da Evolution não acompanha de remoteJidAlt.
    const { data: directChats, error: directChatsError } = await supabaseAdmin
      .from("chats")
      .select("id, phone, name, profile_pic_url")
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName)
      .eq("is_group", false);
    if (directChatsError)
      return {
        success: false,
        error: safePublicError(directChatsError, "Falha ao consultar conversas"),
      };
    const chatsByPhone = new Map((directChats ?? []).map((chat) => [chat.phone, chat]));
    const unresolvedLids = new Set(
      (directChats ?? []).map((chat) => chat.phone).filter((phone) => phone.length >= 15),
    );
    const lidPhoneMap = new Map<string, string>();
    for (let page = 1; page <= 5 && unresolvedLids.size > 0; page += 1) {
      const history = await evolutionFetch<unknown>(
        `/chat/findMessages/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: evolutionMessagePageBody(500, page) },
      );
      if (!history.ok) break;
      const records = messagesFrom(history.data);
      const pageMappings = collectDirectLidMappings(records);
      for (const [lid, phone] of pageMappings) {
        lidPhoneMap.set(lid, phone);
        unresolvedLids.delete(lid);
      }
      if (records.length < 500) break;
    }

    const rows = list.flatMap((contact) => {
      if (isGroupJid(contact.remoteJid || contact.id)) return [];
      const remoteJid = String(contact.remoteJid || contact.id || "").trim();
      if (!remoteJid) return [];
      const alternateJid = String(contact.remoteJidAlt || contact.phoneNumber || "").trim() || null;
      const primaryPhone = cleanPhone(remoteJid);
      const alternatePhone = cleanPhone(alternateJid);

      // Determina o telefone E.164 real do contato (8-14 dígitos). NUNCA usa LID de 15 dígitos.
      let phone = "";
      if (isValidPhone(alternatePhone)) {
        phone = alternatePhone;
      } else if (isValidPhone(primaryPhone)) {
        phone = primaryPhone;
      } else if (lidPhoneMap.has(primaryPhone)) {
        phone = lidPhoneMap.get(primaryPhone)!;
      }

      const savedName =
        String(
          contact.name || contact.savedName || contact.contactName || contact.verifiedName || "",
        ).trim() || null;
      const pushName = String(contact.pushName || "").trim() || null;
      const profilePicUrl =
        contact.profilePicUrl || contact.profilePictureUrl || contact.picture || null;
      const savedFlag =
        typeof contact.isSaved === "boolean"
          ? contact.isSaved
          : typeof contact.isMyContact === "boolean"
            ? contact.isMyContact
            : undefined;
      const displayName = contactDisplayName({
        savedName,
        pushName,
        phone: isValidPhone(phone) ? phone : undefined,
      });

      const identities = [primaryPhone, alternatePhone, phone].filter(Boolean);
      for (const identity of identities) {
        const key = scopedIdentityKey(workspaceId, instanceName, identity);
        if (displayName) contactNameCache.set(key, displayName);
        if (profilePicUrl) contactPicCache.set(key, profilePicUrl);
        if (isValidPhone(phone)) contactPhoneCache.set(key, phone);
      }

      return [
        {
          workspace_id: workspaceId,
          instance_id: instance.id,
          instance_name: instanceName,
          remote_jid: remoteJid,
          identity_kind: remoteJid.endsWith("@lid") ? "lid" : "phone",
          alternate_jid: alternateJid || (phone ? `${phone}@s.whatsapp.net` : null),
          ...(phone ? { phone } : {}),
          ...(savedName ? { saved_name: savedName } : {}),
          ...(pushName ? { push_name: pushName } : {}),
          ...(profilePicUrl ? { profile_pic_url: profilePicUrl } : {}),
          ...(savedFlag === undefined ? {} : { is_saved: savedFlag }),
          updated_at: new Date().toISOString(),
        },
      ];
    });

    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await supabaseAdmin
        .from("whatsapp_contacts")
        .upsert(rows.slice(start, start + 500), {
          onConflict: WHATSAPP_CONTACTS_ON_CONFLICT,
        });
      if (error)
        return { success: false, error: safePublicError(error, "Falha ao salvar contatos") };
    }

    // The contacts catalog often omits profilePicUrl even though the profile
    // endpoint can still return it. Backfill a bounded batch immediately so
    // a manual sync shows real avatars without waiting for another page load;
    // the authenticated /sync-pfp route continues the remaining queue.
    const missingPictureRows = rows
      .filter((row) => row.phone && isValidPhone(row.phone) && !row.profile_pic_url)
      .slice(0, 120);
    for (let start = 0; start < missingPictureRows.length; start += 8) {
      await Promise.all(
        missingPictureRows.slice(start, start + 8).map(async (row) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5_000);
          try {
            const picture = await fetchContactProfilePicture(
              instanceName,
              row.remote_jid || row.phone!,
              false,
              controller.signal,
              workspaceId,
            );
            if (!picture) return;
            await supabaseAdmin
              .from("whatsapp_contacts")
              .update({ profile_pic_url: picture })
              .eq("remote_jid", row.remote_jid)
              .eq("workspace_id", workspaceId)
              .eq("instance_id", instance.id);
            await supabaseAdmin
              .from("chats")
              .update({ profile_pic_url: picture })
              .eq("workspace_id", workspaceId)
              .eq("instance_id", instance.id)
              .eq("phone", row.phone!);
          } catch {
            // A private/no-photo contact must not abort the rest of the sync.
          } finally {
            clearTimeout(timeout);
          }
        }),
      );
    }

    const { data: storedRows } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("id,remote_jid,alternate_jid,phone,is_saved")
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instance.id);
    const aliases = (storedRows ?? []).flatMap((contact) => {
      if (!contact.phone || !isValidPhone(contact.phone)) return [];
      const canonicalJid = `${contact.phone}@s.whatsapp.net`;
      return [contact.remote_jid, contact.alternate_jid]
        .filter((jid): jid is string => Boolean(jid))
        .map((aliasJid) => ({
          workspace_id: workspaceId,
          instance_id: instance.id,
          contact_id: contact.id,
          alias_jid: aliasJid,
          canonical_jid: canonicalJid,
          phone_e164: contact.phone,
        }));
    });
    for (let start = 0; start < aliases.length; start += 500) {
      await supabaseAdmin
        .from("contact_identity_aliases")
        .upsert(aliases.slice(start, start + 500), {
          onConflict: "workspace_id,instance_id,alias_jid",
        });
    }

    // Função auxiliar para pareamento flexível de telefones brasileiros (com ou sem 9º dígito)
    const findChatByPhone = (phoneStr: string) => {
      if (chatsByPhone.has(phoneStr)) return chatsByPhone.get(phoneStr);
      const clean = cleanPhone(phoneStr);
      if (chatsByPhone.has(clean)) return chatsByPhone.get(clean);
      if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
        const ddd = clean.slice(2, 4);
        const rest = clean.slice(4);
        if (clean.length === 13 && rest.startsWith("9")) {
          const alt12 = `55${ddd}${rest.slice(1)}`;
          if (chatsByPhone.has(alt12)) return chatsByPhone.get(alt12);
        } else if (clean.length === 12) {
          const alt13 = `55${ddd}9${rest}`;
          if (chatsByPhone.has(alt13)) return chatsByPhone.get(alt13);
        }
      }
      return null;
    };

    // Propaga nomes salvos da agenda do celular e fotos dos contatos para chats no banco
    for (const row of rows) {
      if (!row.phone || !isValidPhone(row.phone)) continue;
      const savedName = row.saved_name;
      const pushName = row.push_name;
      const preferredName = savedName || pushName;

      const existingChat = findChatByPhone(row.phone);

      if (existingChat) {
        const chatUpdate: { name?: string; profile_pic_url?: string } = {};
        // Se temos um nome salvo na agenda (saved_name), ele tem prioridade e atualiza o chat
        if (savedName && existingChat.name !== savedName) {
          chatUpdate.name = savedName;
        } else if (
          pushName &&
          (!existingChat.name ||
            existingChat.name.startsWith("+") ||
            /^\d+$/.test(existingChat.name.replace(/\D/g, "")))
        ) {
          chatUpdate.name = pushName;
        }
        if (row.profile_pic_url && existingChat.profile_pic_url !== row.profile_pic_url) {
          chatUpdate.profile_pic_url = row.profile_pic_url;
        }
        if (Object.keys(chatUpdate).length > 0) {
          await supabaseAdmin
            .from("chats")
            .update(chatUpdate)
            .eq("id", existingChat.id)
            .eq("workspace_id", workspaceId)
            .eq("instance_name", instanceName);
        }
      }

      // Cura automática: se houver chat órfão gravado com o LID (digitos de 15 dígitos)
      const lidDigits = cleanPhone(row.remote_jid);
      if (lidDigits && lidDigits !== row.phone && lidDigits.length >= 15) {
        const orphanLidChat = chatsByPhone.get(lidDigits);

        if (orphanLidChat) {
          if (existingChat) {
            // Re-vincula as mensagens do chat LID para o chat com telefone real
            await supabaseAdmin
              .from("messages")
              .update({ chat_id: existingChat.id })
              .eq("chat_id", orphanLidChat.id)
              .eq("workspace_id", workspaceId)
              .eq("instance_id", instance.id);
            // Deleta o chat LID duplicado
            await supabaseAdmin
              .from("chats")
              .delete()
              .eq("id", orphanLidChat.id)
              .eq("workspace_id", workspaceId)
              .eq("instance_name", instanceName);
            chatsByPhone.delete(lidDigits);
          } else {
            // Converte o chat LID existente para o telefone real E.164
            await supabaseAdmin
              .from("chats")
              .update({
                phone: row.phone,
                phone_e164: row.phone,
                remote_jid: `${row.phone}@s.whatsapp.net`,
                identity_kind: "phone",
                ...(preferredName ? { name: preferredName } : {}),
                ...(row.profile_pic_url ? { profile_pic_url: row.profile_pic_url } : {}),
              })
              .eq("id", orphanLidChat.id)
              .eq("workspace_id", workspaceId)
              .eq("instance_name", instanceName);
            chatsByPhone.delete(lidDigits);
            chatsByPhone.set(row.phone, {
              ...orphanLidChat,
              phone: row.phone,
              ...(preferredName ? { name: preferredName } : {}),
              ...(row.profile_pic_url ? { profile_pic_url: row.profile_pic_url } : {}),
            });
          }
        }
      }
    }

    lastContactRefresh.set(`${workspaceId}:${instanceName}`, Date.now());
    let crmImported = 0;
    try {
      const crmResult = await syncCrmLeadsFromWhatsApp(workspaceId, {
        instanceId: instance.id,
        instanceName,
      });
      crmImported = crmResult.imported;
    } catch (crmError) {
      // A CRM sync must never make the WhatsApp agenda appear failed. It will
      // be retried on the next contact sync and is visible in server logs.
      logServerWarning("[sync-engine] CRM contact import failed", crmError);
    }
    return { success: true, count: rows.length, crmImported };
  } catch (err: unknown) {
    logServerWarning("[sync-engine] contact sync failed", err);
    return { success: false, error: safePublicError(err, "Falha ao sincronizar contatos") };
  }
}
