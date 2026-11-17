import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowClockwise,
  Check,
  PencilSimple,
  Plus,
  Robot,
  Trash,
  UsersThree,
  UserCircle,
  WarningCircle,
  X,
  CalendarDots,
  MagnifyingGlass,
  Tag,
  UploadSimple,
  DownloadSimple,
  UserPlus,
  CheckCircle,
  BookOpenText,
} from "@phosphor-icons/react";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";
import { parseDelimitedCsv, validateClientImportCount } from "@/lib/csv";
import { useResponsiveViewport } from "@/hooks/use-responsive-viewport";
import { deriveViewDataState } from "../view-data-state";
import { progressiveRenderLimit } from "../product-surface";
import {
  createAgent,
  createFollowUp,
  createLead,
  createStage,
  deleteAgent,
  deleteFollowUp,
  deleteLead,
  loadAgents,
  loadCrm,
  loadDashboard,
  loadFollowUps,
  testAgent,
  updateAgent,
  updateFollowUp,
  updateLead,
  assignClientTags,
  cancelAppointment,
  loadCalendar,
  loadKnowledgeDocuments,
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  loadClients,
  saveAppointment,
  saveCalendar,
  saveClientTag,
  type AgentInstance,
  type AiProviderOption,
  type AgentRuntimeConfig,
  type AutomationAgent,
  type AutomationRun,
  type CrmLead,
  type CrmStage,
  type DashboardMetrics,
  type FollowUpTask,
  type CalendarAppointment,
  type CalendarConfig,
  type ClientTag,
  type WorkspaceClient,
  type KnowledgeDocument,
} from "../workspace-product-api";

type Props = { isDarkMode: boolean };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado";
}

function isAgentRuntimeConfig(value: unknown): value is AgentRuntimeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return (
    config["version"] === 1 &&
    typeof config["objective"] === "string" &&
    Array.isArray(config["rules"]) &&
    Array.isArray(config["forbiddenTopics"]) &&
    Array.isArray(config["handoffTriggers"])
  );
}

const card = (dark: boolean) =>
  `rounded-2xl border transition-colors ${
    dark
      ? "border-white/[0.08] bg-white/[0.03] shadow-sm shadow-black/20"
      : "border-black/[0.08] bg-white/80 shadow-sm shadow-black/5"
  }`;

const inputClass = (dark: boolean) =>
  `h-10 min-w-0 rounded-xl border px-3 text-xs outline-none transition-colors ${
    dark
      ? "border-white/10 bg-white/[0.02] text-zinc-100 placeholder:text-zinc-500 focus:border-white/30 focus:bg-white/[0.04]"
      : "border-black/10 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-black/30 focus:bg-white"
  }`;

const buttonClass = (dark: boolean) =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none ${
    dark
      ? "border-white/10 text-zinc-200 hover:bg-white/[0.06] active:bg-white/[0.1]"
      : "border-black/10 text-zinc-800 hover:bg-black/[0.04] active:bg-black/[0.08]"
  }`;

const optionClass = "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

function SurfaceSelect({
  isDarkMode,
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  disabled = false,
  children,
}: {
  isDarkMode: boolean;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={inputClass(isDarkMode)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function useRealtimeRefresh(refresh: () => void, events: readonly string[]) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const eventKey = events.join("|");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 180);
    };
    const unsubscribe = eventKey
      .split("|")
      .filter(Boolean)
      .map((event) => subscribeInboxEvent(event, schedule));
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe.forEach((cancel) => cancel());
    };
  }, [eventKey]);
}

function Empty({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-current/10 p-5 text-center text-xs text-zinc-500">
      {children}
    </div>
  );
}

const skeletonGridColumns = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  5: "grid-cols-2 lg:grid-cols-5",
} as const;

function DataSkeleton({ label, columns = 2 }: { label: string; columns?: 2 | 3 | 5 }) {
  return (
    <div
      data-state="initial"
      role="status"
      aria-label={label}
      aria-busy="true"
      className={`grid ${skeletonGridColumns[columns]} gap-3`}
    >
      {Array.from({ length: columns * 2 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-24 animate-pulse rounded-2xl border border-current/5 bg-current/[0.035]"
        />
      ))}
    </div>
  );
}
function ErrorBox({ text }: { text: string }) {
  return (
    <div role="alert" className="inbox-feedback inbox-feedback-error mb-3">
      <WarningCircle size={17} weight="duotone" aria-hidden="true" />
      <div className="min-w-0">
        <p className="inbox-feedback-title">Não foi possível concluir</p>
        <p className="inbox-feedback-description">{text}</p>
      </div>
    </div>
  );
}

function Heading({
  title,
  description,
  isDarkMode,
  onRefresh,
}: {
  title: string;
  description: string;
  isDarkMode: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-[-.03em]">{title}</h1>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      {onRefresh && (
        <button
          className={buttonClass(isDarkMode)}
          onClick={onRefresh}
          aria-label={`Atualizar dados de ${title}`}
        >
          <ArrowClockwise size={14} />
          Atualizar
        </button>
      )}
    </div>
  );
}

function parseCurrencyValue(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return Number.isFinite(num) ? Math.max(0, Math.round(num * 100)) : 0;
}

export function DashboardView({ isDarkMode }: Props) {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setError("");
    setIsLoading(true);
    void loadDashboard()
      .then((x) => setData(x.metrics))
      .catch((e) => {
        const message = errorMessage(e);
        setError(message);
        WhatsAppToast.networkError(message);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const money = useMemo(() => {
    if (!data) return "—";
    if (data.pipelineByCurrency?.length) {
      return data.pipelineByCurrency
        .map((row: { currency: string; valueCents: number }) =>
          new Intl.NumberFormat("pt-BR", { style: "currency", currency: row.currency }).format(
            (row.valueCents || 0) / 100,
          ),
        )
        .join(" · ");
    }
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(0);
  }, [data]);

  const metrics = data
    ? [
        ["Conexões", `${data.connectedInstances}/${data.totalInstances}`],
        ["Conversas ativas", data.activeChats],
        ["Não lidas", data.unread],
        ["Mensagens 24h", data.messages24h],
        ["Leads CRM", data.crmLeads],
        ["Pipeline", money],
        ["Follow-ups", data.pendingFollowUps],
        ["Atrasados", data.overdueFollowUps],
        ["Agentes ativos", data.enabledAgents],
        ["Automáticos", data.automaticAgents],
      ]
    : [];
  const viewState = deriveViewDataState({
    hasData: Boolean(data),
    isLoading,
    hasError: Boolean(error),
    isEmpty: false,
  });

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-dashboard-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="Dashboard"
        description="Indicadores reais do workspace ativo."
        isDarkMode={isDarkMode}
        onRefresh={refresh}
      />
      {error && <ErrorBox text={error} />}
      {viewState === "initial" && (
        <DataSkeleton label="Preparando indicadores do workspace" columns={5} />
      )}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando indicadores...
        </p>
      )}
      {viewState !== "error" && viewState !== "initial" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div key={String(label)} className={`${card(isDarkMode)} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">
                {label}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-.04em]">{String(value)}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export function CrmView({ isDarkMode }: Props) {
  const viewport = useResponsiveViewport();
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", value: "" });
  const [newStage, setNewStage] = useState("");
  const [pendingLeadDelete, setPendingLeadDelete] = useState<CrmLead | null>(null);
  const [visibleLeadCounts, setVisibleLeadCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setError("");
      const x = await loadCrm();
      setStages(x.stages);
      setLeads(x.leads);
      setCanManage(x.canManage);
      setHasLoaded(true);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (ok) WhatsAppToast.success(ok);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await createLead({
        name: form.name.trim(),
        valueCents: parseCurrencyValue(form.value),
      });
      setForm({ name: "", value: "" });
    }, "Lead criado com sucesso.");

  const handleDeleteLead = (lead: CrmLead) => setPendingLeadDelete(lead);
  const viewState = deriveViewDataState({
    hasData: hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && stages.length === 0 && leads.length === 0,
  });

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-crm-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="CRM"
        description="Pipeline comercial persistente e isolado por workspace."
        isDarkMode={isDarkMode}
        onRefresh={() => void refresh()}
      />
      {error && <ErrorBox text={error} />}
      {viewState === "initial" && (
        <DataSkeleton label="Preparando pipeline comercial" columns={3} />
      )}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando pipeline...
        </p>
      )}
      {viewState === "empty" && (
        <Empty>Nenhuma etapa ou lead foi encontrado neste workspace.</Empty>
      )}
      {viewState !== "initial" && viewState !== "error" && canManage && (
        <div
          className={`${card(isDarkMode)} inboxos-responsive-actions mb-4 grid gap-2 p-3 md:grid-cols-[1fr_160px_auto]`}
        >
          <input
            className={inputClass(isDarkMode)}
            placeholder="Nome do lead"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={inputClass(isDarkMode)}
            inputMode="decimal"
            placeholder="Valor (R$)"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <button
            className={buttonClass(isDarkMode)}
            disabled={busy || !form.name.trim()}
            onClick={add}
          >
            <Plus size={13} />
            Lead
          </button>
        </div>
      )}
      {viewState !== "initial" && viewState !== "error" && (
        <div className="grid min-w-0 gap-3 xl:grid-cols-5">
          {stages.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
            const visibleLeadLimit =
              visibleLeadCounts[stage.id] ?? progressiveRenderLimit(viewport.horizontal);
            const visibleLeads = stageLeads.slice(0, visibleLeadLimit);
            return (
              <section key={stage.id} className={`${card(isDarkMode)} min-w-0 p-3`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: stage.color }}
                    />
                    <h2 title={stage.name} className="truncate text-xs font-semibold">
                      {stage.name}
                    </h2>
                  </div>
                  <span className="text-[10px] text-zinc-500">{stageLeads.length}</span>
                </div>
                <div className="grid gap-2">
                  {visibleLeads.map((lead) => (
                    <article key={lead.id} className="rounded-xl border border-current/5 p-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-current/10">
                          <UserCircle className="h-full w-full text-zinc-500" weight="duotone" />
                          {lead.profilePicUrl && (
                            <img
                              src={lead.profilePicUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p title={lead.name} className="truncate text-xs font-semibold">
                              {lead.name}
                            </p>
                            {lead.contactCategory === "saved_contact" && (
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-500">
                                Contato salvo
                              </span>
                            )}
                            {lead.contactCategory === "potential_lead" && (
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500">
                                Possível lead
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {lead.company || lead.phone_e164 || lead.email || "Sem contato"}
                      </p>
                      <p className="mt-2 text-xs">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: lead.currency || "BRL",
                        }).format((lead.value_cents || 0) / 100)}
                      </p>
                      {canManage && (
                        <div className="mt-3 flex gap-1">
                          <SurfaceSelect
                            isDarkMode={isDarkMode}
                            value={lead.stage_id}
                            onValueChange={(stageId) =>
                              void run(
                                () => updateLead({ id: lead.id, stageId }),
                                "Lead movido de etapa.",
                              )
                            }
                            placeholder="Etapa do lead"
                            ariaLabel={`Mover etapa do lead ${lead.name}`}
                          >
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SurfaceSelect>
                          <button
                            className={`${buttonClass(isDarkMode)} h-8 px-2 text-red-500 hover:text-red-600`}
                            onClick={() => handleDeleteLead(lead)}
                            title="Excluir lead"
                            aria-label={`Excluir lead ${lead.name}`}
                          >
                            <Trash size={13} />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {!stageLeads.length && (
                    <p className="py-3 text-center text-[10px] text-zinc-500">Sem leads</p>
                  )}
                  {stageLeads.length > visibleLeads.length && (
                    <button
                      type="button"
                      className={`${buttonClass(isDarkMode)} mt-1 w-full`}
                      onClick={() =>
                        setVisibleLeadCounts((current) => ({
                          ...current,
                          [stage.id]:
                            visibleLeadLimit + progressiveRenderLimit(viewport.horizontal),
                        }))
                      }
                    >
                      Mostrar mais ({stageLeads.length - visibleLeads.length})
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {viewState !== "initial" && viewState !== "error" && canManage && (
        <div className={`${card(isDarkMode)} mt-4 flex gap-2 p-3`}>
          <input
            className={`${inputClass(isDarkMode)} flex-1`}
            placeholder="Nova etapa"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
          />
          <button
            className={buttonClass(isDarkMode)}
            disabled={!newStage.trim() || busy}
            onClick={() =>
              void run(async () => {
                await createStage({ name: newStage.trim(), position: stages.length });
                setNewStage("");
              }, "Etapa criada com sucesso.")
            }
          >
            <Plus size={13} />
            Etapa
          </button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingLeadDelete)}
        title="Excluir lead?"
        description={`O lead ${pendingLeadDelete?.name || "selecionado"} será removido do pipeline.`}
        confirmLabel="Excluir lead"
        destructive
        busy={busy}
        dark={isDarkMode}
        onCancel={() => setPendingLeadDelete(null)}
        onConfirm={() => {
          if (!pendingLeadDelete) return;
          const lead = pendingLeadDelete;
          setPendingLeadDelete(null);
          void run(() => deleteLead(lead.id), "Lead excluído com sucesso.");
        }}
      />
    </main>
  );
}

export function FollowUpView({ isDarkMode }: Props) {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingFollowUpDelete, setPendingFollowUpDelete] = useState<FollowUpTask | null>(null);
  const tomorrow = new Date(Date.now() + 86400000);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const [form, setForm] = useState({
    title: "",
    dueAt: local,
    priority: "normal",
    leadId: "",
    note: "",
  });
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingDueAt, setEditingDueAt] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setError("");
      const [x, clients] = await Promise.all([loadFollowUps(), loadClients("", { sync: false })]);
      setTasks(x.tasks);
      setLeads(clients.clients);
      setCanManage(x.canManage);
      setHasLoaded(true);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (ok) WhatsAppToast.success(ok);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFollowUp = (task: FollowUpTask) => setPendingFollowUpDelete(task);
  const viewState = deriveViewDataState({
    hasData: tasks.length > 0 || hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && tasks.length === 0,
  });

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-follow-up-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="Follow-up"
        description="Tarefas comerciais com prazo, prioridade e conclusão auditável."
        isDarkMode={isDarkMode}
        onRefresh={() => void refresh()}
      />
      {error && <ErrorBox text={error} />}
      {viewState === "initial" && <DataSkeleton label="Preparando follow-ups" columns={2} />}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando follow-ups...
        </p>
      )}
      {viewState !== "initial" && canManage && (
        <div
          className={`${card(isDarkMode)} inboxos-responsive-actions mb-4 grid gap-2 p-3 md:grid-cols-[1fr_190px_120px_auto]`}
        >
          <input
            className={inputClass(isDarkMode)}
            placeholder="Ação de acompanhamento"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className={inputClass(isDarkMode)}
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
          />
          <SurfaceSelect
            isDarkMode={isDarkMode}
            value={form.priority}
            onValueChange={(priority) => setForm({ ...form, priority })}
            placeholder="Prioridade"
            ariaLabel="Prioridade do follow-up"
          >
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SurfaceSelect>
          <SurfaceSelect
            isDarkMode={isDarkMode}
            value={form.leadId || "__none__"}
            onValueChange={(leadId) =>
              setForm({ ...form, leadId: leadId === "__none__" ? "" : leadId })
            }
            placeholder="Vincular cliente (opcional)"
            ariaLabel="Cliente do follow-up"
          >
            <SelectItem value="__none__">Vincular cliente (opcional)</SelectItem>
            {leads.map((lead) => (
              <SelectItem key={lead.id} value={lead.id}>
                {lead.name || lead.phone_e164 || "Cliente"}
              </SelectItem>
            ))}
          </SurfaceSelect>
          <textarea
            className={`${inputClass(isDarkMode)} min-h-10 py-2 md:col-span-2`}
            placeholder="Observação interna (opcional)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={1}
          />
          <button
            className={buttonClass(isDarkMode)}
            disabled={
              busy ||
              !form.title.trim() ||
              !form.dueAt ||
              Number.isNaN(new Date(form.dueAt).getTime())
            }
            onClick={() =>
              void run(async () => {
                await createFollowUp({
                  title: form.title.trim(),
                  dueAt: new Date(form.dueAt).toISOString(),
                  priority: form.priority,
                  leadId: form.leadId || null,
                  note: form.note.trim() || null,
                });
                setForm({ ...form, title: "", leadId: "", note: "" });
              }, "Follow-up registrado com sucesso.")
            }
          >
            <Plus size={13} />
            Criar
          </button>
        </div>
      )}
      {viewState !== "initial" && (
        <div className="grid gap-2">
          {tasks.map((task) => {
            const overdue =
              task.status === "pending" && new Date(task.due_at).getTime() < Date.now();
            return (
              <article
                key={task.id}
                className={`${card(
                  isDarkMode,
                )} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      title={task.title}
                      className={`truncate text-xs font-semibold ${
                        task.status === "done" ? "line-through opacity-50" : ""
                      }`}
                    >
                      {task.title}
                    </p>
                    {overdue && (
                      <span title="Atrasado" className="inline-flex items-center text-red-500">
                        <WarningCircle size={14} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {new Date(task.due_at).toLocaleString("pt-BR")} · {task.priority}
                  </p>
                  {task.lead_id && (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Cliente: {leads.find((lead) => lead.id === task.lead_id)?.name ?? "vinculado"}
                    </p>
                  )}
                  {task.note && (
                    <p className="mt-1 line-clamp-2 text-[10px] text-zinc-500">{task.note}</p>
                  )}
                </div>
                {canManage && (
                  <div className="inboxos-responsive-actions flex gap-2">
                    {editingTask === task.id ? (
                      <>
                        <input
                          className={inputClass(isDarkMode)}
                          type="datetime-local"
                          value={editingDueAt}
                          onChange={(e) => setEditingDueAt(e.target.value)}
                          aria-label={`Nova data da tarefa ${task.title}`}
                        />
                        <button
                          className={buttonClass(isDarkMode)}
                          disabled={busy || !editingDueAt}
                          onClick={() =>
                            void run(async () => {
                              await updateFollowUp({
                                id: task.id,
                                dueAt: new Date(editingDueAt).toISOString(),
                              });
                              setEditingTask(null);
                            }, "Follow-up reagendado.")
                          }
                        >
                          Salvar
                        </button>
                        <button
                          className={buttonClass(isDarkMode)}
                          onClick={() => setEditingTask(null)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        className={buttonClass(isDarkMode)}
                        onClick={() => {
                          setEditingTask(task.id);
                          setEditingDueAt(
                            new Date(
                              new Date(task.due_at).getTime() -
                                new Date(task.due_at).getTimezoneOffset() * 60000,
                            )
                              .toISOString()
                              .slice(0, 16),
                          );
                        }}
                        aria-label={`Reagendar tarefa ${task.title}`}
                      >
                        <PencilSimple size={13} /> Reagendar
                      </button>
                    )}
                    {task.status === "pending" && (
                      <button
                        className={buttonClass(isDarkMode)}
                        onClick={() =>
                          void run(
                            () => updateFollowUp({ id: task.id, status: "done" }),
                            "Follow-up concluído com sucesso.",
                          )
                        }
                        aria-label={`Concluir tarefa ${task.title}`}
                      >
                        <Check size={13} />
                        Concluir
                      </button>
                    )}
                    <button
                      className={`${buttonClass(isDarkMode)} text-red-500 hover:text-red-600`}
                      onClick={() => handleDeleteFollowUp(task)}
                      title="Excluir follow-up"
                      aria-label={`Excluir tarefa ${task.title}`}
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {viewState === "empty" && <Empty>Nenhum follow-up criado.</Empty>}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingFollowUpDelete)}
        title="Excluir follow-up?"
        description={`A tarefa ${pendingFollowUpDelete?.title || "selecionada"} será removida permanentemente.`}
        confirmLabel="Excluir follow-up"
        destructive
        busy={busy}
        dark={isDarkMode}
        onCancel={() => setPendingFollowUpDelete(null)}
        onConfirm={() => {
          if (!pendingFollowUpDelete) return;
          const task = pendingFollowUpDelete;
          setPendingFollowUpDelete(null);
          void run(() => deleteFollowUp(task.id), "Follow-up excluído com sucesso.");
        }}
      />
    </main>
  );
}

export function AgentsView({ isDarkMode }: Props) {
  const [agents, setAgents] = useState<AutomationAgent[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeEditingId, setKnowledgeEditingId] = useState<string | null>(null);
  const [pendingKnowledgeDelete, setPendingKnowledgeDelete] = useState<KnowledgeDocument | null>(
    null,
  );
  const [knowledgeForm, setKnowledgeForm] = useState({ title: "", content: "", active: true });
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [calendars, setCalendars] = useState<CalendarConfig[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiOptions, setAiOptions] = useState<AiProviderOption[]>([]);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [pendingAgentDeleteIds, setPendingAgentDeleteIds] = useState<string[] | null>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorDialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    objective: "",
    audience: "",
    personality: "",
    tone: "professional",
    greeting: "",
    rules: "",
    forbiddenTopics: "",
    additionalInstructions: "",
    handoffEnabled: true,
    handoffTriggers: "falar com humano, atendente",
    instanceId: "",
    provider: "groq" as "groq" | "openrouter",
    model: "",
    replyMode: "manual",
    allowGroups: false,
    temperature: "0.3",
    maxTokens: "700",
    calendarEnabled: false,
    calendarId: "",
    calendarPermissions: "read,create,reschedule",
    includeClientTags: true,
    includeFollowUps: true,
    includeKnowledgeBase: false,
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setError("");
      const [x, calendarData, knowledgeData] = await Promise.all([
        loadAgents(),
        loadCalendar().catch(() => ({ calendars: [], appointments: [], canManage: false })),
        loadKnowledgeDocuments().catch(() => ({ documents: [] })),
      ]);
      setAgents(Array.isArray(x.agents) ? x.agents : []);
      setInstances(Array.isArray(x.instances) ? x.instances : []);
      setRuns(Array.isArray(x.runs) ? x.runs : []);
      const availableAiOptions = Array.isArray(x.aiOptions) ? x.aiOptions : [];
      setAiConfigured(x.aiConfigured || x.groqConfigured);
      setAiOptions(availableAiOptions);
      setForm((current) => {
        if (
          !availableAiOptions.length ||
          availableAiOptions.some((item) => item.provider === current.provider)
        )
          return current;
        const first = availableAiOptions[0];
        if (!first) return current;
        return { ...current, provider: first.provider, model: first.models[0] || "" };
      });
      setCalendars(Array.isArray(calendarData.calendars) ? calendarData.calendars : []);
      setKnowledgeDocuments(Array.isArray(knowledgeData.documents) ? knowledgeData.documents : []);
      setHasLoaded(true);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!editorOpen || agents.length === 0) return;
    const first = editorDialogRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([disabled])",
    );
    requestAnimationFrame(() => first?.focus());
  }, [agents.length, editorOpen]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (ok) WhatsAppToast.success(ok);
    } catch (e: unknown) {
      const message = errorMessage(e);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (trigger?: HTMLElement | null) => {
    editorTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    resetForm();
    setEditorOpen(false);
    requestAnimationFrame(() => editorTriggerRef.current?.focus());
  };

  const trapEditorFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (agents.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      editorDialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]",
      ) || [],
    ).filter((node) => node.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDeleteAgent = (agent: AutomationAgent) => setPendingAgentDeleteIds([agent.id]);

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      objective: "",
      audience: "",
      personality: "",
      tone: "professional",
      greeting: "",
      rules: "",
      forbiddenTopics: "",
      additionalInstructions: "",
      handoffEnabled: true,
      handoffTriggers: "falar com humano, atendente",
      instanceId: "",
      provider: "groq",
      model: "",
      replyMode: "manual",
      allowGroups: false,
      temperature: "0.3",
      maxTokens: "700",
      calendarEnabled: false,
      calendarId: "",
      calendarPermissions: "read,create,reschedule",
      includeClientTags: true,
      includeFollowUps: true,
      includeKnowledgeBase: false,
    });
  };

  const editAgent = (agent: AutomationAgent) => {
    const config = isAgentRuntimeConfig(agent.runtime_config) ? agent.runtime_config : null;
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      objective: config?.objective || agent.instructions,
      audience: config?.audience || "",
      personality: config?.personality || "",
      tone: config?.tone || "professional",
      greeting: config?.greeting || "",
      rules: Array.isArray(config?.rules) ? config.rules.join("\n") : "",
      forbiddenTopics: Array.isArray(config?.forbiddenTopics)
        ? config.forbiddenTopics.join("\n")
        : "",
      additionalInstructions: config?.additionalInstructions || "",
      handoffEnabled: config?.handoffEnabled === true,
      handoffTriggers: Array.isArray(config?.handoffTriggers)
        ? config.handoffTriggers.join(", ")
        : "",
      instanceId: agent.instance_id || "",
      provider: agent.provider === "openrouter" ? "openrouter" : "groq",
      model: agent.model || "",
      replyMode: agent.reply_mode,
      allowGroups: agent.allow_groups,
      temperature: String(agent.temperature),
      maxTokens: String(agent.max_completion_tokens),
      calendarEnabled: config?.calendarEnabled === true,
      calendarId: config?.calendarId || "",
      calendarPermissions: Array.isArray(config?.calendarPermissions)
        ? config.calendarPermissions.join(",")
        : "read,create,reschedule",
      includeClientTags: config?.includeClientTags !== false,
      includeFollowUps: config?.includeFollowUps !== false,
      includeKnowledgeBase: config?.includeKnowledgeBase === true,
    });
    openEditor();
  };

  const editKnowledgeDocument = (document: KnowledgeDocument) => {
    setKnowledgeEditingId(document.id);
    setKnowledgeForm({
      title: document.title,
      content: document.content,
      active: document.active,
    });
  };

  const resetKnowledgeDocument = () => {
    setKnowledgeEditingId(null);
    setKnowledgeForm({ title: "", content: "", active: true });
  };

  const saveKnowledgeDocument = () => {
    void (async () => {
      setKnowledgeBusy(true);
      try {
        if (!knowledgeForm.title.trim() || !knowledgeForm.content.trim()) {
          throw new Error("Título e conteúdo são obrigatórios");
        }
        if (knowledgeEditingId) {
          await updateKnowledgeDocument({ id: knowledgeEditingId, ...knowledgeForm });
        } else {
          await createKnowledgeDocument(knowledgeForm);
        }
        resetKnowledgeDocument();
        const refreshed = await loadKnowledgeDocuments();
        setKnowledgeDocuments(refreshed.documents);
        WhatsAppToast.success(
          knowledgeEditingId ? "Documento atualizado com sucesso." : "Documento adicionado à base.",
        );
      } catch (e: unknown) {
        const message = errorMessage(e);
        setError(message);
        WhatsAppToast.networkError(message);
      } finally {
        setKnowledgeBusy(false);
      }
    })();
  };

  const removeKnowledgeDocument = (document: KnowledgeDocument) => {
    void (async () => {
      setKnowledgeBusy(true);
      try {
        await deleteKnowledgeDocument(document.id);
        setKnowledgeDocuments((current) => current.filter((item) => item.id !== document.id));
        if (knowledgeEditingId === document.id) resetKnowledgeDocument();
        WhatsAppToast.success("Documento removido.");
      } catch (e: unknown) {
        const message = errorMessage(e);
        setError(message);
        WhatsAppToast.networkError(message);
      } finally {
        setKnowledgeBusy(false);
      }
    })();
  };

  const viewState = deriveViewDataState({
    hasData: agents.length > 0 || knowledgeDocuments.length > 0 || hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && agents.length === 0 && knowledgeDocuments.length === 0,
  });

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-agents-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="Agentes"
        description="Personalize objetivo, tom, limites e transferência humana por conexão."
        isDarkMode={isDarkMode}
        onRefresh={() => void refresh()}
      />
      {viewState === "initial" && <DataSkeleton label="Preparando agentes" columns={2} />}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando agentes...
        </p>
      )}
      {agents.length > 0 && (
        <section
          className={`${card(isDarkMode)} inboxos-responsive-actions mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
          aria-label="Ações dos agentes"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">Agentes do workspace</p>
            <p className="mt-1 text-xs text-zinc-500">
              {agents.filter((agent) => agent.enabled).length} ativo(s) · {instances.length}{" "}
              conexão(ões) disponível(is)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass(isDarkMode)}
              disabled={selectedAgentIds.length === 0 || busy}
              onClick={() => setPendingAgentDeleteIds(selectedAgentIds)}
            >
              <Trash size={15} aria-hidden="true" />
              Excluir selecionados{selectedAgentIds.length ? ` (${selectedAgentIds.length})` : ""}
            </button>
            <button
              className={`${buttonClass(isDarkMode)} ${isDarkMode ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15" : "border-emerald-600/20 bg-emerald-600 text-white hover:bg-emerald-700"}`}
              onClick={(event) => {
                resetForm();
                openEditor(event.currentTarget);
              }}
            >
              <Plus size={16} weight="bold" aria-hidden="true" /> Criar agente
            </button>
          </div>
        </section>
      )}
      {error && <ErrorBox text={error} />}
      {!aiConfigured && (
        <div className="inbox-feedback inbox-feedback-warning mb-4" role="status">
          <WarningCircle size={17} weight="duotone" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="inbox-feedback-title">Respostas automáticas desativadas</p>
              <span className="inbox-feedback-state">Desativado</span>
            </div>
            <p className="inbox-feedback-description">
              Configure o provedor de IA para ativar respostas automáticas. Os agentes podem ser
              salvos enquanto isso.
            </p>
          </div>
        </div>
      )}
      {(agents.length === 0 || editorOpen) && (
        <div
          className={
            agents.length > 0
              ? "fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
              : "mb-4"
          }
          onMouseDown={(event) => {
            if (agents.length > 0 && event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            ref={editorDialogRef}
            role={agents.length > 0 ? "dialog" : undefined}
            aria-modal={agents.length > 0 || undefined}
            aria-labelledby="agent-editor-title"
            className={
              agents.length > 0
                ? "max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl sm:rounded-3xl"
                : undefined
            }
            onKeyDown={trapEditorFocus}
          >
            <div
              className={`${card(isDarkMode)} grid gap-3 p-4 lg:grid-cols-2 ${agents.length > 0 ? "rounded-t-3xl sm:rounded-3xl" : ""}`}
            >
              <div className="lg:col-span-2 flex items-center justify-between gap-3">
                <div>
                  <h2 id="agent-editor-title" className="text-sm font-semibold">
                    {editingId ? "Editar agente" : "Novo agente"}
                  </h2>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Os campos abaixo são compilados em instruções consistentes para o modelo.
                  </p>
                </div>
                {(editingId || agents.length > 0) && (
                  <button
                    className={buttonClass(isDarkMode)}
                    onClick={closeEditor}
                    aria-label="Fechar editor de agente"
                  >
                    <X size={13} />
                    Cancelar
                  </button>
                )}
              </div>
              <input
                className={inputClass(isDarkMode)}
                placeholder="Nome do agente"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <SurfaceSelect
                isDarkMode={isDarkMode}
                value={form.instanceId || "__all__"}
                onValueChange={(instanceId) =>
                  setForm({ ...form, instanceId: instanceId === "__all__" ? "" : instanceId })
                }
                placeholder="Todas as conexões"
                ariaLabel="Conexão atribuída ao agente"
              >
                <SelectItem value="__all__">Todas as conexões</SelectItem>
                {instances.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.instance_name} · {i.status}
                  </SelectItem>
                ))}
              </SurfaceSelect>
              <SurfaceSelect
                isDarkMode={isDarkMode}
                ariaLabel="Provedor de IA"
                value={form.provider}
                disabled={!aiOptions.length}
                onValueChange={(providerValue) => {
                  const provider = providerValue as "groq" | "openrouter";
                  const option = aiOptions.find((item) => item.provider === provider);
                  setForm({ ...form, provider, model: option?.models[0] || "" });
                }}
                placeholder="Provedor de IA"
              >
                {!aiOptions.length && (
                  <SelectItem value="groq">Configure um provedor no ADM</SelectItem>
                )}
                {aiOptions.map((option) => (
                  <SelectItem key={option.provider} value={option.provider}>
                    {option.label}
                  </SelectItem>
                ))}
              </SurfaceSelect>
              <SurfaceSelect
                isDarkMode={isDarkMode}
                ariaLabel="Modelo de IA autorizado"
                value={form.model || "__administrator_default__"}
                disabled={
                  !aiOptions.find((option) => option.provider === form.provider)?.models.length
                }
                onValueChange={(model) =>
                  setForm({
                    ...form,
                    model: model === "__administrator_default__" ? "" : model,
                  })
                }
                placeholder="Modelo de IA autorizado"
              >
                <SelectItem value="__administrator_default__">
                  Modelo definido pelo administrador
                </SelectItem>
                {(aiOptions.find((option) => option.provider === form.provider)?.models || []).map(
                  (model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ),
                )}
              </SurfaceSelect>
              <textarea
                className={`min-h-24 rounded-xl border p-3 text-xs outline-none transition-colors lg:col-span-2 ${
                  isDarkMode
                    ? "border-white/10 bg-white/[0.02] text-zinc-100 placeholder:text-zinc-500 focus:border-white/30"
                    : "border-black/10 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-black/30"
                }`}
                aria-label="Objetivo principal do agente"
                placeholder="Objetivo principal — por exemplo: qualificar o contato e agendar uma demonstração"
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
              />
              <input
                className={inputClass(isDarkMode)}
                aria-label="Público do agente"
                placeholder="Público atendido"
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              />
              <input
                className={inputClass(isDarkMode)}
                aria-label="Personalidade do agente"
                placeholder="Personalidade — ex.: consultiva e objetiva"
                value={form.personality}
                onChange={(e) => setForm({ ...form, personality: e.target.value })}
              />
              <SurfaceSelect
                isDarkMode={isDarkMode}
                ariaLabel="Tom de voz"
                value={form.tone}
                onValueChange={(tone) => setForm({ ...form, tone })}
                placeholder="Tom de voz"
              >
                <SelectItem value="professional">Profissional</SelectItem>
                <SelectItem value="friendly">Amigável</SelectItem>
                <SelectItem value="direct">Direto</SelectItem>
                <SelectItem value="empathetic">Empático</SelectItem>
              </SurfaceSelect>
              <input
                className={inputClass(isDarkMode)}
                aria-label="Saudação inicial"
                placeholder="Saudação inicial"
                value={form.greeting}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              />
              <textarea
                className={`${inputClass(isDarkMode)} h-24 py-3`}
                aria-label="Regras obrigatórias"
                placeholder="Regras obrigatórias — uma por linha"
                value={form.rules}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
              />
              <textarea
                className={`${inputClass(isDarkMode)} h-24 py-3`}
                aria-label="Assuntos proibidos"
                placeholder="Assuntos proibidos — um por linha"
                value={form.forbiddenTopics}
                onChange={(e) => setForm({ ...form, forbiddenTopics: e.target.value })}
              />
              <textarea
                className={`${inputClass(isDarkMode)} h-24 py-3 lg:col-span-2`}
                aria-label="Instruções adicionais"
                placeholder="Instruções adicionais (opcional)"
                value={form.additionalInstructions}
                onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })}
              />
              <SurfaceSelect
                isDarkMode={isDarkMode}
                value={form.replyMode}
                onValueChange={(replyMode) => setForm({ ...form, replyMode })}
                placeholder="Modo de resposta"
                ariaLabel="Modo de resposta"
              >
                <SelectItem value="manual">Somente teste/manual</SelectItem>
                <SelectItem value="automatic">Responder automaticamente</SelectItem>
              </SurfaceSelect>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputClass(isDarkMode)}
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                  title="Temperatura"
                />
                <input
                  className={inputClass(isDarkMode)}
                  type="number"
                  min="64"
                  max="8192"
                  value={form.maxTokens}
                  onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                  title="Max tokens"
                />
              </div>
              <label
                className="flex min-h-11 items-center gap-2 text-xs cursor-pointer select-none"
                htmlFor="agent-allow-groups"
              >
                <Checkbox
                  id="agent-allow-groups"
                  checked={form.allowGroups}
                  onCheckedChange={(checked) => setForm({ ...form, allowGroups: checked === true })}
                />
                Permitir grupos
              </label>
              <label
                className="flex min-h-11 items-center gap-2 text-xs cursor-pointer select-none"
                htmlFor="agent-handoff-enabled"
              >
                <Checkbox
                  id="agent-handoff-enabled"
                  checked={form.handoffEnabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, handoffEnabled: checked === true })
                  }
                />
                Transferir para atendimento humano
              </label>
              <input
                className={`${inputClass(isDarkMode)} lg:col-span-2`}
                aria-label="Gatilhos de atendimento humano"
                placeholder="Gatilhos separados por vírgula — ex.: falar com humano, atendente"
                disabled={!form.handoffEnabled}
                value={form.handoffTriggers}
                onChange={(e) => setForm({ ...form, handoffTriggers: e.target.value })}
              />
              <div className={`${card(isDarkMode)} grid gap-2 p-3 lg:col-span-2`}>
                <div className="flex items-center gap-2">
                  <CalendarDots size={15} />
                  <p className="text-xs font-semibold">Contexto de clientes e calendário</p>
                </div>
                <label
                  className="flex min-h-11 items-center gap-2 text-xs cursor-pointer"
                  htmlFor="agent-calendar-enabled"
                >
                  <Checkbox
                    id="agent-calendar-enabled"
                    checked={form.calendarEnabled}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, calendarEnabled: checked === true })
                    }
                  />
                  Permitir que o agente consulte e gerencie agendamentos
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    disabled={!form.calendarEnabled}
                    value={form.calendarId || "__workspace_default__"}
                    onValueChange={(calendarId) =>
                      setForm({
                        ...form,
                        calendarId: calendarId === "__workspace_default__" ? "" : calendarId,
                      })
                    }
                    ariaLabel="Calendário do agente"
                    placeholder="Calendário padrão"
                  >
                    <SelectItem value="__workspace_default__">Calendário padrão</SelectItem>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                  <input
                    className={inputClass(isDarkMode)}
                    disabled={!form.calendarEnabled}
                    value={form.calendarPermissions}
                    onChange={(e) => setForm({ ...form, calendarPermissions: e.target.value })}
                    placeholder="Permissões: read,create,reschedule,cancel"
                    aria-label="Permissões de calendário"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label
                    className="flex min-h-11 items-center gap-2 text-xs cursor-pointer"
                    htmlFor="agent-client-tags"
                  >
                    <Checkbox
                      id="agent-client-tags"
                      checked={form.includeClientTags}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeClientTags: checked === true })
                      }
                    />
                    Incluir tags do cliente
                  </label>
                  <label
                    className="flex min-h-11 items-center gap-2 text-xs cursor-pointer"
                    htmlFor="agent-follow-ups"
                  >
                    <Checkbox
                      id="agent-follow-ups"
                      checked={form.includeFollowUps}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeFollowUps: checked === true })
                      }
                    />
                    Incluir follow-ups pendentes
                  </label>
                  <label
                    className="flex min-h-11 items-center gap-2 text-xs cursor-pointer"
                    htmlFor="agent-knowledge-base"
                  >
                    <Checkbox
                      id="agent-knowledge-base"
                      checked={form.includeKnowledgeBase}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeKnowledgeBase: checked === true })
                      }
                    />
                    Incluir base de conhecimento autorizada
                  </label>
                </div>
              </div>
              <button
                className={buttonClass(isDarkMode)}
                disabled={busy || !form.name.trim() || !form.objective.trim()}
                onClick={() =>
                  void run(
                    async () => {
                      const payload = {
                        name: form.name.trim(),
                        runtimeConfig: {
                          objective: form.objective.trim(),
                          audience: form.audience.trim(),
                          personality: form.personality.trim(),
                          tone: form.tone,
                          greeting: form.greeting.trim(),
                          rules: form.rules,
                          forbiddenTopics: form.forbiddenTopics,
                          additionalInstructions: form.additionalInstructions.trim(),
                          handoffEnabled: form.handoffEnabled,
                          handoffTriggers: form.handoffTriggers,
                          calendarEnabled: form.calendarEnabled,
                          calendarId: form.calendarId || null,
                          calendarPermissions: form.calendarPermissions,
                          includeClientTags: form.includeClientTags,
                          includeFollowUps: form.includeFollowUps,
                          includeKnowledgeBase: form.includeKnowledgeBase,
                        },
                        instanceId: form.instanceId || null,
                        ...(aiConfigured
                          ? { provider: form.provider, model: form.model || null }
                          : {}),
                        replyMode: form.replyMode,
                        allowGroups: form.allowGroups,
                        temperature: Number(form.temperature),
                        maxCompletionTokens: Number(form.maxTokens),
                      };
                      if (editingId) await updateAgent({ id: editingId, ...payload });
                      else await createAgent(payload);
                      resetForm();
                      setEditorOpen(false);
                    },
                    editingId ? "Agente atualizado com sucesso." : "Agente criado com sucesso.",
                  )
                }
              >
                {editingId ? <PencilSimple size={13} /> : <Plus size={13} />}
                {editingId ? "Salvar personalização" : "Criar agente"}
              </button>
            </div>
          </section>
        </div>
      )}
      <section className={`${card(isDarkMode)} mb-4 p-4`} aria-labelledby="knowledge-title">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <BookOpenText size={18} aria-hidden="true" />
            <div>
              <h2 id="knowledge-title" className="text-sm font-semibold">
                Base de conhecimento do workspace
              </h2>
              <p className="mt-1 max-w-2xl text-[10px] text-zinc-500">
                Documentos ficam isolados neste workspace e só entram no contexto de agentes que
                você autorizar.
              </p>
            </div>
          </div>
          {knowledgeEditingId && (
            <button className={buttonClass(isDarkMode)} onClick={resetKnowledgeDocument}>
              <X size={13} aria-hidden="true" /> Cancelar
            </button>
          )}
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)_auto]">
          <input
            className={inputClass(isDarkMode)}
            aria-label="Título do documento"
            placeholder="Título do documento"
            value={knowledgeForm.title}
            onChange={(event) => setKnowledgeForm({ ...knowledgeForm, title: event.target.value })}
          />
          <textarea
            className={`${inputClass(isDarkMode)} min-h-10 py-3`}
            aria-label="Conteúdo do documento"
            placeholder="Conteúdo que o agente pode consultar"
            value={knowledgeForm.content}
            onChange={(event) =>
              setKnowledgeForm({ ...knowledgeForm, content: event.target.value })
            }
          />
          <button
            className={buttonClass(isDarkMode)}
            disabled={knowledgeBusy || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()}
            onClick={saveKnowledgeDocument}
          >
            {knowledgeEditingId ? <PencilSimple size={13} /> : <Plus size={13} />}
            {knowledgeEditingId ? "Salvar" : "Adicionar"}
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {knowledgeDocuments.map((document) => (
            <article
              key={document.id}
              className={`${card(isDarkMode)} flex min-w-0 items-start justify-between gap-3 p-3`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p title={document.title} className="truncate text-xs font-semibold">
                    {document.title}
                  </p>
                  <span className="inbox-feedback-state">
                    {document.active ? "Ativo" : "Pausado"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] text-zinc-500">
                  {document.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className={buttonClass(isDarkMode)}
                  aria-label={`Editar ${document.title}`}
                  onClick={() => editKnowledgeDocument(document)}
                >
                  <PencilSimple size={13} />
                </button>
                <button
                  className={buttonClass(isDarkMode)}
                  aria-label={`Remover ${document.title}`}
                  onClick={() => setPendingKnowledgeDelete(document)}
                >
                  <Trash size={13} />
                </button>
              </div>
            </article>
          ))}
          {!knowledgeDocuments.length && (
            <p className="text-xs text-zinc-500">Nenhum documento cadastrado.</p>
          )}
        </div>
      </section>
      <div className="grid gap-3 xl:grid-cols-2">
        {agents.map((agent) => {
          const assignedInstance = instances.find((instance) => instance.id === agent.instance_id);
          const selected = selectedAgentIds.includes(agent.id);
          return (
            <article
              key={agent.id}
              className={`${card(isDarkMode)} p-4 ${selected ? (isDarkMode ? "ring-1 ring-emerald-400/45" : "ring-1 ring-emerald-600/35") : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      aria-label={`Selecionar agente ${agent.name}`}
                      checked={selected}
                      onCheckedChange={() => toggleAgentSelection(agent.id)}
                    />
                    <Robot size={17} />
                    <p title={agent.name} className="truncate text-sm font-semibold">
                      {agent.name}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {agent.provider === "openrouter" ? "OpenRouter" : "Groq"} ·{" "}
                    {agent.model || "modelo padrão"} · {agent.reply_mode} ·{" "}
                    {agent.instance_id ? "conexão específica" : "todas as conexões"}
                  </p>
                  {agent.instance_id && (
                    <p
                      title={assignedInstance?.instance_name || "conexão indisponível"}
                      className="mt-1 truncate text-[11px] font-medium text-zinc-500"
                    >
                      WhatsApp atribuído:{" "}
                      {assignedInstance?.instance_name || "conexão indisponível"}
                    </p>
                  )}
                </div>
                <button
                  className={`${buttonClass(isDarkMode)} ${agent.enabled ? "text-emerald-500 font-bold" : ""}`}
                  onClick={() =>
                    void run(
                      () => updateAgent({ id: agent.id, enabled: !agent.enabled }),
                      agent.enabled ? "Agente desativado." : "Agente ativado.",
                    )
                  }
                >
                  {agent.enabled ? "Ativo" : "Inativo"}
                </button>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-500">
                {agent.instructions}
              </p>
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <input
                  className={`${inputClass(isDarkMode)} col-span-3`}
                  placeholder="Teste uma mensagem"
                  value={testText[agent.id] || ""}
                  onChange={(e) => setTestText({ ...testText, [agent.id]: e.target.value })}
                />
                <button
                  className={buttonClass(isDarkMode)}
                  disabled={busy || !aiConfigured || !(testText[agent.id] || "").trim()}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void testAgent(agent.id, testText[agent.id] || "")
                      .then((r) => {
                        setTestResult({ ...testResult, [agent.id]: r.text });
                        WhatsAppToast.success("Teste concluído", "Resposta obtida do agente.");
                      })
                      .catch((e) => {
                        setError(e.message);
                        WhatsAppToast.networkError(e.message);
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Testar
                </button>
                <button
                  className={`${buttonClass(isDarkMode)} aspect-square px-3`}
                  onClick={() => editAgent(agent)}
                  title="Editar personalização"
                  aria-label={`Editar agente ${agent.name}`}
                >
                  <PencilSimple size={13} />
                </button>
                <button
                  className={`${buttonClass(isDarkMode)} aspect-square px-3 text-red-500 hover:text-red-600`}
                  onClick={() => handleDeleteAgent(agent)}
                  title="Excluir agente"
                  aria-label={`Excluir agente ${agent.name}`}
                >
                  <Trash size={13} />
                </button>
              </div>
              {testResult[agent.id] && (
                <div className="mt-3 rounded-xl border border-current/5 p-3 text-xs whitespace-pre-wrap">
                  {testResult[agent.id]}
                </div>
              )}
            </article>
          );
        })}
        {!agents.length && <Empty>Nenhum agente configurado.</Empty>}
      </div>
      {runs.length > 0 && (
        <div className={`${card(isDarkMode)} mt-4 p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <UsersThree size={16} />
            <h2 className="text-xs font-semibold">Execuções recentes</h2>
          </div>
          <div className="grid gap-2">
            {runs.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-[10px]">
                <span title={r.input_excerpt || "Sem entrada"} className="truncate text-zinc-500">
                  {r.input_excerpt || "Sem entrada"}
                </span>
                <span
                  className={
                    r.status === "failed"
                      ? "text-red-500"
                      : r.status === "completed"
                        ? "text-emerald-500"
                        : "text-zinc-500"
                  }
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingKnowledgeDelete)}
        title="Remover documento da base?"
        description={`O documento ${pendingKnowledgeDelete?.title || "selecionado"} deixará de estar disponível para os agentes.`}
        confirmLabel="Remover documento"
        destructive
        busy={knowledgeBusy}
        dark={isDarkMode}
        onCancel={() => setPendingKnowledgeDelete(null)}
        onConfirm={() => {
          if (!pendingKnowledgeDelete) return;
          const document = pendingKnowledgeDelete;
          setPendingKnowledgeDelete(null);
          removeKnowledgeDocument(document);
        }}
      />
      {pendingAgentDeleteIds && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingAgentDeleteIds(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-delete-title"
            className={`${card(isDarkMode)} w-full max-w-md p-5 shadow-2xl`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingAgentDeleteIds(null);
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  isDarkMode
                    ? "rounded-xl bg-red-400/10 p-2 text-red-300"
                    : "rounded-xl bg-red-50 p-2 text-red-700"
                }
              >
                <WarningCircle size={20} weight="duotone" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="agent-delete-title" className="text-sm font-semibold">
                  Remover agente{pendingAgentDeleteIds.length > 1 ? "s" : ""}?
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Esta ação remove{" "}
                  {pendingAgentDeleteIds.length > 1
                    ? `${pendingAgentDeleteIds.length} agentes`
                    : "o agente selecionado"}{" "}
                  e não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className={buttonClass(isDarkMode)}
                autoFocus
                onClick={() => setPendingAgentDeleteIds(null)}
              >
                Cancelar
              </button>
              <button
                className={`${buttonClass(isDarkMode)} border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-300`}
                disabled={busy}
                onClick={() => {
                  const ids = pendingAgentDeleteIds;
                  setPendingAgentDeleteIds(null);
                  void run(
                    async () => {
                      for (const id of ids) await deleteAgent(id);
                      setSelectedAgentIds((current) => current.filter((id) => !ids.includes(id)));
                    },
                    ids.length > 1
                      ? "Agentes removidos com sucesso."
                      : "Agente removido com sucesso.",
                  );
                }}
              >
                <Trash size={15} aria-hidden="true" /> Remover
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function monthDays(reference: Date) {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CalendarView({ isDarkMode }: Props) {
  const [calendars, setCalendars] = useState<CalendarConfig[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [agents, setAgents] = useState<AutomationAgent[]>([]);
  const [clients, setClients] = useState<WorkspaceClient[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [form, setForm] = useState({
    calendarId: "",
    title: "",
    startsAt: localDateTime(new Date(Date.now() + 60 * 60 * 1000)),
    endsAt: localDateTime(new Date(Date.now() + 90 * 60 * 1000)),
    leadId: "",
    agentId: "",
  });
  const [calendarForm, setCalendarForm] = useState({
    name: "Agenda principal",
    timezone: "America/Sao_Paulo",
    slotDurationMinutes: "30",
    bufferMinutes: "0",
    dailyCapacity: "20",
  });
  const clientsSynced = useRef(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setError("");
      const [data, agentData, clientData] = await Promise.all([
        loadCalendar(),
        loadAgents(),
        loadClients("", { sync: !clientsSynced.current }).catch(() => ({
          clients: [],
          tags: [],
          canManage: false,
        })),
      ]);
      setCalendars(data.calendars);
      setAppointments(data.appointments);
      setCanManage(data.canManage);
      setAgents(agentData.agents);
      setClients(clientData.clients);
      clientsSynced.current = true;
      setHasLoaded(true);
      const firstCalendar = data.calendars[0];
      if (!form.calendarId && firstCalendar)
        setForm((current) => ({ ...current, calendarId: firstCalendar.id }));
    } catch (errorValue: unknown) {
      const message = errorMessage(errorValue);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setIsLoading(false);
    }
  }, [form.calendarId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useRealtimeRefresh(refresh, [
    "calendar_calendars:change",
    "calendar_appointments:change",
    "crm_leads:change",
    "crm_lead_tags:change",
  ]);

  const selectedAppointments = appointments.filter(
    (appointment) =>
      dayKey(appointment.starts_at) === selectedDay && appointment.status !== "canceled",
  );
  const selectedCalendar =
    calendars.find((calendar) => calendar.id === form.calendarId) ?? calendars[0];
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
      WhatsAppToast.success(success);
    } catch (errorValue: unknown) {
      const message = errorMessage(errorValue);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setBusy(false);
    }
  };

  const editAppointment = (appointment: CalendarAppointment) => {
    setEditingAppointmentId(appointment.id);
    setForm({
      calendarId: appointment.calendar_id,
      title: appointment.title,
      startsAt: localDateTime(new Date(appointment.starts_at)),
      endsAt: localDateTime(new Date(appointment.ends_at)),
      leadId: appointment.lead_id ?? "",
      agentId: appointment.agent_id ?? "",
    });
  };

  const viewState = deriveViewDataState({
    hasData: appointments.length > 0 || calendars.length > 0 || hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && appointments.length === 0 && calendars.length === 0,
  });

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-calendar-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="Calendário"
        description="Agendamentos vinculados a clientes e agentes, com capacidade e conflito controlados."
        isDarkMode={isDarkMode}
        onRefresh={() => void refresh()}
      />
      {error && <ErrorBox text={error} />}
      {viewState === "initial" && <DataSkeleton label="Preparando calendário" columns={2} />}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando calendário...
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className={`${card(isDarkMode)} min-w-0 p-4`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDots size={18} />
              <h2 className="text-sm font-semibold">
                {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </h2>
            </div>
            <div className="flex gap-1">
              <button
                className={buttonClass(isDarkMode)}
                onClick={() =>
                  setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))
                }
              >
                ‹
              </button>
              <button
                className={buttonClass(isDarkMode)}
                onClick={() => {
                  const now = new Date();
                  setMonth(now);
                  setSelectedDay(dayKey(now));
                }}
              >
                Hoje
              </button>
              <button
                className={buttonClass(isDarkMode)}
                onClick={() =>
                  setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))
                }
              >
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => (
              <span key={day} className="py-2 uppercase">
                {day}
              </span>
            ))}
            {monthDays(month).map((date) => {
              const key = dayKey(date);
              const count = appointments.filter(
                (appointment) =>
                  dayKey(appointment.starts_at) === key && appointment.status !== "canceled",
              ).length;
              const outside = date.getMonth() !== month.getMonth();
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={`min-h-16 rounded-xl border p-2 text-left transition-colors ${selectedDay === key ? "border-emerald-500/60 bg-emerald-500/10" : isDarkMode ? "border-white/[0.06] hover:bg-white/[0.04]" : "border-black/[0.06] hover:bg-black/[0.03]"} ${outside ? "opacity-40" : ""}`}
                >
                  <span className="text-xs font-semibold">{date.getDate()}</span>
                  {count > 0 && (
                    <span className="mt-2 block text-[10px] text-emerald-500">{count} ag.</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="grid content-start gap-4">
          <section className={`${card(isDarkMode)} p-4`}>
            <h2 className="text-sm font-semibold">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
              })}
            </h2>
            <p className="mt-1 text-[10px] text-zinc-500">
              {selectedAppointments.length}/{selectedCalendar?.daily_capacity ?? 0} agendamentos
              ativos
            </p>
            <div className="mt-3 grid gap-2">
              {selectedAppointments.map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-current/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p title={appointment.title} className="truncate text-xs font-semibold">
                        {appointment.title}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {new Date(appointment.starts_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {appointment.lead?.name ?? "Cliente não vinculado"}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          className="text-zinc-500 hover:text-zinc-200"
                          title="Remarcar agendamento"
                          aria-label={`Remarcar ${appointment.title}`}
                          onClick={() => editAppointment(appointment)}
                        >
                          <PencilSimple size={15} />
                        </button>
                        <button
                          className="text-red-500"
                          title="Cancelar agendamento"
                          aria-label={`Cancelar ${appointment.title}`}
                          onClick={() =>
                            void run(
                              () => cancelAppointment(appointment.id),
                              "Agendamento cancelado.",
                            )
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!selectedAppointments.length && <Empty>Nenhum agendamento neste dia.</Empty>}
            </div>
          </section>
          {canManage && (
            <section className={`${card(isDarkMode)} grid gap-2 p-4`}>
              <h2 className="text-sm font-semibold">
                {editingAppointmentId ? "Remarcar agendamento" : "Novo agendamento"}
              </h2>
              <input
                className={inputClass(isDarkMode)}
                placeholder="Título do atendimento"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <SurfaceSelect
                isDarkMode={isDarkMode}
                value={form.calendarId || "__choose_calendar__"}
                onValueChange={(calendarId) =>
                  setForm({
                    ...form,
                    calendarId: calendarId === "__choose_calendar__" ? "" : calendarId,
                  })
                }
                placeholder="Calendário"
                ariaLabel="Calendário do agendamento"
              >
                <SelectItem value="__choose_calendar__">Calendário</SelectItem>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </SelectItem>
                ))}
              </SurfaceSelect>
              <input
                className={inputClass(isDarkMode)}
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                aria-label="Início do agendamento"
              />
              <input
                className={inputClass(isDarkMode)}
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                aria-label="Fim do agendamento"
              />
              <SurfaceSelect
                isDarkMode={isDarkMode}
                value={form.leadId || "__no_client__"}
                onValueChange={(leadId) =>
                  setForm({ ...form, leadId: leadId === "__no_client__" ? "" : leadId })
                }
                placeholder="Cliente (opcional)"
                ariaLabel="Cliente do agendamento"
              >
                <SelectItem value="__no_client__">Cliente (opcional)</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name || client.phone_e164 || "Cliente sem nome"}
                  </SelectItem>
                ))}
              </SurfaceSelect>
              <SurfaceSelect
                isDarkMode={isDarkMode}
                value={form.agentId || "__no_agent__"}
                onValueChange={(agentId) =>
                  setForm({ ...form, agentId: agentId === "__no_agent__" ? "" : agentId })
                }
                placeholder="Agente (opcional)"
                ariaLabel="Agente do agendamento"
              >
                <SelectItem value="__no_agent__">Agente (opcional)</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SurfaceSelect>
              <button
                className={buttonClass(isDarkMode)}
                disabled={busy || !form.title.trim() || !form.calendarId}
                onClick={() =>
                  void run(
                    () =>
                      saveAppointment({
                        ...(editingAppointmentId ? { id: editingAppointmentId } : {}),
                        calendarId: form.calendarId,
                        title: form.title.trim(),
                        startsAt: new Date(form.startsAt).toISOString(),
                        endsAt: new Date(form.endsAt).toISOString(),
                        leadId: form.leadId || null,
                        agentId: form.agentId || null,
                      }).then(() => setEditingAppointmentId(null)),
                    editingAppointmentId ? "Agendamento remarcado." : "Agendamento salvo.",
                  )
                }
              >
                {editingAppointmentId ? <Check size={13} /> : <Plus size={13} />}
                {editingAppointmentId ? "Salvar remarcação" : "Agendar"}
              </button>
              {editingAppointmentId && (
                <button
                  className={buttonClass(isDarkMode)}
                  type="button"
                  onClick={() => setEditingAppointmentId(null)}
                >
                  Cancelar edição
                </button>
              )}
            </section>
          )}
          {canManage && !calendars.length && (
            <section className={`${card(isDarkMode)} grid gap-2 p-4`}>
              <h2 className="text-sm font-semibold">Criar calendário</h2>
              <input
                className={inputClass(isDarkMode)}
                value={calendarForm.name}
                onChange={(event) => setCalendarForm({ ...calendarForm, name: event.target.value })}
                placeholder="Nome da agenda"
              />
              <input
                className={inputClass(isDarkMode)}
                value={calendarForm.timezone}
                onChange={(event) =>
                  setCalendarForm({ ...calendarForm, timezone: event.target.value })
                }
                placeholder="Fuso IANA"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className={inputClass(isDarkMode)}
                  type="number"
                  min="5"
                  value={calendarForm.slotDurationMinutes}
                  onChange={(event) =>
                    setCalendarForm({ ...calendarForm, slotDurationMinutes: event.target.value })
                  }
                  aria-label="Duração"
                />
                <input
                  className={inputClass(isDarkMode)}
                  type="number"
                  min="0"
                  value={calendarForm.bufferMinutes}
                  onChange={(event) =>
                    setCalendarForm({ ...calendarForm, bufferMinutes: event.target.value })
                  }
                  aria-label="Intervalo"
                />
                <input
                  className={inputClass(isDarkMode)}
                  type="number"
                  min="1"
                  value={calendarForm.dailyCapacity}
                  onChange={(event) =>
                    setCalendarForm({ ...calendarForm, dailyCapacity: event.target.value })
                  }
                  aria-label="Capacidade diária"
                />
              </div>
              <button
                className={buttonClass(isDarkMode)}
                disabled={busy || !calendarForm.name.trim()}
                onClick={() =>
                  void run(
                    () =>
                      saveCalendar({
                        name: calendarForm.name.trim(),
                        timezone: calendarForm.timezone,
                        slotDurationMinutes: Number(calendarForm.slotDurationMinutes),
                        bufferMinutes: Number(calendarForm.bufferMinutes),
                        dailyCapacity: Number(calendarForm.dailyCapacity),
                        availability: {
                          mon: [["09:00", "18:00"]],
                          tue: [["09:00", "18:00"]],
                          wed: [["09:00", "18:00"]],
                          thu: [["09:00", "18:00"]],
                          fri: [["09:00", "18:00"]],
                        },
                        isDefault: true,
                      }),
                    "Calendário criado.",
                  )
                }
              >
                <Plus size={13} /> Criar calendário
              </button>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

export function ClientsView({ isDarkMode }: Props) {
  const [clients, setClients] = useState<WorkspaceClient[]>([]);
  const [tags, setTags] = useState<ClientTag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", phone: "", email: "" });
  // Loading cached CRM data first keeps the page usable when Evolution is
  // slow or temporarily unavailable. The explicit Atualizar action retries
  // the remote sync.
  const initialSync = useRef(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++requestSequence.current;
      setIsLoading(true);
      try {
        setError("");
        const data = await loadClients(query, {
          sync: initialSync.current,
          ...(signal ? { signal } : {}),
        });
        if (signal?.aborted || sequence !== requestSequence.current) return;
        setClients(data.clients);
        setTags(data.tags);
        setHasLoaded(true);
        if (data.syncWarning) setError(data.syncWarning);
        initialSync.current = false;
      } catch (errorValue: unknown) {
        if (signal?.aborted || sequence !== requestSequence.current) return;
        const message = errorMessage(errorValue);
        setError(message);
        WhatsAppToast.networkError(message);
      } finally {
        if (!signal?.aborted && sequence === requestSequence.current) setIsLoading(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void refresh(controller.signal), 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh]);
  useRealtimeRefresh(
    () => void refresh(),
    ["crm_leads:change", "crm_lead_tags:change", "whatsapp_contacts:change"],
  );

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
      WhatsAppToast.success(success);
    } catch (errorValue: unknown) {
      const message = errorMessage(errorValue);
      setError(message);
      WhatsAppToast.networkError(message);
    } finally {
      setBusy(false);
    }
  };
  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseDelimitedCsv(text);
    const hasHeader =
      /nome|name/i.test(rows[0]?.[0] ?? "") && /telefone|phone/i.test(rows[0]?.[1] ?? "");
    const dataRows = rows.slice(hasHeader ? 1 : 0);
    let imported = 0;
    let skipped = 0;
    await run(async () => {
      validateClientImportCount(dataRows.length);
      const rowsToImport = dataRows;
      // Keep the import responsive without flooding the CRM API. Ten writes
      // at a time is fast enough for a user action and remains rate-limit safe.
      for (let offset = 0; offset < rowsToImport.length; offset += 10) {
        const batch = rowsToImport.slice(offset, offset + 10);
        const results = await Promise.all(
          batch.map(async (row) => {
            const rawPhone = row[1]?.replace(/[^+\d]/g, "") || "";
            const phoneE164 =
              rawPhone && rawPhone.startsWith("+")
                ? rawPhone
                : rawPhone.length >= 8
                  ? `+${rawPhone}`
                  : null;
            try {
              await createLead({
                name: row[0],
                phoneE164,
                email: row[2] || null,
                source: "import",
              });
              return true;
            } catch {
              return false;
            }
          }),
        );
        imported += results.filter(Boolean).length;
        skipped += results.length - results.filter(Boolean).length;
      }
      setImportSummary(
        `${imported} importados${skipped ? ` · ${skipped} ignorados por dados inválidos` : ""}`,
      );
    }, "Importação concluída.");
  };
  const exportCsv = () => {
    const escapeCsv = (value: string | null | undefined) => {
      const normalized = value ?? "";
      return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
    };
    const rows = [
      ["Nome", "Telefone", "E-mail", "Empresa", "Categoria"],
      ...clients.map((client) => [
        client.name,
        client.phone_e164,
        client.email,
        client.company,
        client.contactCategory === "saved_contact"
          ? "Salvo"
          : client.contactCategory === "potential_lead"
            ? "Possível lead"
            : "Manual",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clientes_inboxos_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const viewState = deriveViewDataState({
    hasData: hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && clients.length === 0,
  });
  return (
    <main className="inboxos-page inboxos-product-surface inboxos-clients-surface flex-1 overflow-auto p-4 sm:p-6">
      <Heading
        title="Clientes"
        description="Clientes importados do WhatsApp e leads com tags operacionais."
        isDarkMode={isDarkMode}
        onRefresh={() => {
          initialSync.current = true;
          void refresh();
        }}
      />
      {error && <ErrorBox text={error} />}
      {viewState === "initial" && (
        <DataSkeleton label="Preparando clientes do workspace" columns={2} />
      )}
      {viewState === "refreshing" && (
        <p data-state="refreshing" role="status" className="mb-3 text-xs text-zinc-500">
          Atualizando clientes...
        </p>
      )}
      {importSummary && <p className="mb-3 text-xs text-zinc-500">{importSummary}</p>}
      <div
        className={`${card(isDarkMode)} inboxos-responsive-actions mb-4 grid gap-2 p-3 md:grid-cols-[1fr_auto_auto]`}
      >
        <div className="relative">
          <MagnifyingGlass size={15} className="absolute left-3 top-3 text-zinc-500" />
          <input
            className={`${inputClass(isDarkMode)} w-full pl-9`}
            placeholder="Buscar por nome, telefone, e-mail ou empresa"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className={`${buttonClass(isDarkMode)} cursor-pointer`}>
          <UploadSimple size={13} /> Importar CSV
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          className={buttonClass(isDarkMode)}
          onClick={() => setShowCreate((value) => !value)}
        >
          <UserPlus size={13} /> {showCreate ? "Fechar cadastro" : "Novo cliente"}
        </button>
        <button
          className={buttonClass(isDarkMode)}
          disabled={busy || !clients.length}
          onClick={exportCsv}
        >
          <DownloadSimple size={13} /> Exportar CSV
        </button>
        <button
          className={buttonClass(isDarkMode)}
          disabled={busy || !newTag.trim()}
          onClick={() =>
            void run(async () => {
              const result = await saveClientTag({ name: newTag.trim(), color: "#71717a" });
              setTags((current) => [...current, result.tag]);
              setNewTag("");
            }, "Tag criada.")
          }
        >
          <Tag size={13} /> Criar tag
        </button>
        <input
          className={`${inputClass(isDarkMode)} md:col-span-3`}
          placeholder="Nome da nova tag (use o botão ao lado)"
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
        />
      </div>
      {showCreate && (
        <form
          className={`${card(isDarkMode)} mb-4 grid gap-2 p-3 md:grid-cols-[1.2fr_1fr_1.2fr_auto]`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!newClient.name.trim()) return;
            void run(async () => {
              await createLead({
                name: newClient.name.trim(),
                phoneE164: newClient.phone.trim() || null,
                email: newClient.email.trim() || null,
                source: "manual",
              });
              setNewClient({ name: "", phone: "", email: "" });
              setShowCreate(false);
            }, "Cliente criado.");
          }}
        >
          <input
            className={inputClass(isDarkMode)}
            placeholder="Nome do cliente"
            value={newClient.name}
            onChange={(event) => setNewClient({ ...newClient, name: event.target.value })}
            required
          />
          <input
            className={inputClass(isDarkMode)}
            placeholder="+5511999999999"
            inputMode="tel"
            value={newClient.phone}
            onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })}
          />
          <input
            className={inputClass(isDarkMode)}
            placeholder="cliente@empresa.com"
            type="email"
            value={newClient.email}
            onChange={(event) => setNewClient({ ...newClient, email: event.target.value })}
          />
          <button className={buttonClass(isDarkMode)} disabled={busy || !newClient.name.trim()}>
            <Check size={13} /> Salvar
          </button>
        </form>
      )}
      <div className={`${card(isDarkMode)} mb-4 flex flex-wrap items-center gap-2 p-3`}>
        <span className="text-xs text-zinc-500">{selected.length} selecionado(s)</span>
        {tags.map((tag) => (
          <button
            key={tag.id}
            className={buttonClass(isDarkMode)}
            disabled={busy || !selected.length}
            onClick={() =>
              void run(() => assignClientTags(selected, [tag.id]), `Tag ${tag.name} atribuída.`)
            }
          >
            <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
        {selected.length > 0 && (
          <button className={buttonClass(isDarkMode)} onClick={() => setSelected([])}>
            Limpar seleção
          </button>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {clients.map((client) => {
          const checked = selected.includes(client.id);
          return (
            <article key={client.id} className={`${card(isDarkMode)} flex items-center gap-3 p-3`}>
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) =>
                  setSelected((current) =>
                    nextChecked === true
                      ? [...current, client.id]
                      : current.filter((id) => id !== client.id),
                  )
                }
                aria-label={`Selecionar ${client.name}`}
              />
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-current/10 bg-current/5">
                {client.profilePicUrl ? (
                  <img
                    src={client.profilePicUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <UserCircle className="h-full w-full text-zinc-500" weight="duotone" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p title={client.name} className="truncate text-xs font-semibold">
                  {client.name}
                </p>
                <p
                  title={client.phone_e164 || client.email || "Sem contato"}
                  className="truncate text-[10px] text-zinc-500"
                >
                  {client.phone_e164 || client.email || "Sem contato"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ color: tag.color, backgroundColor: `${tag.color}18` }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[9px] text-zinc-500">
                {client.contactCategory === "saved_contact"
                  ? "Salvo"
                  : client.contactCategory === "potential_lead"
                    ? "Possível lead"
                    : "Manual"}
              </span>
            </article>
          );
        })}
        {viewState === "empty" && <Empty>Nenhum cliente encontrado.</Empty>}
      </div>
    </main>
  );
}
