import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { requirePermission } from "@/server/middleware/auth";
import { roleHasPermission } from "@/server/middleware/auth-policy";
import {
  presentCrmLeads,
  syncCrmLeadsFromWhatsApp,
} from "@/server/product/crm-contact-sync.server";
import {
  appointmentFitsCapacity,
  appointmentOverlaps,
  countBookedAppointments,
} from "@/server/product/appointment-rules";
import type { CalendarAgentDirective } from "@/server/product/calendar-agent-action";
import { hasAgentCalendarPermission } from "@/server/product/agent-personalization";
import { logServerError, logServerWarning } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

type AnyDb = SupabaseClient<Database>;
type CalendarRow = Database["public"]["Tables"]["calendar_calendars"]["Row"];
type AppointmentRow = Database["public"]["Tables"]["calendar_appointments"]["Row"];
type TagRow = Database["public"]["Tables"]["crm_tags"]["Row"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown, fallback: string) {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown })["message"] ?? "")
      : error instanceof Error
        ? error.message
        : "";
  if (raw.toLowerCase().includes("calendar_appointment_overlap")) return raw;
  return safePublicError(error, fallback);
}

async function db(): Promise<AnyDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyDb;
}

function iso(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} inválida`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} inválida`);
  return date.toISOString();
}

const availabilitySchema = z.record(
  z.string(),
  z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])),
);

const calendarSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(3).max(80),
  slotDurationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(240),
  dailyCapacity: z.number().int().min(1).max(500),
  availability: availabilitySchema,
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

const appointmentSchema = z.object({
  id: z.string().uuid().optional(),
  calendarId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  chatId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(12000).nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["scheduled", "confirmed", "completed", "canceled", "no_show"]).optional(),
  source: z.enum(["manual", "agent", "follow_up", "import"]).optional(),
});

async function owned(
  dbClient: AnyDb,
  table: "crm_leads" | "chats" | "automation_agents",
  workspaceId: string,
  id: string,
) {
  const { data, error } = await dbClient
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function weekdayKey(date: Date, timezone: string) {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone })
    .format(date)
    .toLowerCase();
  return day.slice(0, 3);
}

function minutesInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timezoneOffsetMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = raw.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "-" ? -1 : 1) * minutes;
}

function calendarDayBounds(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  const offset = timezoneOffsetMinutes(new Date(localMidnightUtc), timezone);
  const start = new Date(localMidnightUtc - offset * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

function availabilityAllows(calendar: CalendarRow, startsAt: string, endsAt: string) {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const availability =
      calendar.availability &&
      typeof calendar.availability === "object" &&
      !Array.isArray(calendar.availability)
        ? (calendar.availability as Record<string, Array<[string, string]>>)
        : {};
    const ranges = availability[weekdayKey(start, calendar.timezone)] ?? [];
    const startMinute = minutesInTimezone(start, calendar.timezone);
    const endMinute = minutesInTimezone(end, calendar.timezone);
    return ranges.some((range: [string, string]) => {
      const [rangeStart, rangeEnd] = range.map((value) => {
        const [hour, minute] = value.split(":").map(Number);
        return (hour ?? 0) * 60 + (minute ?? 0);
      });
      return startMinute >= (rangeStart ?? 0) && endMinute <= (rangeEnd ?? 0);
    });
  } catch {
    return false;
  }
}

async function validateAppointment(
  dbClient: AnyDb,
  workspaceId: string,
  payload: z.infer<typeof appointmentSchema>,
) {
  const startsAt = iso(payload.startsAt, "Início");
  const endsAt = iso(payload.endsAt, "Fim");
  if (Date.parse(endsAt) <= Date.parse(startsAt))
    throw new Error("O fim deve ser depois do início");
  const { data: calendar, error: calendarError } = await dbClient
    .from("calendar_calendars")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", payload.calendarId)
    .maybeSingle();
  if (calendarError) throw calendarError;
  if (!calendar) throw new Error("Calendário não pertence ao workspace");
  if (!calendar.active) throw new Error("Calendário inativo");
  if (!availabilityAllows(calendar, startsAt, endsAt))
    throw new Error("Horário fora da disponibilidade do calendário");
  if (payload.leadId && !(await owned(dbClient, "crm_leads", workspaceId, payload.leadId)))
    throw new Error("Cliente não pertence ao workspace");
  if (payload.chatId && !(await owned(dbClient, "chats", workspaceId, payload.chatId)))
    throw new Error("Conversa não pertence ao workspace");
  if (
    payload.agentId &&
    !(await owned(dbClient, "automation_agents", workspaceId, payload.agentId))
  )
    throw new Error("Agente não pertence ao workspace");

  const { start: dayStart, end: dayEnd } = calendarDayBounds(new Date(startsAt), calendar.timezone);
  const { data: existing, error: existingError } = await dbClient
    .from("calendar_appointments")
    .select("id,status,starts_at,ends_at")
    .eq("workspace_id", workspaceId)
    .eq("calendar_id", payload.calendarId)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());
  if (existingError) throw existingError;
  const active = (existing ?? [])
    .filter((item) => item.id !== payload.id && ["scheduled", "confirmed"].includes(item.status))
    .map((item) => ({ status: item.status, startsAt: item.starts_at, endsAt: item.ends_at }));
  if ((payload.status ?? "scheduled") !== "canceled") {
    if (!appointmentFitsCapacity(active, calendar.daily_capacity))
      throw new Error("A capacidade diária deste calendário foi atingida");
    if (
      active.some((item) =>
        appointmentOverlaps(item, { startsAt, endsAt }, calendar.buffer_minutes),
      )
    )
      throw new Error("Já existe um agendamento nesse intervalo");
  }
  return { startsAt, endsAt };
}

export async function listCalendar(request: Request) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  try {
    const client = await db();
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const calendarsResult = await client
      .from("calendar_calendars")
      .select("*")
      .eq("workspace_id", auth.workspace.id)
      .order("is_default", { ascending: false })
      .order("name");
    if (calendarsResult.error) throw calendarsResult.error;
    const calendarIds = (calendarsResult.data ?? []).map((calendar) => calendar.id);
    let appointments: AppointmentRow[] = [];
    if (calendarIds.length) {
      let query = client
        .from("calendar_appointments")
        .select("*")
        .eq("workspace_id", auth.workspace.id)
        .in("calendar_id", calendarIds)
        .order("starts_at");
      if (from) query = query.gte("starts_at", iso(from, "Data inicial"));
      if (to) query = query.lte("starts_at", iso(to, "Data final"));
      const result = await query;
      if (result.error) throw result.error;
      appointments = result.data ?? [];
    }
    const leadIds = [
      ...new Set(
        appointments
          .map((item) => item.lead_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const agentIds = [
      ...new Set(
        appointments
          .map((item) => item.agent_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const [leads, agents] = await Promise.all([
      leadIds.length
        ? client.from("crm_leads").select("id,name,phone_e164,contact_id,chat_id").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
      agentIds.length
        ? client.from("automation_agents").select("id,name").in("id", agentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (leads.error) throw leads.error;
    if (agents.error) throw agents.error;
    const leadMap = new Map((leads.data ?? []).map((lead) => [lead.id, lead]));
    const agentMap = new Map((agents.data ?? []).map((agent) => [agent.id, agent]));
    const contactIds = (leads.data ?? [])
      .map((lead) => lead.contact_id)
      .filter((id): id is string => typeof id === "string");
    const chatIds = (leads.data ?? [])
      .map((lead) => lead.chat_id)
      .filter((id): id is string => typeof id === "string");
    const [contacts, chats] = await Promise.all([
      contactIds.length
        ? client
            .from("whatsapp_contacts")
            .select("id,profile_pic_url")
            .eq("workspace_id", auth.workspace.id)
            .in("id", contactIds)
        : Promise.resolve({ data: [], error: null }),
      chatIds.length
        ? client
            .from("chats")
            .select("id,profile_pic_url")
            .eq("workspace_id", auth.workspace.id)
            .in("id", chatIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (contacts.error) throw contacts.error;
    if (chats.error) throw chats.error;
    const contactPictures = new Map(
      (contacts.data ?? []).map((contact) => [contact.id, contact.profile_pic_url]),
    );
    const chatPictures = new Map((chats.data ?? []).map((chat) => [chat.id, chat.profile_pic_url]));
    return json({
      calendars: calendarsResult.data ?? [],
      appointments: appointments.map((item) => ({
        ...item,
        lead: item.lead_id
          ? {
              ...(leadMap.get(item.lead_id) ?? {}),
              profile_pic_url:
                (leadMap.get(item.lead_id)?.contact_id
                  ? contactPictures.get(leadMap.get(item.lead_id)!.contact_id!)
                  : null) ??
                (leadMap.get(item.lead_id)?.chat_id
                  ? chatPictures.get(leadMap.get(item.lead_id)!.chat_id!)
                  : null) ??
                null,
            }
          : null,
        agent: item.agent_id ? (agentMap.get(item.agent_id) ?? null) : null,
      })),
      canManage: roleHasPermission(auth.workspace.role, "crm.manage", auth.workspace.permissions),
    });
  } catch (error: unknown) {
    logServerError("[calendar] list failed", error);
    return json({ error: errorMessage(error, "Falha ao carregar calendário") }, 500);
  }
}

export async function mutateCalendar(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = calendarSchema.parse(body);
    const client = await db();
    if (payload.isDefault) {
      await client
        .from("calendar_calendars")
        .update({ is_default: false })
        .eq("workspace_id", auth.workspace.id);
    }
    const row = {
      workspace_id: auth.workspace.id,
      name: payload.name,
      timezone: payload.timezone,
      slot_duration_minutes: payload.slotDurationMinutes,
      buffer_minutes: payload.bufferMinutes,
      daily_capacity: payload.dailyCapacity,
      availability: payload.availability,
      is_default: payload.isDefault ?? false,
      active: payload.active ?? true,
    };
    const result = payload.id
      ? await client
          .from("calendar_calendars")
          .update(row)
          .eq("workspace_id", auth.workspace.id)
          .eq("id", payload.id)
          .select("*")
          .single()
      : await client
          .from("calendar_calendars")
          .insert({ ...row, created_by: auth.user.id })
          .select("*")
          .single();
    if (result.error) throw result.error;
    return json({ calendar: result.data });
  } catch (error: unknown) {
    logServerError("[calendar] mutation failed", error);
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Calendário inválido"
            : errorMessage(error, "Falha ao salvar calendário"),
      },
      400,
    );
  }
}

export async function mutateAppointment(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = appointmentSchema.parse(body);
    const client = await db();
    const window = await validateAppointment(client, auth.workspace.id, payload);
    const row = {
      workspace_id: auth.workspace.id,
      calendar_id: payload.calendarId,
      lead_id: payload.leadId ?? null,
      chat_id: payload.chatId ?? null,
      agent_id: payload.agentId ?? null,
      title: payload.title,
      notes: payload.notes ?? null,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      status: payload.status ?? "scheduled",
      source: payload.source ?? "manual",
    };
    const result = payload.id
      ? await client
          .from("calendar_appointments")
          .update(row)
          .eq("workspace_id", auth.workspace.id)
          .eq("id", payload.id)
          .select("*")
          .single()
      : await client
          .from("calendar_appointments")
          .insert({ ...row, created_by: auth.user.id })
          .select("*")
          .single();
    if (result.error) throw result.error;
    return json({ appointment: result.data });
  } catch (error: unknown) {
    logServerError("[calendar] appointment mutation failed", error);
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Agendamento inválido"
            : errorMessage(error, "").includes("calendar_appointment_overlap")
              ? "Já existe um agendamento nesse intervalo"
              : errorMessage(error, "Falha ao salvar agendamento"),
      },
      400,
    );
  }
}

export async function deleteAppointment(request: Request) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return json({ error: "id é obrigatório" }, 400);
    const client = await db();
    const { data, error } = await client
      .from("calendar_appointments")
      .update({ status: "canceled" })
      .eq("workspace_id", auth.workspace.id)
      .eq("id", id)
      .select("id,status")
      .maybeSingle();
    if (error) return json({ error: safePublicError(error, "Falha ao cancelar agendamento") }, 400);
    if (!data) return json({ error: "Agendamento não encontrado" }, 404);
    return json({ success: true, appointment: data });
  } catch (error: unknown) {
    logServerError("[calendar] appointment cancellation failed", error);
    return json({ error: errorMessage(error, "Falha ao cancelar agendamento") }, 500);
  }
}

export async function listClients(request: Request) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  try {
    const shouldSync = new URL(request.url).searchParams.get("sync") !== "0";
    let syncWarning: string | undefined;
    if (shouldSync) {
      try {
        await syncCrmLeadsFromWhatsApp(auth.workspace.id);
      } catch (syncError) {
        logServerWarning("[clients] whatsapp sync unavailable; serving cached CRM", syncError);
        syncWarning = "A sincronização do WhatsApp falhou; exibindo os clientes já salvos.";
      }
    }
    const client = await db();
    const query =
      new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("pt-BR") ?? "";
    const [
      { data: leads, error: leadsError },
      { data: tags, error: tagsError },
      { data: links, error: linksError },
    ] = await Promise.all([
      client
        .from("crm_leads")
        .select("*")
        .eq("workspace_id", auth.workspace.id)
        .order("updated_at", { ascending: false })
        .limit(1000),
      client.from("crm_tags").select("*").eq("workspace_id", auth.workspace.id).order("name"),
      client.from("crm_lead_tags").select("lead_id,tag_id").eq("workspace_id", auth.workspace.id),
    ]);
    if (leadsError) throw leadsError;
    if (tagsError) throw tagsError;
    if (linksError) throw linksError;
    const presentation = await presentCrmLeads(auth.workspace.id, leads ?? []);
    const tagMap = new Map((tags ?? []).map((tag) => [tag.id, tag]));
    const tagsByLead = new Map<string, TagRow[]>();
    for (const link of links ?? []) {
      const tag = tagMap.get(link.tag_id);
      if (tag) tagsByLead.set(link.lead_id, [...(tagsByLead.get(link.lead_id) ?? []), tag]);
    }
    const clients = (leads ?? [])
      .map((lead, index) => ({
        ...lead,
        ...(presentation[index] ?? {
          profilePicUrl: null,
          isSavedContact: false,
          contactCategory: lead.source === "import" ? "potential_lead" : "manual",
        }),
        tags: tagsByLead.get(lead.id) ?? [],
      }))
      .filter(
        (lead) =>
          !query ||
          [lead.name, lead.phone_e164, lead.email, lead.company].some((value) =>
            String(value ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(query),
          ),
      );
    return json({
      clients,
      tags: tags ?? [],
      canManage: roleHasPermission(auth.workspace.role, "crm.manage", auth.workspace.permissions),
      ...(syncWarning ? { syncWarning } : {}),
    });
  } catch (error: unknown) {
    logServerError("[clients] list failed", error);
    return json({ error: errorMessage(error, "Falha ao carregar clientes") }, 500);
  }
}

// F1: Unified client timeline — aggregates messages, CRM events, follow-ups and appointments
export async function getClientTimeline(request: Request, leadId: string) {
  const auth = await requirePermission(request, "crm.read");
  if (auth instanceof Response) return auth;
  try {
    const client = await db();
    const [leadResult, messagesResult, followUpsResult, appointmentsResult] = await Promise.all([
      client
        .from("crm_leads")
        .select("id,chat_id,phone_e164,name")
        .eq("workspace_id", auth.workspace.id)
        .eq("id", leadId)
        .maybeSingle(),
      // Messages from the chat linked to this lead (last 90 days, max 200)
      client
        .from("messages")
        .select("id,sender,sender_name,text,type,created_at")
        .eq("workspace_id", auth.workspace.id)
        .in(
          "chat_id",
          // Subquery: find chat_id from lead
          (
            await client
              .from("crm_leads")
              .select("chat_id")
              .eq("workspace_id", auth.workspace.id)
              .eq("id", leadId)
              .not("chat_id", "is", null)
          ).data?.map((r) => r.chat_id) ?? [],
        )
        .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      client
        .from("follow_up_tasks")
        .select("id,title,status,due_at,completed_at,created_at")
        .eq("workspace_id", auth.workspace.id)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50),
      client
        .from("calendar_appointments")
        .select("id,title,status,starts_at,ends_at,created_at")
        .eq("workspace_id", auth.workspace.id)
        .eq("lead_id", leadId)
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);
    if (leadResult.error) throw leadResult.error;
    if (!leadResult.data) {
      return json({ error: "Cliente não encontrado" }, 404);
    }
    if (messagesResult.error) throw messagesResult.error;
    if (followUpsResult.error) throw followUpsResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;

    type TimelineEvent = {
      id: string;
      kind: "message" | "follow_up" | "appointment";
      title: string;
      description: string | null;
      timestamp: string;
      meta?: Record<string, unknown>;
    };

    const events: TimelineEvent[] = [];

    for (const msg of messagesResult.data ?? []) {
      events.push({
        id: msg.id,
        kind: "message",
        title: msg.sender === "agent" ? "Mensagem enviada" : "Mensagem recebida",
        description: msg.text ? msg.text.slice(0, 200) : null,
        timestamp: msg.created_at,
        meta: { sender: msg.sender, type: msg.type },
      });
    }

    for (const fu of followUpsResult.data ?? []) {
      events.push({
        id: fu.id,
        kind: "follow_up",
        title: fu.title || "Follow-up",
        description: `Status: ${fu.status}${fu.due_at ? ` · Vence: ${new Date(fu.due_at).toLocaleDateString("pt-BR")}` : ""}`,
        timestamp: fu.created_at,
        meta: { status: fu.status, due_at: fu.due_at },
      });
    }

    for (const appt of appointmentsResult.data ?? []) {
      events.push({
        id: appt.id,
        kind: "appointment",
        title: appt.title || "Agendamento",
        description: `${appt.status} · ${new Date(appt.starts_at).toLocaleString("pt-BR")}`,
        timestamp: appt.starts_at,
        meta: { status: appt.status },
      });
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return json({
      lead: { id: leadResult.data.id, name: leadResult.data.name, phone_e164: leadResult.data.phone_e164 },
      events,
    });
  } catch (error: unknown) {
    logServerError("[clients] timeline failed", error);
    return json({ error: errorMessage(error, "Falha ao carregar timeline do cliente") }, 500);
  }
}

const tagSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#71717a"),
});

export async function mutateTag(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = tagSchema.parse(body);
    const client = await db();
    const result = payload.id
      ? await client
          .from("crm_tags")
          .update({ name: payload.name, color: payload.color })
          .eq("workspace_id", auth.workspace.id)
          .eq("id", payload.id)
          .select("*")
          .single()
      : await client
          .from("crm_tags")
          .insert({
            workspace_id: auth.workspace.id,
            name: payload.name,
            color: payload.color,
            created_by: auth.user.id,
          })
          .select("*")
          .single();
    if (result.error) throw result.error;
    return json({ tag: result.data });
  } catch (error: unknown) {
    logServerError("[clients] tag mutation failed", error);
    return json(
      {
        error:
          error instanceof z.ZodError ? "Tag inválida" : errorMessage(error, "Falha ao salvar tag"),
      },
      400,
    );
  }
}

export async function assignTags(request: Request, body: unknown) {
  const auth = await requirePermission(request, "crm.manage");
  if (auth instanceof Response) return auth;
  const schema = z.object({
    leadIds: z.array(z.string().uuid()).min(1).max(500),
    tagIds: z.array(z.string().uuid()).max(50),
  });
  try {
    const payload = schema.parse(body);
    const client = await db();
    const [{ data: leads, error: leadsError }, { data: tags, error: tagsError }] =
      await Promise.all([
        client
          .from("crm_leads")
          .select("id")
          .eq("workspace_id", auth.workspace.id)
          .in("id", payload.leadIds),
        client
          .from("crm_tags")
          .select("id")
          .eq("workspace_id", auth.workspace.id)
          .in("id", payload.tagIds),
      ]);
    if (leadsError) throw leadsError;
    if (tagsError) throw tagsError;
    if (
      (leads ?? []).length !== payload.leadIds.length ||
      (tags ?? []).length !== payload.tagIds.length
    )
      return json({ error: "Cliente ou tag não pertence ao workspace" }, 403);
    const rows = payload.leadIds.flatMap((leadId) =>
      payload.tagIds.map((tagId) => ({
        workspace_id: auth.workspace.id,
        lead_id: leadId,
        tag_id: tagId,
      })),
    );
    if (rows.length) {
      const { error } = await client
        .from("crm_lead_tags")
        .upsert(rows, { onConflict: "workspace_id,lead_id,tag_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    return json({ success: true, assigned: rows.length });
  } catch (error: unknown) {
    logServerError("[clients] bulk tag assignment failed", error);
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Atribuição inválida"
            : errorMessage(error, "Falha ao atribuir tags"),
      },
      400,
    );
  }
}

export async function applyAgentCalendarDirective(args: {
  dbClient: AnyDb;
  workspaceId: string;
  agentId: string;
  chatId: string;
  leadId: string | null;
  defaultCalendarId: string | null;
  permissions: readonly string[];
  directive: CalendarAgentDirective;
}) {
  const { dbClient, workspaceId, directive } = args;
  const requiredPermission: "create" | "reschedule" | "cancel" =
    directive.action === "create"
      ? "create"
      : directive.action === "reschedule"
        ? "reschedule"
        : "cancel";
  if (!hasAgentCalendarPermission(args.permissions, requiredPermission))
    return { ok: false as const, reason: "permission-denied" };

  if (directive.action === "cancel") {
    const { data, error } = await dbClient
      .from("calendar_appointments")
      .update({ status: "canceled" })
      .eq("workspace_id", workspaceId)
      .eq("id", directive.appointmentId)
      .eq("agent_id", args.agentId)
      .eq("chat_id", args.chatId)
      .select("id,status")
      .maybeSingle();
    if (error) throw error;
    return data
      ? { ok: true as const, appointment: data }
      : { ok: false as const, reason: "not-found" };
  }

  let appointment: AppointmentRow | null = null;
  if (directive.action === "reschedule") {
    const { data, error } = await dbClient
      .from("calendar_appointments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", directive.appointmentId)
      .eq("agent_id", args.agentId)
      .eq("chat_id", args.chatId)
      .in("status", ["scheduled", "confirmed"])
      .maybeSingle();
    if (error) throw error;
    appointment = data;
    if (!appointment) return { ok: false as const, reason: "not-found" };
  }

  const calendarId =
    directive.action === "create"
      ? (directive.calendarId ?? args.defaultCalendarId)
      : appointment!.calendar_id;
  if (!calendarId) return { ok: false as const, reason: "calendar-not-configured" };
  const status =
    directive.action === "create"
      ? ("scheduled" as const)
      : (appointment!.status as "scheduled" | "confirmed" | "completed" | "canceled" | "no_show");
  const source =
    directive.action === "create"
      ? ("agent" as const)
      : (appointment!.source as "manual" | "agent" | "follow_up" | "import");
  const payload = {
    calendarId,
    leadId: args.leadId,
    chatId: args.chatId,
    agentId: args.agentId,
    title: directive.action === "create" ? directive.title : appointment!.title,
    notes: directive.action === "create" ? null : appointment!.notes,
    startsAt: directive.startsAt,
    endsAt: directive.endsAt,
    status,
    source,
  } satisfies z.infer<typeof appointmentSchema>;
  const window = await validateAppointment(dbClient, workspaceId, payload);
  const row = {
    workspace_id: workspaceId,
    calendar_id: payload.calendarId,
    lead_id: payload.leadId,
    chat_id: payload.chatId,
    agent_id: payload.agentId,
    title: payload.title,
    notes: payload.notes,
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    status: payload.status,
    source: payload.source,
  };
  const result = appointment
    ? await dbClient
        .from("calendar_appointments")
        .update(row)
        .eq("workspace_id", workspaceId)
        .eq("id", appointment.id)
        .select("*")
        .single()
    : await dbClient
        .from("calendar_appointments")
        .insert({ ...row, created_by: null })
        .select("*")
        .single();
  if (result.error) throw result.error;
  return { ok: true as const, appointment: result.data };
}
