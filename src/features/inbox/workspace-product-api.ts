import { apiFetch } from "@/lib/api-fetch";

async function read<T>(responseTarget: Promise<Response> | Response): Promise<T> {
  const response = await responseTarget;
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

async function mutate<T>(path: string, method: "POST" | "PATCH" | "DELETE", payload?: unknown) {
  const init: RequestInit = { method };
  if (payload !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }
  return read<T>(await apiFetch(path, init));
}

export interface DashboardMetrics {
  connectedInstances: number;
  totalInstances: number;
  activeChats: number;
  unread: number;
  messages24h: number;
  crmLeads: number;
  pipelineByCurrency: Array<{ currency: string; valueCents: number }>;
  pendingFollowUps: number;
  overdueFollowUps: number;
  enabledAgents: number;
  automaticAgents: number;
  avgResponseTimeMs: number | null;
}

export type DashboardPeriod = "7d" | "10d" | "30d" | "90d";

export interface DashboardMessageDay {
  date: string;
  count: number;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  period: string;
  messagesByDay: DashboardMessageDay[];
}

export const loadDashboard = (period?: DashboardPeriod) => {
  const params = period ? `?period=${period}` : "";
  return read<DashboardResponse>(apiFetch(`/api/dashboard/${params}`));
};

export interface CrmStage {
  id: string;
  name: string;
  color: string;
  position: number;
  kind: "open" | "won" | "lost";
}
export interface CrmLead {
  id: string;
  stage_id: string;
  chat_id: string | null;
  contact_id: string | null;
  name: string;
  phone_e164: string | null;
  email: string | null;
  company: string | null;
  value_cents: number;
  currency: string;
  source: string;
  owner_user_id: string | null;
  notes: string | null;
  profilePicUrl?: string | null;
  isSavedContact?: boolean;
  contactCategory?: "saved_contact" | "potential_lead" | "manual";
  updated_at: string;
}
export const loadCrm = () =>
  read<{ stages: CrmStage[]; leads: CrmLead[]; canManage: boolean }>(apiFetch("/api/crm/"));
export const createLead = (payload: unknown) =>
  mutate<{ lead: CrmLead }>("/api/crm/", "POST", payload);
export const updateLead = (payload: unknown) =>
  mutate<{ lead: CrmLead }>("/api/crm/", "PATCH", payload);
export const deleteLead = (id: string) =>
  mutate<{ success: boolean }>(`/api/crm/?id=${encodeURIComponent(id)}`, "DELETE");
export const createStage = (payload: unknown) =>
  mutate<{ stage: CrmStage }>("/api/crm/stages", "POST", payload);
export const updateStage = (payload: unknown) =>
  mutate<{ stage: CrmStage }>("/api/crm/stages", "PATCH", payload);
export const deleteStage = (id: string) =>
  mutate<{ success: boolean }>(`/api/crm/stages?id=${encodeURIComponent(id)}`, "DELETE");

export interface FollowUpTask {
  id: string;
  lead_id: string | null;
  chat_id: string | null;
  title: string;
  note: string | null;
  due_at: string;
  status: "pending" | "done" | "canceled";
  priority: "low" | "normal" | "high";
  owner_user_id: string | null;
  completed_at: string | null;
}
export const loadFollowUps = () =>
  read<{ tasks: FollowUpTask[]; canManage: boolean }>(apiFetch("/api/follow-up/"));
export const createFollowUp = (payload: unknown) =>
  mutate<{ task: FollowUpTask }>("/api/follow-up/", "POST", payload);
export const updateFollowUp = (payload: unknown) =>
  mutate<{ task: FollowUpTask }>("/api/follow-up/", "PATCH", payload);
export const deleteFollowUp = (id: string) =>
  mutate<{ success: boolean }>(`/api/follow-up/?id=${encodeURIComponent(id)}`, "DELETE");

export interface AgentRuntimeConfig {
  version: 1;
  objective: string;
  audience: string;
  personality: string;
  tone: "professional" | "friendly" | "direct" | "empathetic";
  greeting: string;
  rules: string[];
  forbiddenTopics: string[];
  additionalInstructions: string;
  handoffEnabled: boolean;
  handoffTriggers: string[];
  calendarEnabled: boolean;
  calendarId: string | null;
  calendarPermissions: Array<"read" | "create" | "reschedule" | "cancel">;
  includeClientTags: boolean;
  includeFollowUps: boolean;
  includeKnowledgeBase: boolean;
}
export interface AutomationAgent {
  id: string;
  instance_id: string | null;
  name: string;
  enabled: boolean;
  provider: string;
  model: string | null;
  instructions: string;
  runtime_config: AgentRuntimeConfig | Record<string, never>;
  temperature: number;
  max_completion_tokens: number;
  reply_mode: "manual" | "automatic";
  allow_groups: boolean;
  created_at: string;
  updated_at: string;
}
export interface AutomationRun {
  id: string;
  agent_id: string;
  status: string;
  input_excerpt: string | null;
  output_excerpt: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}
export interface AgentInstance {
  id: string;
  instance_name: string;
  status: string;
  phone: string | null;
}
export interface AiProviderOption {
  provider: "groq" | "openrouter";
  label: string;
  models: string[];
}
export const loadAgents = () =>
  read<{
    agents: AutomationAgent[];
    instances: AgentInstance[];
    runs: AutomationRun[];
    groqConfigured: boolean;
    aiConfigured: boolean;
    aiOptions: AiProviderOption[];
  }>(apiFetch("/api/agents/"));
export const createAgent = (payload: unknown) =>
  mutate<{ agent: AutomationAgent }>("/api/agents/", "POST", payload);
export const updateAgent = (payload: unknown) =>
  mutate<{ agent: AutomationAgent }>("/api/agents/", "PATCH", payload);
export const deleteAgent = (id: string) =>
  mutate<{ success: boolean }>(`/api/agents/?id=${encodeURIComponent(id)}`, "DELETE");
export const testAgent = (agentId: string, prompt: string) =>
  mutate<{ text: string }>("/api/agents/test", "POST", { agentId, prompt });

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const loadKnowledgeDocuments = () =>
  read<{ documents: KnowledgeDocument[] }>(apiFetch("/api/knowledge/"));
export const createKnowledgeDocument = (payload: {
  title: string;
  content: string;
  active?: boolean;
}) => mutate<{ document: KnowledgeDocument }>("/api/knowledge/", "POST", payload);
export const updateKnowledgeDocument = (payload: {
  id: string;
  title: string;
  content: string;
  active?: boolean;
}) => mutate<{ document: KnowledgeDocument }>("/api/knowledge/", "PATCH", payload);
export const deleteKnowledgeDocument = (id: string) =>
  mutate<{ success: boolean }>(`/api/knowledge/?id=${encodeURIComponent(id)}`, "DELETE");

export interface CalendarConfig {
  id: string;
  name: string;
  timezone: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
  daily_capacity: number;
  availability: Record<string, Array<[string, string]>>;
  is_default: boolean;
  active: boolean;
}
export interface CalendarAppointment {
  id: string;
  calendar_id: string;
  lead_id: string | null;
  chat_id: string | null;
  agent_id: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "confirmed" | "completed" | "canceled" | "no_show";
  source: "manual" | "agent" | "follow_up" | "import";
  lead?: {
    id: string;
    name: string;
    phone_e164: string | null;
    profile_pic_url: string | null;
  } | null;
  agent?: { id: string; name: string } | null;
}
export const loadCalendar = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return read<{
    calendars: CalendarConfig[];
    appointments: CalendarAppointment[];
    canManage: boolean;
  }>(apiFetch(`/api/calendar/${params.toString() ? `?${params}` : ""}`));
};
export const saveCalendar = (payload: unknown) =>
  mutate<{ calendar: CalendarConfig }>(
    "/api/calendar/",
    payload && typeof payload === "object" && "id" in payload ? "PATCH" : "POST",
    payload,
  );
export const saveAppointment = (payload: unknown) =>
  mutate<{ appointment: CalendarAppointment }>(
    "/api/calendar/appointments",
    payload && typeof payload === "object" && "id" in payload ? "PATCH" : "POST",
    payload,
  );
export const cancelAppointment = (id: string) =>
  mutate<{ success: boolean }>(`/api/calendar/?id=${encodeURIComponent(id)}`, "DELETE");

export interface ClientTag {
  id: string;
  name: string;
  color: string;
}
export interface WorkspaceClient extends CrmLead {
  tags: ClientTag[];
}
export const loadClients = (query = "", options: { sync?: boolean; signal?: AbortSignal } = {}) =>
  read<{
    clients: WorkspaceClient[];
    tags: ClientTag[];
    canManage: boolean;
    syncWarning?: string;
  }>(
    apiFetch(
      `/api/clients/?${new URLSearchParams({
        ...(query ? { q: query } : {}),
        ...(options.sync === undefined ? {} : { sync: options.sync ? "1" : "0" }),
      }).toString()}`,
      options.signal ? { signal: options.signal } : undefined,
    ),
  );
export const saveClientTag = (payload: unknown) =>
  mutate<{ tag: ClientTag }>(
    "/api/clients/",
    payload && typeof payload === "object" && "id" in payload ? "PATCH" : "POST",
    payload,
  );
export const assignClientTags = (leadIds: string[], tagIds: string[]) =>
  mutate<{ success: boolean; assigned: number }>("/api/clients/", "PATCH", { leadIds, tagIds });

// F1: Unified client timeline
export interface ClientTimelineEvent {
  id: string;
  kind: "message" | "follow_up" | "appointment";
  title: string;
  description: string | null;
  timestamp: string;
  meta?: Record<string, unknown>;
}
export interface ClientTimelineResponse {
  lead: { id: string; name: string | null; phone_e164: string | null };
  events: ClientTimelineEvent[];
}
export const loadClientTimeline = (leadId: string) =>
  read<ClientTimelineResponse>(apiFetch(`/api/clients/${encodeURIComponent(leadId)}/timeline`));

export interface BillingDto {
  workspace_id: string;
  provider: string | null;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  plan_key: string | null;
  status: "unconfigured" | "trialing" | "active" | "past_due" | "canceled" | "paused";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  metadata: Record<string, unknown>;
}
export const loadBilling = () =>
  read<{ billing: BillingDto; canManage: boolean }>(apiFetch("/api/billing/"));
