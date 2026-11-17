import { cleanPhone, isValidPhone } from "@/lib/conversationKey";

type SyncOptions = {
  instanceId?: string | null;
  instanceName?: string | null;
};

type ContactIdentity = {
  id: string;
  instance_id: string;
  instance_name: string;
  phone: string | null;
  saved_name: string | null;
  push_name: string | null;
  profile_pic_url: string | null;
  is_saved: boolean;
};

type ChatIdentity = {
  id: string;
  instance_id: string;
  instance_name: string;
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
  last_message_at: string | null;
  is_group: boolean;
};

export type CrmLeadPresentation = {
  profilePicUrl: string | null;
  isSavedContact: boolean;
  contactCategory: "saved_contact" | "potential_lead" | "manual";
};

async function client() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * The saved-contact marker was added after the first CRM migration. Deploys
 * that have the older whatsapp_contacts schema must keep the Clients screen
 * usable while the additive migration is being applied. Only this exact
 * missing-column case is eligible for the compatibility query; all other
 * database errors still fail closed.
 */
export function isMissingSavedContactColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === "42703" && /\bis_saved\b/i.test(String(value.message ?? ""));
}

type ContactQueryOptions = {
  instanceName?: string | null;
  contactIds?: string[];
};

async function loadWhatsAppContacts(
  dbClient: Awaited<ReturnType<typeof client>>,
  workspaceId: string,
  options: ContactQueryOptions = {},
): Promise<ContactIdentity[]> {
  const buildQuery = (includeSavedMarker: boolean) => {
    // Supabase's generated select parser cannot represent the intentional
    // legacy/modern column union. Keep the compatibility query narrow; the
    // migration owns the authoritative schema and this fallback is guarded by
    // the exact missing-column error below.
    let query = includeSavedMarker
      ? dbClient
          .from("whatsapp_contacts")
          .select(
            "id,instance_id,instance_name,phone,saved_name,push_name,profile_pic_url,is_saved",
          )
          .eq("workspace_id", workspaceId)
      : dbClient
          .from("whatsapp_contacts")
          .select("id,instance_id,instance_name,phone,saved_name,push_name,profile_pic_url")
          .eq("workspace_id", workspaceId);
    if (options.instanceName) query = query.eq("instance_name", options.instanceName);
    if (options.contactIds?.length) query = query.in("id", options.contactIds);
    return query;
  };

  let result = await buildQuery(true);
  if (isMissingSavedContactColumnError(result.error)) {
    result = await buildQuery(false);
  }
  if (result.error) throw result.error;

  return (result.data ?? ([] as Array<Record<string, unknown>>)).map(
    (row: Record<string, unknown>) => ({
      ...row,
      // On the legacy schema a saved name is the only reliable marker available.
      is_saved:
        "is_saved" in row
          ? Boolean(row["is_saved"])
          : typeof row["saved_name"] === "string" && Boolean(row["saved_name"].trim()),
    }),
  ) as ContactIdentity[];
}

function phoneE164(phone: string | null) {
  const digits = cleanPhone(phone);
  return isValidPhone(digits) ? `+${digits}` : null;
}

/**
 * Converte a agenda recebida da Evolution em registros CRM idempotentes.
 * Contatos salvos na agenda são importados como contatos conhecidos; números
 * não salvos só entram como possível lead quando já possuem uma conversa.
 */
export async function syncCrmLeadsFromWhatsApp(workspaceId: string, options: SyncOptions = {}) {
  const db = await client();
  const [stageResult, contacts, chatsResult, leadsResult, instancesResult] = await Promise.all([
    db
      .from("crm_stages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .order("position")
      .limit(1)
      .maybeSingle(),
    loadWhatsAppContacts(db, workspaceId, {
      instanceName: options.instanceName ?? null,
    }),
    db
      .from("chats")
      .select("id,instance_id,instance_name,phone,name,profile_pic_url,last_message_at,is_group")
      .eq("workspace_id", workspaceId)
      .eq("is_group", false),
    db
      .from("crm_leads")
      .select("id,name,chat_id,contact_id,phone_e164")
      .eq("workspace_id", workspaceId),
    db.from("whatsapp_instances").select("id").eq("workspace_id", workspaceId).eq("status", "open"),
  ]);

  if (stageResult.error) throw stageResult.error;
  if (chatsResult.error) throw chatsResult.error;
  if (leadsResult.error) throw leadsResult.error;
  if (instancesResult.error) throw instancesResult.error;
  if (!stageResult.data?.id) return { imported: 0, skipped: 0 };

  const activeInstanceIds = new Set((instancesResult.data ?? []).map((row) => row.id));
  const chats = (chatsResult.data ?? []).filter(
    (chat) => typeof chat.instance_id === "string" && activeInstanceIds.has(chat.instance_id),
  ) as ChatIdentity[];
  const activeContacts = contacts.filter((contact) => activeInstanceIds.has(contact.instance_id));
  const existing = leadsResult.data ?? [];
  const existingContacts = new Set(
    existing.flatMap((lead) => (lead.contact_id ? [lead.contact_id] : [])),
  );
  const existingChats = new Set(existing.flatMap((lead) => (lead.chat_id ? [lead.chat_id] : [])));
  const existingPhones = new Set(
    existing.flatMap((lead) => (lead.phone_e164 ? [cleanPhone(lead.phone_e164)] : [])),
  );
  const existingByContact = new Map(
    existing.flatMap((lead) => (lead.contact_id ? [[lead.contact_id, lead] as const] : [])),
  );
  const existingByPhone = new Map(
    existing.flatMap((lead) =>
      lead.phone_e164 ? [[cleanPhone(lead.phone_e164), lead] as const] : [],
    ),
  );
  const chatsByIdentity = new Map(
    chats.map((chat) => [`${chat.instance_id}:${cleanPhone(chat.phone)}`, chat]),
  );

  const candidates = activeContacts.filter((contact) => {
    const phone = cleanPhone(contact.phone);
    if (!phone || !isValidPhone(phone)) return false;
    if (options.instanceId && contact.instance_id !== options.instanceId) return false;
    const chat = chatsByIdentity.get(`${contact.instance_id}:${phone}`);
    return Boolean(contact.is_saved || chat);
  });

  const rows = candidates.flatMap((contact) => {
    const phone = cleanPhone(contact.phone);
    const chat = chatsByIdentity.get(`${contact.instance_id}:${phone}`);
    if (
      existingContacts.has(contact.id) ||
      (chat && existingChats.has(chat.id)) ||
      existingPhones.has(phone)
    ) {
      return [];
    }
    const displayName =
      contact.saved_name?.trim() ||
      contact.push_name?.trim() ||
      chat?.name?.trim() ||
      phoneE164(phone) ||
      "Contato WhatsApp";
    return [
      {
        workspace_id: workspaceId,
        stage_id: stageResult.data!.id,
        chat_id: chat?.id ?? null,
        contact_id: contact.id,
        name: displayName,
        phone_e164: phoneE164(phone),
        value_cents: 0,
        currency: "BRL",
        source: "import",
        created_by: null,
        notes: "Importado automaticamente da agenda do WhatsApp.",
        last_contact_at: chat?.last_message_at ?? null,
      },
    ];
  });

  // Atualiza somente nomes que eram fallback numérico; nomes editados pelo
  // operador nunca são sobrescritos pela sincronização automática.
  for (const contact of candidates) {
    const phone = cleanPhone(contact.phone);
    const existingLead = existingByContact.get(contact.id) ?? existingByPhone.get(phone);
    const chat = chatsByIdentity.get(`${contact.instance_id}:${phone}`);
    const displayName =
      contact.saved_name?.trim() || contact.push_name?.trim() || chat?.name?.trim();
    if (
      existingLead &&
      displayName &&
      (!existingLead.name?.trim() ||
        existingLead.name.trim() === phoneE164(phone) ||
        existingLead.name.trim() === "Contato WhatsApp")
    ) {
      const { error } = await db
        .from("crm_leads")
        .update({ name: displayName })
        .eq("workspace_id", workspaceId)
        .eq("id", existingLead.id);
      if (error) throw error;
    }
  }

  let imported = 0;
  for (let start = 0; start < rows.length; start += 250) {
    const { data, error } = await db
      .from("crm_leads")
      .insert(rows.slice(start, start + 250) as never[])
      .select("id");
    if (error) {
      // A concurrent webhook may have inserted one of these identities. Keep
      // the sync idempotent and report other database errors to the caller.
      if (String(error.code ?? "") === "23505") continue;
      throw error;
    }
    imported += data?.length ?? 0;
  }

  return { imported, skipped: candidates.length - rows.length };
}

export async function presentCrmLeads(
  workspaceId: string,
  leads: Array<{ contact_id: string | null; chat_id: string | null; source: string }>,
) {
  const db = await client();
  const contactIds = leads.flatMap((lead) => (lead.contact_id ? [lead.contact_id] : []));
  const chatIds = leads.flatMap((lead) => (lead.chat_id ? [lead.chat_id] : []));
  const [contacts, { data: chats }] = await Promise.all([
    contactIds.length ? loadWhatsAppContacts(db, workspaceId, { contactIds }) : Promise.resolve([]),
    chatIds.length
      ? db
          .from("chats")
          .select("id,profile_pic_url")
          .eq("workspace_id", workspaceId)
          .in("id", chatIds)
      : Promise.resolve({ data: [] as Array<{ id: string; profile_pic_url: string | null }> }),
  ]);
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  const chatMap = new Map((chats ?? []).map((chat) => [chat.id, chat]));
  return leads.map((lead): CrmLeadPresentation => {
    const contact = lead.contact_id ? contactMap.get(lead.contact_id) : undefined;
    const chat = lead.chat_id ? chatMap.get(lead.chat_id) : undefined;
    const isSavedContact = Boolean(contact?.is_saved);
    return {
      profilePicUrl: contact?.profile_pic_url || chat?.profile_pic_url || null,
      isSavedContact,
      contactCategory: isSavedContact
        ? "saved_contact"
        : lead.source === "import"
          ? "potential_lead"
          : "manual",
    };
  });
}
