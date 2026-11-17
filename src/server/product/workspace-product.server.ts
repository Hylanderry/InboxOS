import { fetchCredentialed } from "../security/credentialed-fetch";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LiveAuthDatabase } from "@/server/auth/live-auth-database";
import { z } from "zod";
import { requirePermission } from "@/server/middleware/auth";
import { roleHasPermission } from "@/server/middleware/auth-policy";
import { evolutionFetch, persistMessage } from "@/lib/evolution.server";
import {
  buildMessageDestination,
  type MessageIdentityKind,
} from "@/server/evolution/message-destination";
import { cleanPhone, isValidPhone } from "@/lib/conversationKey";
import {
  buildAgentInstructions,
  buildAgentConversationPrompt,
  redactPiiText,
  normalizeAgentRuntimeConfig,
  readAgentRuntimeConfig,
  shouldRequestHumanHandover,
  type AgentFollowUpContext,
  type AgentKnowledgeContext,
} from "@/server/product/agent-personalization";
import {
  presentCrmLeads,
  syncCrmLeadsFromWhatsApp,
} from "@/server/product/crm-contact-sync.server";
import { groqGuard } from "@/server/product/groq-guard";
import { estimateTypingDelayMs, splitNaturalMessage } from "@/server/product/message-chunking";
import { sendWhatsAppPresence } from "@/lib/evolution.server";
import { extractCalendarDirective } from "@/server/product/calendar-agent-action";
import { applyAgentCalendarDirective } from "@/server/product/calendar-clients.server";
import { logServerError, logServerWarning } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function errorMessage(error: unknown, fallback: string) {
  return safePublicError(error, fallback);
}

function messageIdentityKind(value: string | null, isGroup: boolean): MessageIdentityKind {
  if (value === "phone" || value === "lid" || value === "group" || value === "broadcast") {
    return value;
  }
  return isGroup ? "group" : "phone";
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function asIso(value: unknown, field = "date") {
  if (typeof value !== "string") throw new Error(`${field} inválida`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} inválida`);
  return date.toISOString();
}

const defaultStages = [
  { name: "Novos", color: "#60a5fa", position: 0, kind: "open" },
  { name: "Qualificação", color: "#a78bfa", position: 1, kind: "open" },
  { name: "Proposta", color: "#f59e0b", position: 2, kind: "open" },
  { name: "Fechado", color: "#22c55e", position: 3, kind: "won" },
  { name: "Perdido", color: "#ef4444", position: 4, kind: "lost" },
] as const;

async function ensureDefaultStages(workspaceId: string) {
  const client = await db();
  const { data, error } = await client
    .from("crm_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (error) throw error;
  if ((data?.length ?? 0) > 0) return;
  const { error: insertError } = await client
    .from("crm_stages")
    .insert(defaultStages.map((stage) => ({ ...stage, workspace_id: workspaceId })));
  if (insertError && String(insertError.code ?? "") !== "23505") throw insertError;
}

export async function getDashboard(request: Request) {
  const auth = await requirePermission(request, "workspace.read");
  if (auth instanceof Response) return auth;
  const client = await db();
  const workspaceId = auth.workspace.id;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const [instances, chats, messages, leads, followups, agents] = await Promise.all([
    client.from("whatsapp_instances").select("status").eq("workspace_id", workspaceId),
    client.from("chats").select("unread,archived").eq("workspace_id", workspaceId),
    client
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", since),
    client.from("crm_leads").select("value_cents,currency").eq("workspace_id", workspaceId),
    client
      .from("follow_up_tasks")
      .select("id,due_at,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    client
      .from("automation_agents")
      .select("id,enabled,reply_mode")
      .eq("workspace_id", workspaceId),
  ]);

  const errors = [
    instances.error,
    chats.error,
    messages.error,
    leads.error,
    followups.error,
    agents.error,
  ].filter(Boolean);
  if (errors.length)
    return json({ error: safePublicError(errors[0], "Falha ao montar dashboard") }, 500);

  const chatRows = chats.data ?? [];
  const leadRows = leads.data ?? [];
  const followRows = followups.data ?? [];
  const pipelineByCurrency = Array.from(
    leadRows.reduce((totals: Map<string, number>, row) => {
      const currency = String(row.currency || "BRL").toUpperCase();
      totals.set(currency, (totals.get(currency) ?? 0) + Number(row.value_cents ?? 0));
      return totals;
    }, new Map<string, number>()),
    ([currency, valueCents]) => ({ currency, valueCents }),
  ).sort((a, b) => a.currency.localeCompare(b.currency));
  return json({
    metrics: {
      connectedInstances: (instances.data ?? []).filter((row) => row.status === "open").length,
      totalInstances: (instances.data ?? []).length,
      activeChats: chatRows.filter((row) => !row.archived).length,
      unread: chatRows.reduce((sum: number, row) => sum + Number(row.unread ?? 0), 0),
      messages24h: messages.count ?? 0,
      crmLeads: leadRows.length,
      pipelineByCurrency,
      pendingFollowUps: followRows.length,
      overdueFollowUps: followRows.filter((row) => row.due_at < now).length,
      enabledAgents: (agents.data ?? []).filter((row) => row.enabled).length,
      automaticAgents: (agents.data ?? []).filter(
        (row) => row.enabled && row.reply_mode === "automatic",
      ).length,
    },
  });
}

type LeadUpdate = Database["public"]["Tables"]["crm_leads"]["Update"];
const leadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  stageId: z.string().uuid().optional(),
  chatId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{7,14}$/)
    .nullable()
    .optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  valueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  source: z.enum(["manual", "inbox", "import", "api"]).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  notes: z.string().max(12000).nullable().optional(),
});

const leadPatchSchema = leadCreateSchema.partial().extend({ id: z.string().uuid() });

type OwnedTable =
  | "crm_stages"
  | "chats"
  | "whatsapp_contacts"
  | "crm_leads"
  | "follow_up_tasks"
  | "whatsapp_instances"
  | "calendar_calendars";

async function ownedRow(
  client: SupabaseClient<Database>,
  table: OwnedTable,
  workspaceId: string,
  id: string,
) {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function validateWorkspaceOwner(
  client: SupabaseClient<Database>,
  workspaceId: string,
  ownerUserId: string | null | undefined,
) {
  if (!ownerUserId) return;
  const { data, error } = await client
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ownerUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Responsável não pertence ao workspace");
}

async function validateLeadRelations(
  client: SupabaseClient<Database>,
  workspaceId: string,
  payload: {
    stageId?: string | undefined;
    chatId?: string | null | undefined;
    contactId?: string | null | undefined;
    ownerUserId?: string | null | undefined;
  },
) {
  if (payload.stageId && !(await ownedRow(client, "crm_stages", workspaceId, payload.stageId)))
    throw new Error("Etapa não pertence ao workspace");
  if (payload.chatId && !(await ownedRow(client, "chats", workspaceId, payload.chatId)))
    throw new Error("Conversa não pertence ao workspace");
  if (
    payload.contactId &&
    !(await ownedRow(client, "whatsapp_contacts", workspaceId, payload.contactId))
  )
    throw new Error("Contato não pertence ao workspace");
  if (payload.ownerUserId !== undefined)
    await validateWorkspaceOwner(client, workspaceId, payload.ownerUserId);
}

export async function listCrm(request: Request) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  const client = await db();
  try {
    await ensureDefaultStages(auth.workspace.id);
    // Mantém o CRM alinhado à agenda/conversas sem exigir uma ação manual.
    // Uma falha transitória na importação não impede a leitura dos leads já salvos.
    try {
      await syncCrmLeadsFromWhatsApp(auth.workspace.id);
    } catch (syncError) {
      logServerWarning("[crm] automatic contact import failed", syncError);
    }
    const [stages, leads] = await Promise.all([
      client
        .from("crm_stages")
        .select("*")
        .eq("workspace_id", auth.workspace.id)
        .order("position")
        .order("created_at"),
      client
        .from("crm_leads")
        .select("*")
        .eq("workspace_id", auth.workspace.id)
        .order("updated_at", { ascending: false }),
    ]);
    if (stages.error || leads.error) throw stages.error ?? leads.error;
    const presentation = await presentCrmLeads(auth.workspace.id, leads.data ?? []);
    return json({
      stages: stages.data ?? [],
      leads: (leads.data ?? []).map((lead, index) => ({
        ...lead,
        ...(presentation[index] ?? {
          profilePicUrl: null,
          isSavedContact: false,
          contactCategory: lead.source === "import" ? "potential_lead" : "manual",
        }),
      })),
      canManage: roleHasPermission(auth.workspace.role, "crm.manage", auth.workspace.permissions),
    });
  } catch (error: unknown) {
    return json({ error: errorMessage(error, "Falha ao carregar CRM") }, 500);
  }
}

export async function createLead(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = leadCreateSchema.parse(body);
    const client = await db();
    await ensureDefaultStages(auth.workspace.id);
    let stageId = payload.stageId;
    if (!stageId) {
      const { data, error } = await client
        .from("crm_stages")
        .select("id")
        .eq("workspace_id", auth.workspace.id)
        .order("position")
        .limit(1)
        .single();
      if (error || !data) throw error ?? new Error("Etapa inicial não encontrada");
      stageId = data.id;
    }
    await validateLeadRelations(client, auth.workspace.id, { ...payload, stageId });
    const { data, error } = await client
      .from("crm_leads")
      .insert({
        workspace_id: auth.workspace.id,
        stage_id: stageId,
        chat_id: payload.chatId ?? null,
        contact_id: payload.contactId ?? null,
        name: payload.name,
        phone_e164: payload.phoneE164 ?? null,
        email: payload.email ?? null,
        company: payload.company ?? null,
        value_cents: payload.valueCents ?? 0,
        currency: payload.currency ?? "BRL",
        source: payload.source ?? "manual",
        owner_user_id: payload.ownerUserId ?? null,
        created_by: auth.user.id,
        notes: payload.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return json({ lead: data }, 201);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return json({ error: "Dados do lead inválidos" }, 400);
    return json({ error: errorMessage(error, "Falha ao criar lead") }, 400);
  }
}

export async function updateLead(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = leadPatchSchema.parse(body);
    const client = await db();
    if (!(await ownedRow(client, "crm_leads", auth.workspace.id, payload.id)))
      return json({ error: "Lead não encontrado" }, 404);
    await validateLeadRelations(client, auth.workspace.id, payload);
    const patch: LeadUpdate = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.stageId !== undefined) patch.stage_id = payload.stageId;
    if (payload.chatId !== undefined) patch.chat_id = payload.chatId;
    if (payload.contactId !== undefined) patch.contact_id = payload.contactId;
    if (payload.phoneE164 !== undefined) patch.phone_e164 = payload.phoneE164;
    if (payload.email !== undefined) patch.email = payload.email;
    if (payload.company !== undefined) patch.company = payload.company;
    if (payload.valueCents !== undefined) patch.value_cents = payload.valueCents;
    if (payload.currency !== undefined) patch.currency = payload.currency;
    if (payload.source !== undefined) patch.source = payload.source;
    if (payload.ownerUserId !== undefined) patch.owner_user_id = payload.ownerUserId;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (Object.keys(patch).length === 0) return json({ error: "Nenhuma alteração informada" }, 400);
    const { data, error } = await client
      .from("crm_leads")
      .update(patch)
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Lead não encontrado" }, 404);
    return json({ lead: data });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return json({ error: "Dados do lead inválidos" }, 400);
    return json({ error: errorMessage(error, "Falha ao atualizar lead") }, 400);
  }
}

export async function deleteLead(request: Request) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json({ error: "id é obrigatório" }, 400);
  const client = await db();
  const { data, error } = await client
    .from("crm_leads")
    .delete()
    .eq("workspace_id", auth.workspace.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: safePublicError(error, "Falha ao excluir lead") }, 400);
  if (!data) return json({ error: "Lead não encontrado" }, 404);
  return json({ success: true });
}

const stageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  position: z.number().int().min(0).max(1000).optional(),
  kind: z.enum(["open", "won", "lost"]).optional(),
});

export async function listStages(request: Request) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  try {
    await ensureDefaultStages(auth.workspace.id);
    const client = await db();
    const { data, error } = await client
      .from("crm_stages")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .order("position");
    if (error) throw error;
    return json({ stages: data ?? [] });
  } catch (error: unknown) {
    return json({ error: errorMessage(error, "Falha ao carregar etapas") }, 500);
  }
}

export async function createStage(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = stageSchema.omit({ id: true }).parse(body);
    const client = await db();
    const { data, error } = await client
      .from("crm_stages")
      .insert({
        workspace_id: auth.workspace.id,
        name: payload.name,
        color: payload.color ?? "#71717a",
        position: payload.position ?? 0,
        kind: payload.kind ?? "open",
      })
      .select("*")
      .single();
    if (error) throw error;
    return json({ stage: data }, 201);
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Etapa inválida"
            : errorMessage(error, "Falha ao criar etapa"),
      },
      400,
    );
  }
}

export async function updateStage(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = stageSchema.partial().extend({ id: z.string().uuid() }).parse(body);
    const patch: Database["public"]["Tables"]["crm_stages"]["Update"] = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.color !== undefined) patch.color = payload.color;
    if (payload.position !== undefined) patch.position = payload.position;
    if (payload.kind !== undefined) patch.kind = payload.kind;
    if (Object.keys(patch).length === 0) return json({ error: "Nenhuma alteração informada" }, 400);
    const client = await db();
    const { data, error } = await client
      .from("crm_stages")
      .update(patch)
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Etapa não encontrada" }, 404);
    return json({ stage: data });
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Etapa inválida"
            : errorMessage(error, "Falha ao atualizar etapa"),
      },
      400,
    );
  }
}

export async function deleteStage(request: Request) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json({ error: "id é obrigatório" }, 400);
  const client = await db();
  const { data, error } = await client
    .from("crm_stages")
    .delete()
    .eq("workspace_id", auth.workspace.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (String(error.code ?? "") === "23503")
      return json({ error: "Não é possível excluir uma etapa em uso" }, 409);
    return json({ error: safePublicError(error, "Falha ao excluir etapa") }, 500);
  }
  if (!data) return json({ error: "Etapa não encontrada" }, 404);
  return json({ success: true });
}

const followSchema = z.object({
  id: z.string().uuid().optional(),
  leadId: z.string().uuid().nullable().optional(),
  chatId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  note: z.string().max(12000).nullable().optional(),
  dueAt: z.string(),
  status: z.enum(["pending", "done", "canceled"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});

export async function listFollowUps(request: Request) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  const client = await db();
  const { data, error } = await client
    .from("follow_up_tasks")
    .select("*")
    .eq("workspace_id", auth.workspace.id)
    .order("due_at");
  if (error) return json({ error: safePublicError(error, "Falha ao carregar follow-ups") }, 500);
  return json({
    tasks: data ?? [],
    canManage: roleHasPermission(auth.workspace.role, "crm.manage", auth.workspace.permissions),
  });
}

async function validateFollowRelations(
  client: SupabaseClient<Database>,
  workspaceId: string,
  payload: {
    leadId?: string | null | undefined;
    chatId?: string | null | undefined;
    ownerUserId?: string | null | undefined;
  },
) {
  if (payload.leadId && !(await ownedRow(client, "crm_leads", workspaceId, payload.leadId)))
    throw new Error("Lead não pertence ao workspace");
  if (payload.chatId && !(await ownedRow(client, "chats", workspaceId, payload.chatId)))
    throw new Error("Conversa não pertence ao workspace");
  if (payload.ownerUserId !== undefined)
    await validateWorkspaceOwner(client, workspaceId, payload.ownerUserId);
}

export async function createFollowUp(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = followSchema.omit({ id: true }).parse(body);
    const client = await db();
    await validateFollowRelations(client, auth.workspace.id, payload);
    const status = payload.status ?? "pending";
    const { data, error } = await client
      .from("follow_up_tasks")
      .insert({
        workspace_id: auth.workspace.id,
        lead_id: payload.leadId ?? null,
        chat_id: payload.chatId ?? null,
        title: payload.title,
        note: payload.note ?? null,
        due_at: asIso(payload.dueAt, "Data do follow-up"),
        status,
        priority: payload.priority ?? "normal",
        owner_user_id: payload.ownerUserId ?? null,
        created_by: auth.user.id,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return json({ task: data }, 201);
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Follow-up inválido"
            : errorMessage(error, "Falha ao criar follow-up"),
      },
      400,
    );
  }
}

export async function updateFollowUp(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = followSchema.partial().extend({ id: z.string().uuid() }).parse(body);
    const client = await db();
    if (!(await ownedRow(client, "follow_up_tasks", auth.workspace.id, payload.id)))
      return json({ error: "Follow-up não encontrado" }, 404);
    await validateFollowRelations(client, auth.workspace.id, payload);
    const patch: Database["public"]["Tables"]["follow_up_tasks"]["Update"] = {};
    if (payload.leadId !== undefined) patch.lead_id = payload.leadId;
    if (payload.chatId !== undefined) patch.chat_id = payload.chatId;
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.note !== undefined) patch.note = payload.note;
    if (payload.dueAt !== undefined) patch.due_at = asIso(payload.dueAt, "Data do follow-up");
    if (payload.priority !== undefined) patch.priority = payload.priority;
    if (payload.ownerUserId !== undefined) patch.owner_user_id = payload.ownerUserId;
    if (payload.status !== undefined) {
      patch.status = payload.status;
      patch.completed_at = payload.status === "done" ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) return json({ error: "Nenhuma alteração informada" }, 400);
    const { data, error } = await client
      .from("follow_up_tasks")
      .update(patch)
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Follow-up não encontrado" }, 404);
    return json({ task: data });
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Follow-up inválido"
            : errorMessage(error, "Falha ao atualizar follow-up"),
      },
      400,
    );
  }
}

export async function deleteFollowUp(request: Request) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json({ error: "id é obrigatório" }, 400);
  const client = await db();
  const { data, error } = await client
    .from("follow_up_tasks")
    .delete()
    .eq("workspace_id", auth.workspace.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: safePublicError(error, "Falha ao excluir follow-up") }, 400);
  if (!data) return json({ error: "Follow-up não encontrado" }, 404);
  return json({ success: true });
}

const agentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  instanceId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  provider: z.enum(["groq", "openrouter"]).optional(),
  model: z.string().trim().max(160).nullable().optional(),
  instructions: z.string().trim().min(1).max(12000).optional(),
  runtimeConfig: z.unknown().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxCompletionTokens: z.number().int().min(64).max(8192).optional(),
  replyMode: z.enum(["manual", "automatic"]).optional(),
  allowGroups: z.boolean().optional(),
});

type AiProvider = "groq" | "openrouter";
type AiProviderOption = {
  provider: AiProvider;
  label: string;
  models: string[];
};

const defaultGroqModel = "llama-3.3-70b-versatile";

function configuredModelList(config: Record<string, unknown>) {
  const configured = config["allowed_models"];
  if (!Array.isArray(configured)) return [];
  return [
    ...new Set(
      configured
        .filter((model): model is string => typeof model === "string" && model.trim().length > 0)
        .map((model) => model.trim())
        .slice(0, 100),
    ),
  ];
}

async function aiProviderOptions(): Promise<AiProviderOption[]> {
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const [groq, openrouter] = await Promise.all([
    resolveManagedIntegration("groq"),
    resolveManagedIntegration("openrouter"),
  ]);
  const options: AiProviderOption[] = [];
  const groqKey = groq.secrets["api_key"] || process.env["GROQ_API_KEY"]?.trim();
  if (!groq.disabled && groqKey) {
    const configured = configuredModelList(groq.config);
    options.push({
      provider: "groq",
      label: "Groq",
      models: configured.length
        ? configured
        : [String(groq.config["model"] || process.env["GROQ_MODEL"] || defaultGroqModel)],
    });
  }
  const openrouterKey = openrouter.secrets["api_key"] || process.env["OPENROUTER_API_KEY"]?.trim();
  const openrouterModels = configuredModelList(openrouter.config);
  if (!openrouter.disabled && openrouterKey && openrouterModels.length) {
    options.push({ provider: "openrouter", label: "OpenRouter", models: openrouterModels });
  }
  return options;
}

async function validateAiSelection(
  provider: AiProvider,
  requestedModel: string | null | undefined,
) {
  const options = await aiProviderOptions();
  const selected = options.find((option) => option.provider === provider);
  if (!selected)
    throw new Error("Provedor de IA indisponível ou não autorizado pelo administrador");
  const model = requestedModel?.trim() || selected.models[0];
  if (!model || !selected.models.includes(model))
    throw new Error("Modelo de IA não está autorizado pelo administrador");
  return { provider, model };
}

type AgentPromptFields =
  | { instructions: string }
  | {
      instructions: string;
      runtime_config: NonNullable<
        Database["public"]["Tables"]["automation_agents"]["Insert"]["runtime_config"]
      >;
    };

function agentPromptFields(payload: {
  instructions?: string | undefined;
  runtimeConfig?: unknown;
}): AgentPromptFields {
  if (payload.runtimeConfig !== undefined) {
    const runtimeConfig = normalizeAgentRuntimeConfig(payload.runtimeConfig);
    return {
      runtime_config: runtimeConfig as unknown as NonNullable<
        Database["public"]["Tables"]["automation_agents"]["Insert"]["runtime_config"]
      >,
      instructions: buildAgentInstructions(runtimeConfig),
    };
  }
  const instructions = payload.instructions?.trim();
  if (!instructions) throw new Error("Objetivo ou instruções do agente são obrigatórios");
  return { instructions };
}

async function workspaceAiPolicy(client: SupabaseClient<Database>, workspaceId: string) {
  const privacyClient = client as unknown as SupabaseClient<LiveAuthDatabase>;
  const { data, error } = await privacyClient
    .from("workspace_privacy_settings")
    .select("ai_enabled,pii_redaction_enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return { available: false, enabled: false, redact: true } as const;
  return {
    available: true,
    enabled: data.ai_enabled === true,
    redact: data.pii_redaction_enabled !== false,
  } as const;
}
async function validateAgentPayload(
  client: SupabaseClient<Database>,
  workspaceId: string,
  payload: {
    instanceId?: string | null | undefined;
    enabled?: boolean | undefined;
    replyMode?: "manual" | "automatic" | undefined;
    runtimeConfig?: unknown;
    provider?: AiProvider | undefined;
    model?: string | null | undefined;
  },
  requireProviderCatalog = false,
) {
  if (
    payload.instanceId &&
    !(await ownedRow(client, "whatsapp_instances", workspaceId, payload.instanceId))
  )
    throw new Error("Conexão não pertence ao workspace");
  const requiresConfiguredProvider = requireProviderCatalog;
  if (payload.enabled && payload.replyMode === "automatic" && !(await aiProviderOptions()).length)
    throw new Error(
      "Configure um provedor de IA autorizado pelo administrador para ativar respostas automáticas",
    );
  if (payload.runtimeConfig !== undefined) {
    const runtimeConfig = readAgentRuntimeConfig(payload.runtimeConfig);
    if (
      runtimeConfig?.calendarId &&
      !(await ownedRow(client, "calendar_calendars", workspaceId, runtimeConfig.calendarId))
    )
      throw new Error("Calendário não pertence ao workspace");
  }
  if (requiresConfiguredProvider)
    return validateAiSelection(payload.provider ?? "groq", payload.model);
  return { provider: "groq" as const, model: defaultGroqModel };
}

export async function listAgents(request: Request) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  const client = await db();
  const [agents, instances, runs] = await Promise.all([
    client
      .from("automation_agents")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .order("created_at"),
    client
      .from("whatsapp_instances")
      .select("id,instance_name,status,phone")
      .eq("workspace_id", auth.workspace.id)
      .eq("status", "open")
      .order("created_at"),
    client
      .from("automation_agent_runs")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .order("started_at", { ascending: false })
      .limit(25),
  ]);
  if (agents.error || instances.error || runs.error)
    return json(
      {
        error:
          (agents.error ?? instances.error ?? runs.error)?.message ?? "Falha ao carregar agentes",
      },
      500,
    );
  const aiOptions = await aiProviderOptions().catch(() => [] as AiProviderOption[]);
  return json({
    agents: agents.data ?? [],
    instances: instances.data ?? [],
    runs: runs.data ?? [],
    groqConfigured: aiOptions.some((option) => option.provider === "groq"),
    aiConfigured: aiOptions.length > 0,
    aiOptions,
  });
}

export async function createAgent(request: Request, body: unknown) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = agentSchema.omit({ id: true }).parse(body);
    const client = await db();
    const aiSelection = await validateAgentPayload(
      client,
      auth.workspace.id,
      payload,
      payload.provider === "openrouter" ||
        Boolean(payload.model?.trim()) ||
        (payload.enabled === true && payload.replyMode === "automatic"),
    );
    const promptFields = agentPromptFields(payload);
    const { data, error } = await client
      .from("automation_agents")
      .insert({
        workspace_id: auth.workspace.id,
        instance_id: payload.instanceId ?? null,
        name: payload.name,
        enabled: payload.enabled ?? false,
        provider: aiSelection.provider,
        model: aiSelection.model,
        ...promptFields,
        temperature: payload.temperature ?? 0.3,
        max_completion_tokens: payload.maxCompletionTokens ?? 700,
        reply_mode: payload.replyMode ?? "manual",
        allow_groups: payload.allowGroups ?? false,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    return json({ agent: data }, 201);
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Agente inválido"
            : errorMessage(error, "Falha ao criar agente"),
      },
      400,
    );
  }
}

export async function updateAgent(request: Request, body: unknown) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = agentSchema.partial().extend({ id: z.string().uuid() }).parse(body);
    const client = await db();
    const { data: current, error: currentError } = await client
      .from("automation_agents")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return json({ error: "Agente não encontrado" }, 404);
    const merged = {
      enabled: payload.enabled ?? current.enabled,
      replyMode: payload.replyMode ?? (current.reply_mode === "automatic" ? "automatic" : "manual"),
      instanceId: payload.instanceId !== undefined ? payload.instanceId : current.instance_id,
      runtimeConfig: payload.runtimeConfig ?? current.runtime_config,
      provider: payload.provider ?? (current.provider === "openrouter" ? "openrouter" : "groq"),
      model: payload.model !== undefined ? payload.model : current.model,
    };
    const aiSelection = await validateAgentPayload(
      client,
      auth.workspace.id,
      merged,
      payload.provider !== undefined ||
        payload.model !== undefined ||
        (merged.enabled === true && merged.replyMode === "automatic"),
    );
    const patch: Database["public"]["Tables"]["automation_agents"]["Update"] = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.instanceId !== undefined) patch.instance_id = payload.instanceId;
    if (payload.enabled !== undefined) patch.enabled = payload.enabled;
    if (payload.provider !== undefined || payload.model !== undefined) {
      patch.provider = aiSelection.provider;
      patch.model = aiSelection.model;
    }
    if (payload.runtimeConfig !== undefined || payload.instructions !== undefined)
      Object.assign(patch, agentPromptFields(payload));
    if (payload.temperature !== undefined) patch.temperature = payload.temperature;
    if (payload.maxCompletionTokens !== undefined)
      patch.max_completion_tokens = payload.maxCompletionTokens;
    if (payload.replyMode !== undefined) patch.reply_mode = payload.replyMode;
    if (payload.allowGroups !== undefined) patch.allow_groups = payload.allowGroups;
    if (Object.keys(patch).length === 0) return json({ error: "Nenhuma alteração informada" }, 400);
    const { data, error } = await client
      .from("automation_agents")
      .update(patch)
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Agente não encontrado" }, 404);
    return json({ agent: data });
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Agente inválido"
            : errorMessage(error, "Falha ao atualizar agente"),
      },
      400,
    );
  }
}

export async function deleteAgent(request: Request) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json({ error: "id é obrigatório" }, 400);
  const client = await db();
  const { data, error } = await client
    .from("automation_agents")
    .delete()
    .eq("workspace_id", auth.workspace.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: safePublicError(error, "Falha ao excluir agente") }, 400);
  if (!data) return json({ error: "Agente não encontrado" }, 404);
  return json({ success: true });
}

type AutomationAgent = Database["public"]["Tables"]["automation_agents"]["Row"];
type GroqResponse = {
  id?: string;
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

async function runAgentModel(agent: AutomationAgent, prompt: string, redactPii = true) {
  const provider: AiProvider = agent.provider === "openrouter" ? "openrouter" : "groq";
  // Revalidate on every runtime call: an administrator may revoke a model after an
  // agent was saved. Cached output also needs the model in its key, otherwise a
  // short-lived cache could return a response generated by a model no longer allowed.
  const selection = await validateAiSelection(provider, agent.model);
  return groqGuard.run(
    `${agent.id}:${selection.provider}:${selection.model}:${prompt}`,
    async () => {
      const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
      const managed = await resolveManagedIntegration(provider);
      if (managed.disabled) throw new Error("Integração desativada no ADM");
      const apiKey =
        managed.secrets["api_key"] ||
        (provider === "openrouter"
          ? process.env["OPENROUTER_API_KEY"]
          : process.env["GROQ_API_KEY"]
        )?.trim();
      if (!apiKey) throw new Error("Provedor de IA não está configurado pelo administrador");
      const response = await fetchCredentialed(
        provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(25_000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(provider === "openrouter" ? { "X-Title": "Workspace automation" } : {}),
          },
          body: JSON.stringify({
            model: selection.model,
            temperature: Math.min(1.2, Math.max(0, Number(agent.temperature ?? 0.3))),
            max_completion_tokens: Math.min(
              1_200,
              Math.max(128, Number(agent.max_completion_tokens ?? 700)),
            ),
            messages: [
              {
                role: "system",
                content: redactPii ? redactPiiText(agent.instructions) : agent.instructions,
              },
              { role: "user", content: prompt },
            ],
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as GroqResponse;
      if (!response.ok)
        throw new Error(String(data?.error?.message ?? `IA HTTP ${response.status}`));
      const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("Provedor de IA retornou resposta vazia");
      return { text, requestId: response.headers.get("x-request-id") ?? data?.id ?? null };
    },
  );
}

export async function testAgent(request: Request, body: unknown) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  const schema = z.object({
    agentId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(12000),
  });
  try {
    const payload = schema.parse(body);
    const client = await db();
    const { data: agent, error } = await client
      .from("automation_agents")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.agentId)
      .maybeSingle();
    if (error) throw error;
    if (!agent) return json({ error: "Agente não encontrado" }, 404);
    const privacyPolicy = await workspaceAiPolicy(client, auth.workspace.id);
    if (!privacyPolicy.available)
      return json(
        { error: "Política de IA indisponível; configure a privacidade do workspace" },
        503,
      );
    if (!privacyPolicy.enabled) return json({ error: "IA desativada neste workspace" }, 409);
    const providerPrompt = privacyPolicy.redact ? redactPiiText(payload.prompt) : payload.prompt;
    const { data: run, error: runError } = await client
      .from("automation_agent_runs")
      .insert({
        workspace_id: auth.workspace.id,
        agent_id: agent.id,
        status: "running",
        input_excerpt: providerPrompt.slice(0, 1000),
      })
      .select("id")
      .single();
    if (runError) throw runError;
    try {
      const result = await runAgentModel(agent, providerPrompt, privacyPolicy.redact);
      await client
        .from("automation_agent_runs")
        .update({
          status: "completed",
          provider_request_id: result.requestId,
          output_excerpt: result.text.slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .eq("workspace_id", auth.workspace.id)
        .eq("agent_id", agent.id);
      return json({ text: result.text });
    } catch (inner: unknown) {
      await client
        .from("automation_agent_runs")
        .update({
          status: "failed",
          error: errorMessage(inner, String(inner)).slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .eq("workspace_id", auth.workspace.id)
        .eq("agent_id", agent.id);
      throw inner;
    }
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Teste inválido"
            : errorMessage(error, "Falha ao testar agente"),
      },
      400,
    );
  }
}

export async function getBilling(request: Request) {
  const auth = await requirePermission(request, "billing.read");
  if (auth instanceof Response) return auth;
  const client = await db();
  const { data, error } = await client
    .from("workspace_billing")
    .select("*")
    .eq("workspace_id", auth.workspace.id)
    .maybeSingle();
  if (error) return json({ error: safePublicError(error, "Falha ao carregar billing") }, 500);
  return json({
    billing: data ?? {
      workspace_id: auth.workspace.id,
      provider: null,
      external_customer_id: null,
      external_subscription_id: null,
      plan_key: null,
      status: "unconfigured",
      current_period_end: null,
      cancel_at_period_end: false,
      metadata: {},
    },
    canManage: auth.workspace.role === "owner",
  });
}

export async function maybeRunAutomaticAgent(input: {
  workspaceId: string;
  instanceId: string;
  chatId: string;
  messageId: string;
  messageText: string;
  remoteJid: string;
  phoneE164?: string | null;
  isGroup: boolean;
  fromMe: boolean;
}) {
  if (input.fromMe || !input.messageText.trim())
    return { handled: false as const, reason: "not-inbound-text" };
  const client = await db();
  const { data: chat } = await client
    .from("chats")
    .select("ai_paused,can_send,identity_kind,phone_e164,remote_jid")
    .eq("workspace_id", input.workspaceId)
    .eq("instance_id", input.instanceId)
    .eq("id", input.chatId)
    .maybeSingle();
  if (!chat || chat.ai_paused || chat.can_send === false)
    return { handled: false as const, reason: "chat-paused" };
  const privacyPolicy = await workspaceAiPolicy(client, input.workspaceId);
  // AI is opt-in per workspace. If the control plane is unavailable, fail
  // closed instead of replying without an explicit tenant policy.
  if (!privacyPolicy.available)
    return { handled: false as const, reason: "privacy-policy-unavailable" };
  if (!privacyPolicy.enabled) return { handled: false as const, reason: "ai-disabled" };
  const { data: agents, error } = await client
    .from("automation_agents")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("enabled", true)
    .eq("reply_mode", "automatic");
  if (error || !agents?.length) return { handled: false as const, reason: "no-agent" };
  const agent =
    agents.find((row) => row.instance_id === input.instanceId) ??
    agents.find((row) => row.instance_id == null);
  if (!agent || (input.isGroup && !agent.allow_groups))
    return { handled: false as const, reason: "scope-mismatch" };
  const runtimeConfig = readAgentRuntimeConfig(agent.runtime_config);
  if (runtimeConfig && shouldRequestHumanHandover(runtimeConfig, input.messageText)) {
    const { error: handoverError } = await client.from("handover_requests").upsert(
      {
        workspace_id: input.workspaceId,
        chat_id: input.chatId,
        instance_id: input.instanceId,
        trigger_message_id: input.messageId,
        status: "queued",
        // Handoff is an escalation: it must surface above normal follow-ups
        // until a human accepts or resolves the request.
        priority: "high",
        reason: "configured_trigger",
      },
      { onConflict: "workspace_id,trigger_message_id", ignoreDuplicates: true },
    );
    if (handoverError) return { handled: false as const, reason: "handover-failed" };
    const { error: pauseError } = await client
      .from("chats")
      .update({ ai_paused: true })
      .eq("workspace_id", input.workspaceId)
      .eq("instance_id", input.instanceId)
      .eq("id", input.chatId);
    if (pauseError) return { handled: false as const, reason: "handover-failed" };
    return { handled: false as const, reason: "human-handover" };
  }
  const { data: existing } = await client
    .from("automation_agent_runs")
    .select("id,status")
    .eq("workspace_id", input.workspaceId)
    .eq("agent_id", agent.id)
    .eq("chat_id", input.chatId)
    .eq("trigger_message_id", input.messageId)
    .maybeSingle();
  if (existing) return { handled: false as const, reason: "duplicate" };
  const { data: run, error: runError } = await client
    .from("automation_agent_runs")
    .insert({
      workspace_id: input.workspaceId,
      agent_id: agent.id,
      chat_id: input.chatId,
      trigger_message_id: input.messageId,
      status: "running",
      input_excerpt: (privacyPolicy.redact
        ? redactPiiText(input.messageText)
        : input.messageText
      ).slice(0, 1000),
    })
    .select("id")
    .single();
  if (runError) {
    if (String(runError.code ?? "") === "23505")
      return { handled: false as const, reason: "duplicate" };
    return { handled: false as const, reason: "run-insert-failed" };
  }
  let activePresence: { instanceName: string; phone: string; isGroup: boolean } | null = null;
  try {
    const [{ data: recentMessages }, { data: relatedLeads }] = await Promise.all([
      client
        .from("messages")
        .select("id,sender,text,created_at")
        .eq("workspace_id", input.workspaceId)
        .eq("instance_id", input.instanceId)
        .eq("chat_id", input.chatId)
        .not("text", "is", null)
        .order("created_at", { ascending: false })
        .limit(20),
      client
        .from("crm_leads")
        .select("id,name,phone_e164")
        .eq("workspace_id", input.workspaceId)
        .eq("chat_id", input.chatId)
        .limit(10),
    ]);
    const leadIds = (relatedLeads ?? []).map((lead) => lead.id);
    const followUpQueries =
      runtimeConfig?.includeFollowUps === false
        ? []
        : [
            client
              .from("follow_up_tasks")
              .select("id,title,note,due_at,priority,lead_id")
              .eq("workspace_id", input.workspaceId)
              .eq("chat_id", input.chatId)
              .eq("status", "pending")
              .order("due_at")
              .limit(10),
            ...(leadIds.length
              ? [
                  client
                    .from("follow_up_tasks")
                    .select("id,title,note,due_at,priority,lead_id")
                    .eq("workspace_id", input.workspaceId)
                    .in("lead_id", leadIds)
                    .eq("status", "pending")
                    .order("due_at")
                    .limit(10),
                ]
              : []),
          ];
    const followUpResults = await Promise.all(followUpQueries);
    const leadById = new Map((relatedLeads ?? []).map((lead) => [lead.id, lead]));
    const followUps = [
      ...new Map(
        followUpResults
          .flatMap((result) => result.data ?? [])
          .map((task) => [task.id, task] as const),
      ).values(),
    ].map<AgentFollowUpContext>((task) => {
      const lead = task.lead_id ? leadById.get(task.lead_id) : undefined;
      return {
        title: task.title,
        note: task.note,
        dueAt: task.due_at,
        priority: task.priority,
        leadName: lead?.name,
        leadPhone: lead?.phone_e164,
      };
    });
    const lead = relatedLeads?.[0] ?? null;
    const calendarReadAllowed =
      runtimeConfig?.calendarEnabled === true &&
      (runtimeConfig.calendarPermissions.length === 0 ||
        runtimeConfig.calendarPermissions.includes("read"));
    const calendarContextQuery =
      calendarReadAllowed && lead
        ? (async () => {
            let query = client
              .from("calendar_appointments")
              .select("id,title,starts_at")
              .eq("workspace_id", input.workspaceId)
              .eq("lead_id", lead.id)
              .in("status", ["scheduled", "confirmed"])
              .gte("starts_at", new Date().toISOString())
              .order("starts_at")
              .limit(1);
            if (runtimeConfig.calendarId) query = query.eq("calendar_id", runtimeConfig.calendarId);
            return query.maybeSingle();
          })()
        : Promise.resolve({ data: null, error: null });
    const [tagLinks, nextAppointment] = runtimeConfig
      ? await Promise.all([
          runtimeConfig.includeClientTags && lead
            ? client
                .from("crm_lead_tags")
                .select("tag_id")
                .eq("workspace_id", input.workspaceId)
                .eq("lead_id", lead.id)
                .limit(20)
            : Promise.resolve({ data: [], error: null }),
          calendarContextQuery,
        ])
      : [
          { data: [], error: null },
          { data: null, error: null },
        ];
    if (tagLinks.error) throw tagLinks.error;
    if (nextAppointment.error) throw nextAppointment.error;
    const tagIds = (tagLinks.data ?? [])
      .map((row) => row.tag_id)
      .filter((id): id is string => typeof id === "string");
    const { data: clientTags, error: clientTagsError } = tagIds.length
      ? await client
          .from("crm_tags")
          .select("id,name")
          .eq("workspace_id", input.workspaceId)
          .in("id", tagIds)
      : { data: [], error: null };
    if (clientTagsError) throw clientTagsError;
    const clientContext = {
      clientName: lead?.name ?? null,
      tags: (clientTags ?? [])
        .map((row) => row.name)
        .filter((name: unknown): name is string => typeof name === "string")
        .slice(0, 20),
      nextAppointment: nextAppointment.data
        ? {
            id: nextAppointment.data.id,
            title: nextAppointment.data.title,
            startsAt: nextAppointment.data.starts_at,
          }
        : null,
    };
    const knowledgeClient = client as unknown as SupabaseClient<LiveAuthDatabase>;
    const knowledgeResult = runtimeConfig?.includeKnowledgeBase
      ? await knowledgeClient
          .from("workspace_knowledge_documents")
          .select("title,content")
          .eq("workspace_id", input.workspaceId)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(8)
      : { data: [], error: null };
    if (knowledgeResult.error) throw knowledgeResult.error;
    const knowledge = (knowledgeResult.data ?? [])
      .map<AgentKnowledgeContext>((document) => ({
        title: redactPiiText(document.title),
        content: redactPiiText(document.content),
      }))
      .filter((document) => document.title.trim() && document.content.trim());
    const prompt = buildAgentConversationPrompt(
      input.messageText,
      (recentMessages ?? [])
        .filter((message) => message.id !== input.messageId)
        .reverse()
        .map((message) => ({
          sender: String(message.sender ?? "client"),
          text: String(message.text ?? ""),
        })),
      followUps,
      clientContext,
      knowledge,
    );
    const target = buildMessageDestination({
      remoteJid: chat.remote_jid || input.remoteJid,
      phoneE164: chat.phone_e164 || input.phoneE164 || cleanPhone(input.remoteJid),
      identityKind: messageIdentityKind(chat.identity_kind, input.isGroup),
    });
    const canonicalPhone = cleanPhone(chat.phone_e164 || input.phoneE164 || target);
    if (!input.isGroup && !isValidPhone(canonicalPhone))
      throw new Error("Telefone canônico não resolvido para resposta automática");
    const { data: instance } = await client
      .from("whatsapp_instances")
      .select("instance_name,status")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.instanceId)
      .maybeSingle();
    if (!instance || instance.status !== "open")
      throw new Error("Conexão indisponível para resposta automática");

    const presencePhone = input.isGroup ? cleanPhone(target) : canonicalPhone;
    let presenceStarted = false;
    if (presencePhone) {
      presenceStarted = await sendWhatsAppPresence(
        instance.instance_name,
        presencePhone,
        "composing",
        input.isGroup,
        input.workspaceId,
      );
      if (presenceStarted)
        activePresence = {
          instanceName: instance.instance_name,
          phone: presencePhone,
          isGroup: input.isGroup,
        };
    }
    const providerPrompt = privacyPolicy.redact ? redactPiiText(prompt) : prompt;
    const result = await runAgentModel(agent, providerPrompt, privacyPolicy.redact);
    const directiveResult = extractCalendarDirective(result.text);
    let responseText = directiveResult.text;
    if (directiveResult.directive && runtimeConfig?.calendarEnabled) {
      try {
        const action = await applyAgentCalendarDirective({
          dbClient: client,
          workspaceId: input.workspaceId,
          agentId: agent.id,
          chatId: input.chatId,
          leadId: lead?.id ?? null,
          defaultCalendarId: runtimeConfig.calendarId,
          permissions: runtimeConfig.calendarPermissions,
          directive: directiveResult.directive,
        });
        if (!action.ok)
          responseText =
            `${responseText}\n\nNão consegui concluir essa alteração de agenda agora.`.trim();
      } catch (directiveError: unknown) {
        logServerError("[agent-calendar] directive failed", directiveError);
        responseText =
          `${responseText}\n\nNão consegui concluir essa alteração de agenda agora.`.trim();
      }
    }
    if (!responseText) throw new Error("Resposta automática vazia após normalização");
    await new Promise((resolve) => setTimeout(resolve, estimateTypingDelayMs(responseText)));
    if (presenceStarted) {
      await sendWhatsAppPresence(
        instance.instance_name,
        presencePhone,
        "paused",
        input.isGroup,
        input.workspaceId,
      );
      activePresence = null;
    }

    const chunks = splitNaturalMessage(responseText, 900);
    if (!chunks.length) throw new Error("Resposta automática vazia após normalização");
    for (const chunk of chunks) {
      const clientMessageId = crypto.randomUUID();
      const { data: outbox, error: outboxError } = await client
        .from("outbound_messages")
        .insert({
          workspace_id: input.workspaceId,
          instance_id: input.instanceId,
          chat_id: input.chatId,
          client_message_id: clientMessageId,
          remote_jid: target,
          payload: { kind: "text", source: "automation_agent", agentId: agent.id, runId: run.id },
          status: "sending",
          attempts: 1,
          last_error: null,
        })
        .select("id")
        .single();
      if (outboxError || !outbox)
        throw outboxError ?? new Error("Falha ao registrar resposta automática");

      const sent = await evolutionFetch<{ key?: { id?: string | null } }>(
        `/message/sendText/${encodeURIComponent(instance.instance_name)}`,
        { method: "POST", body: { number: target, text: chunk } },
      );
      if (!sent.ok) {
        const deliveryUnknown = sent.status === 0;
        await client
          .from("outbound_messages")
          .update({
            status: deliveryUnknown ? "unknown" : "failed",
            last_error: errorMessage(sent.error, "Evolution recusou resposta automática"),
          })
          .eq("id", outbox.id)
          .eq("workspace_id", input.workspaceId)
          .eq("instance_id", input.instanceId);
        throw new Error(
          deliveryUnknown
            ? "A resposta automática pode ter sido aceita, mas a confirmação expirou"
            : errorMessage(sent.error, "Evolution recusou resposta automática"),
        );
      }

      const externalId = sent.data?.key?.id ?? null;
      await client
        .from("outbound_messages")
        .update({
          status: "accepted",
          external_id: externalId,
          accepted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", outbox.id)
        .eq("workspace_id", input.workspaceId)
        .eq("instance_id", input.instanceId);

      const persisted = await persistMessage({
        workspaceId: input.workspaceId,
        clientMessageId,
        instanceName: instance.instance_name,
        phone: input.isGroup ? cleanPhone(target) : canonicalPhone,
        isGroup: input.isGroup,
        sender: "agent",
        type: "text",
        text: chunk,
        externalId,
        remoteJid: target,
        identityKind: input.isGroup ? "group" : chat.identity_kind === "lid" ? "lid" : "phone",
      });
      if (persisted && "error" in persisted && persisted.error) {
        throw new Error("Resposta enviada, mas falhou ao persistir a mensagem");
      }
    }

    await client
      .from("automation_agent_runs")
      .update({
        status: "completed",
        provider_request_id: result.requestId,
        output_excerpt: responseText.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("workspace_id", input.workspaceId)
      .eq("agent_id", agent.id)
      .eq("chat_id", input.chatId);
    return { handled: true as const, text: responseText };
  } catch (error: unknown) {
    if (activePresence) {
      await sendWhatsAppPresence(
        activePresence.instanceName,
        activePresence.phone,
        "paused",
        activePresence.isGroup,
        input.workspaceId,
      ).catch(() => undefined);
    }
    await client
      .from("automation_agent_runs")
      .update({
        status: "failed",
        error: errorMessage(error, String(error)).slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("workspace_id", input.workspaceId)
      .eq("agent_id", agent.id)
      .eq("chat_id", input.chatId);
    return { handled: false as const, reason: "failed" };
  }
}
