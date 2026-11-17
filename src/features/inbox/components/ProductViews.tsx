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
  ChatCircleDots,
  PaperPlaneRight,
  Handshake,
  Lifebuoy,
  CalendarCheck,
  PencilSimpleLine,
  CaretRight,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Switch } from "@/components/ui/switch";
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
  className,
  children,
}: {
  isDarkMode: boolean;
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? inputClass(isDarkMode)} aria-label={ariaLabel}>
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

/**
 * Carregamento inicial discreto: uma linha de progresso e o texto do que está
 * sendo preparado. Substitui a grade de blocos cinzas, que parecia conteúdo
 * quebrado. A prop `columns` é mantida por compatibilidade com as telas.
 */
function DataSkeleton({ label }: { label: string; columns?: 2 | 3 | 5 }) {
  return (
    <div
      data-state="initial"
      role="status"
      aria-label={label}
      aria-busy="true"
      className="ux-loading"
    >
      <span className="ux-loading-bar" aria-hidden="true" />
      <span className="ux-meta">{label}...</span>
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

type AgentTemplate = {
  id: string;
  label: string;
  summary: string;
  icon: typeof Handshake;
  preview: Array<{ from: "customer" | "agent"; text: string }>;
  values: Record<string, string | boolean>;
};

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "sales",
    label: "Pré-vendas",
    summary: "Qualifica o contato e leva para uma proposta ou reunião.",
    icon: Handshake,
    preview: [
      { from: "customer", text: "Oi, quanto custa o plano para minha loja?" },
      {
        from: "agent",
        text: "Olá! Depende do tamanho da operação. Quantas pessoas atendem clientes hoje na sua loja?",
      },
      { from: "customer", text: "Somos 4." },
      {
        from: "agent",
        text: "Perfeito. Posso marcar 20 minutos com um consultor para montar a proposta certa para vocês?",
      },
    ],
    values: {
      name: "Pré-vendas",
      objective:
        "Entender a necessidade do contato, responder dúvidas sobre produtos e serviços e conduzir para uma proposta ou reunião com a equipe comercial.",
      audience: "Pessoas interessadas que chegam pelo WhatsApp",
      personality: "Consultiva, objetiva e cordial",
      tone: "professional",
      greeting: "Olá! Obrigado pelo contato. Como posso ajudar?",
      rules:
        "Faça uma pergunta por vez\nNunca invente preços ou prazos\nAo identificar interesse real, ofereça falar com um consultor",
      forbiddenTopics: "Descontos não aprovados\nAssuntos fora do negócio",
    },
  },
  {
    id: "support",
    label: "Suporte",
    summary: "Resolve dúvidas frequentes e chama a equipe quando precisa.",
    icon: Lifebuoy,
    preview: [
      { from: "customer", text: "Não consigo acessar minha conta." },
      {
        from: "agent",
        text: "Sinto muito pelo transtorno. Aparece alguma mensagem de erro quando você tenta entrar?",
      },
      { from: "customer", text: "Diz que a senha está errada." },
      {
        from: "agent",
        text: 'Vamos resolver: toque em "Esqueci minha senha" na tela de login e siga o link enviado ao seu e-mail. Funcionou?',
      },
    ],
    values: {
      name: "Suporte ao cliente",
      objective:
        "Resolver dúvidas frequentes de clientes, orientar passo a passo e transferir para a equipe quando o problema exigir análise.",
      audience: "Clientes atuais",
      personality: "Paciente e clara",
      tone: "empathetic",
      greeting: "Oi! Me conta o que aconteceu que eu te ajudo.",
      rules:
        "Confirme se o problema foi resolvido antes de encerrar\nUse a base de conhecimento como fonte\nSe não souber a resposta, transfira para um atendente",
      forbiddenTopics: "Dados de outros clientes\nPromessas de reembolso",
      includeKnowledgeBase: true,
    },
  },
  {
    id: "scheduling",
    label: "Agendamento",
    summary: "Marca, remarca e cancela horários na sua agenda.",
    icon: CalendarCheck,
    preview: [
      { from: "customer", text: "Queria marcar um horário essa semana." },
      {
        from: "agent",
        text: "Claro! Tenho quinta às 10h, quinta às 15h ou sexta às 9h. Qual fica melhor?",
      },
      { from: "customer", text: "Quinta às 15h." },
      {
        from: "agent",
        text: "Confirmado: quinta-feira, 15h. Te mando um lembrete no dia. Até lá!",
      },
    ],
    values: {
      name: "Agendamentos",
      objective:
        "Ajudar o cliente a marcar, remarcar ou cancelar horários, confirmando data, horário e serviço antes de concluir.",
      audience: "Clientes que querem marcar um horário",
      personality: "Organizada e direta",
      tone: "friendly",
      greeting: "Olá! Quer marcar um horário? Me diz o melhor dia para você.",
      rules:
        "Sempre confirme data e horário antes de agendar\nOfereça no máximo três opções de horário",
      forbiddenTopics: "Diagnósticos ou orientações técnicas",
      calendarEnabled: true,
      calendarPermissions: "read,create,reschedule",
    },
  },
];

type AgentTestMessage = { role: "user" | "agent" | "error"; text: string };

const AGENT_CALENDAR_PERMISSIONS = [
  { value: "read", label: "Consultar horários" },
  { value: "create", label: "Criar agendamentos" },
  { value: "reschedule", label: "Remarcar" },
  { value: "cancel", label: "Cancelar" },
] as const;

const AGENT_TONE_LABEL: Record<string, string> = {
  professional: "Tom profissional",
  friendly: "Tom amigável",
  direct: "Tom direto",
  empathetic: "Tom empático",
};

const AGENT_EDITOR_SECTIONS = [
  { id: "agent-sec-identity", label: "Identificação" },
  { id: "agent-sec-behavior", label: "Comportamento" },
  { id: "agent-sec-replies", label: "Respostas" },
  { id: "agent-sec-handoff", label: "Transferência" },
  { id: "agent-sec-context", label: "Contexto" },
] as const;

const AGENT_RUN_STATUS: Record<string, string> = {
  completed: "Respondida",
  failed: "Falhou",
  running: "Em andamento",
  pending: "Na fila",
  skipped: "Ignorada",
};

function formatRunTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Campo com rótulo visível e dica opcional (declarado fora dos componentes para não remontar). */
function UxField({
  label,
  hint,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ux-field ${className}`}>
      <label className="ux-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="ux-hint">{hint}</p>}
    </div>
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
  const [testThreads, setTestThreads] = useState<Record<string, AgentTestMessage[]>>({});
  const [testAgentId, setTestAgentId] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [knowledgeFormOpen, setKnowledgeFormOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState("sales");
  const [editorSection, setEditorSection] = useState("agent-sec-identity");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [pendingAgentDeleteIds, setPendingAgentDeleteIds] = useState<string[] | null>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorDialogRef = useRef<HTMLDivElement | null>(null);
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
    if (!editorOpen) return;
    requestAnimationFrame(() =>
      editorDialogRef.current?.querySelector<HTMLElement>("input, textarea")?.focus(),
    );
  }, [editorOpen]);

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
    setEditorSection("agent-sec-identity");
    editorTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    resetForm();
    setEditorOpen(false);
    requestAnimationFrame(() => editorTriggerRef.current?.focus());
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
        setKnowledgeFormOpen(false);
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

  const enabledCount = agents.filter((agent) => agent.enabled).length;
  const providerModels =
    aiOptions.find((option) => option.provider === form.provider)?.models || [];
  const calendarPermissionSet = new Set(
    form.calendarPermissions
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const toggleCalendarPermission = (permission: string, on: boolean) => {
    const next = new Set(calendarPermissionSet);
    if (on) next.add(permission);
    else next.delete(permission);
    setForm({
      ...form,
      calendarPermissions: AGENT_CALENDAR_PERMISSIONS.map((item) => item.value)
        .filter((value) => next.has(value))
        .join(","),
    });
  };
  const testingAgent = agents.find((agent) => agent.id === testAgentId) ?? null;
  const testThread = testingAgent ? testThreads[testingAgent.id] || [] : [];
  const testDraft = testingAgent ? testText[testingAgent.id] || "" : "";

  const sendTest = () => {
    if (!testingAgent || !testDraft.trim() || testBusy) return;
    const agentId = testingAgent.id;
    const prompt = testDraft.trim();
    setTestText({ ...testText, [agentId]: "" });
    setTestThreads((current) => ({
      ...current,
      [agentId]: [...(current[agentId] || []), { role: "user", text: prompt }],
    }));
    setTestBusy(true);
    void testAgent(agentId, prompt)
      .then((r) =>
        setTestThreads((current) => ({
          ...current,
          [agentId]: [...(current[agentId] || []), { role: "agent", text: r.text }],
        })),
      )
      .catch((e: unknown) =>
        setTestThreads((current) => ({
          ...current,
          [agentId]: [...(current[agentId] || []), { role: "error", text: errorMessage(e) }],
        })),
      )
      .finally(() => setTestBusy(false));
  };

  const saveAgent = () =>
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
          ...(aiConfigured ? { provider: form.provider, model: form.model || null } : {}),
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
    );

  const startNewAgent = (trigger: HTMLElement) => {
    resetForm();
    openEditor(trigger);
  };

  const startFromTemplate = (template: AgentTemplate, trigger: HTMLElement) => {
    resetForm();
    setForm((current) => ({ ...current, ...template.values }));
    openEditor(trigger);
  };

  const closeKnowledgeForm = () => {
    resetKnowledgeDocument();
    setKnowledgeFormOpen(false);
  };

  const canSaveAgent = Boolean(form.name.trim() && form.objective.trim());
  const connectedInstances = instances.filter((instance) => instance.status === "open").length;
  const automaticCount = agents.filter(
    (agent) => agent.enabled && agent.reply_mode === "automatic",
  ).length;

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-agents-surface ux-page flex-1 overflow-auto">
      <div className="ux-container">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1">Agentes</h1>
            <p className="ux-lead">
              Assistentes de IA que respondem no WhatsApp com o objetivo, o tom e os limites que
              você definir.
            </p>
          </div>
          <div className="ux-actions">
            <button
              type="button"
              className="ux-icon-btn"
              onClick={() => void refresh()}
              aria-label="Atualizar dados de Agentes"
              title="Atualizar"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ux-btn ux-btn--primary"
              onClick={(event) => startNewAgent(event.currentTarget)}
            >
              <Plus size={16} aria-hidden="true" /> Novo agente
            </button>
          </div>
        </header>

        {viewState === "initial" && <DataSkeleton label="Preparando agentes" columns={2} />}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando agentes...
          </p>
        )}
        {error && <ErrorBox text={error} />}
        {!aiConfigured && hasLoaded && (
          <div className="inbox-feedback inbox-feedback-warning" role="status">
            <WarningCircle size={18} weight="duotone" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="inbox-feedback-title">Respostas automáticas desativadas</p>
                <span className="inbox-feedback-state">Desativado</span>
              </div>
              <p className="inbox-feedback-description">
                Um administrador precisa configurar o provedor de IA no ADM. Você já pode criar e
                salvar agentes enquanto isso.
              </p>
            </div>
          </div>
        )}

        {hasLoaded && (
          <div className="ux-layout-rail">
            <section className="ux-panel" aria-labelledby="agents-list-title">
              <div className="ux-panel-head">
                <div className="flex min-w-0 items-baseline gap-3">
                  <h2 id="agents-list-title" className="ux-h2">
                    Seus agentes
                  </h2>
                  {agents.length > 0 && (
                    <span className="ux-meta">
                      {enabledCount} de {agents.length} {agents.length === 1 ? "ativo" : "ativos"}
                    </span>
                  )}
                </div>
                {selectedAgentIds.length > 0 && (
                  <div className="ux-bulk" aria-live="polite">
                    <span>
                      {selectedAgentIds.length}{" "}
                      {selectedAgentIds.length === 1 ? "selecionado" : "selecionados"}
                    </span>
                    <button
                      type="button"
                      className="ux-btn ux-btn--ghost"
                      onClick={() => setSelectedAgentIds([])}
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      className="ux-btn ux-btn--danger"
                      disabled={busy}
                      onClick={() => setPendingAgentDeleteIds(selectedAgentIds)}
                    >
                      <Trash size={16} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                )}
              </div>

              {agents.length === 0 ? (
                <div className="ux-onboard">
                  <div className="ux-onboard-intro">
                    <p className="ux-h3">Crie seu primeiro agente</p>
                    <p>
                      Escolha um modelo para ver como ele conversa. Todo agente começa em modo de
                      teste: nada é enviado a clientes até você ligar a resposta automática.
                    </p>
                    <div
                      className="ux-template-list"
                      role="radiogroup"
                      aria-label="Modelos de agente"
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                        event.preventDefault();
                        const index = AGENT_TEMPLATES.findIndex(
                          (item) => item.id === previewTemplateId,
                        );
                        const step = event.key === "ArrowDown" ? 1 : -1;
                        const next =
                          AGENT_TEMPLATES[
                            (index + step + AGENT_TEMPLATES.length) % AGENT_TEMPLATES.length
                          ];
                        if (!next) return;
                        setPreviewTemplateId(next.id);
                        requestAnimationFrame(() =>
                          document.getElementById(`agent-template-${next.id}`)?.focus(),
                        );
                      }}
                    >
                      {AGENT_TEMPLATES.map((template) => {
                        const Icon = template.icon;
                        const selected = previewTemplateId === template.id;
                        return (
                          <button
                            key={template.id}
                            id={`agent-template-${template.id}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            tabIndex={selected ? 0 : -1}
                            className="ux-template"
                            data-active={selected}
                            onClick={() => setPreviewTemplateId(template.id)}
                            onDoubleClick={(event) =>
                              startFromTemplate(template, event.currentTarget)
                            }
                          >
                            <span className="ux-template-icon" aria-hidden="true">
                              <Icon size={18} />
                            </span>
                            <span className="ux-template-text">
                              <strong>{template.label}</strong>
                              <small>{template.summary}</small>
                            </span>
                            <span className="ux-template-check" aria-hidden="true">
                              <Check size={14} weight="bold" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="ux-btn ux-btn--ghost justify-self-start"
                      onClick={(event) => startNewAgent(event.currentTarget)}
                    >
                      <PencilSimpleLine size={16} aria-hidden="true" /> Começar do zero
                    </button>
                  </div>
                  <div className="ux-preview" aria-live="polite">
                    <div className="ux-preview-head">
                      <span className="ux-meta">Exemplo de conversa</span>
                      <span className="ux-pill">
                        {AGENT_TEMPLATES.find((item) => item.id === previewTemplateId)?.label}
                      </span>
                    </div>
                    <div className="ux-preview-thread" key={previewTemplateId}>
                      {(
                        AGENT_TEMPLATES.find((item) => item.id === previewTemplateId)?.preview || []
                      ).map((message, index) => (
                        <div
                          key={index}
                          className="ux-bubble"
                          data-role={message.from === "agent" ? "out" : "in"}
                          style={{ animationDelay: `${index * 90}ms` }}
                        >
                          {message.text}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ux-btn ux-btn--primary w-full"
                      onClick={(event) => {
                        const template = AGENT_TEMPLATES.find(
                          (item) => item.id === previewTemplateId,
                        );
                        if (template) startFromTemplate(template, event.currentTarget);
                      }}
                    >
                      Usar modelo{" "}
                      {AGENT_TEMPLATES.find((item) => item.id === previewTemplateId)?.label}
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="ux-list">
                  {agents.map((agent) => {
                    const assignedInstance = instances.find(
                      (instance) => instance.id === agent.instance_id,
                    );
                    const selected = selectedAgentIds.includes(agent.id);
                    const automatic = agent.reply_mode === "automatic";
                    const instanceFallback = agent.instance_id
                      ? "Conexão indisponível"
                      : "Todas as conexões";
                    const agentConfig = isAgentRuntimeConfig(agent.runtime_config)
                      ? agent.runtime_config
                      : null;
                    const agentObjective = agentConfig?.objective || agent.instructions;
                    const agentRuns = runs.filter((item) => item.agent_id === agent.id);
                    const lastRun = agentRuns[0];
                    return (
                      <li key={agent.id} className="ux-row" data-selected={selected}>
                        <Checkbox
                          aria-label={`Selecionar agente ${agent.name}`}
                          checked={selected}
                          onCheckedChange={() => toggleAgentSelection(agent.id)}
                        />
                        <div className="ux-row-main">
                          <div className="ux-row-title">
                            <p title={agent.name} className="truncate ux-strong">
                              {agent.name}
                            </p>
                            <span
                              className="ux-pill"
                              data-tone={automatic ? "positive" : undefined}
                            >
                              {automatic ? "Responde sozinho" : "Só teste"}
                            </span>
                          </div>
                          <p
                            title={assignedInstance?.instance_name || instanceFallback}
                            className="truncate ux-meta"
                          >
                            {assignedInstance?.instance_name || instanceFallback}
                            {" · "}
                            {AGENT_TONE_LABEL[agentConfig?.tone || ""] || "Tom profissional"}
                            {" · "}
                            {agent.model || "Modelo padrão"}
                            {agent.allow_groups ? " · responde em grupos" : ""}
                          </p>
                          {agentObjective && (
                            <p className="ux-row-detail line-clamp-1">{agentObjective}</p>
                          )}
                          <p className="ux-meta">
                            {agentRuns.length
                              ? `${agentRuns.length} ${agentRuns.length === 1 ? "resposta recente" : "respostas recentes"} · última em ${formatRunTime(lastRun?.started_at || "")}`
                              : "Sem respostas ainda"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="ux-btn ux-btn--ghost hidden sm:inline-flex"
                            onClick={() => setTestAgentId(agent.id)}
                          >
                            <ChatCircleDots size={16} aria-hidden="true" /> Testar
                          </button>
                          <button
                            type="button"
                            className="ux-icon-btn sm:hidden"
                            onClick={() => setTestAgentId(agent.id)}
                            aria-label={`Testar agente ${agent.name}`}
                          >
                            <ChatCircleDots size={18} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="ux-icon-btn"
                            onClick={() => editAgent(agent)}
                            aria-label={`Editar agente ${agent.name}`}
                            title="Editar"
                          >
                            <PencilSimple size={18} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="ux-icon-btn ux-icon-btn--danger"
                            onClick={() => handleDeleteAgent(agent)}
                            aria-label={`Excluir agente ${agent.name}`}
                            title="Excluir"
                          >
                            <Trash size={18} aria-hidden="true" />
                          </button>
                          <Switch
                            className="ux-switch ml-2"
                            checked={agent.enabled}
                            disabled={busy}
                            aria-label={`${agent.enabled ? "Desativar" : "Ativar"} agente ${agent.name}`}
                            onCheckedChange={(checked) =>
                              void run(
                                () => updateAgent({ id: agent.id, enabled: checked }),
                                checked ? "Agente ativado." : "Agente desativado.",
                              )
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <aside className="ux-rail" aria-label="Resumo dos agentes">
              <section className="ux-panel" aria-labelledby="agent-status-title">
                <div className="ux-panel-head">
                  <h2 id="agent-status-title" className="ux-h2">
                    Status
                  </h2>
                </div>
                <dl className="ux-stats">
                  <div>
                    <dt>Provedor de IA</dt>
                    <dd>
                      <span
                        className="ux-dot"
                        data-tone={aiConfigured ? "positive" : "warning"}
                        aria-hidden="true"
                      />
                      {aiConfigured ? "Configurado" : "Pendente no ADM"}
                    </dd>
                  </div>
                  <div>
                    <dt>Conexões do WhatsApp</dt>
                    <dd>
                      <span
                        className="ux-dot"
                        data-tone={connectedInstances > 0 ? "positive" : "warning"}
                        aria-hidden="true"
                      />
                      {connectedInstances} de {instances.length} conectadas
                    </dd>
                  </div>
                  <div>
                    <dt>Agentes ativos</dt>
                    <dd>
                      {enabledCount} de {agents.length}
                    </dd>
                  </div>
                  <div>
                    <dt>Respondendo sozinhos</dt>
                    <dd>{automaticCount}</dd>
                  </div>
                </dl>
              </section>
              <section className="ux-panel" aria-labelledby="knowledge-title">
                <div className="ux-panel-head">
                  <div className="min-w-0">
                    <h2 id="knowledge-title" className="ux-h2">
                      Base de conhecimento
                    </h2>
                    <p className="ux-meta">
                      Textos que os agentes podem consultar. Ficam só neste workspace.
                    </p>
                  </div>
                  {!knowledgeFormOpen && !knowledgeEditingId && (
                    <button
                      type="button"
                      className="ux-btn"
                      onClick={() => setKnowledgeFormOpen(true)}
                    >
                      <Plus size={16} aria-hidden="true" /> Adicionar
                    </button>
                  )}
                </div>
                {(knowledgeFormOpen || knowledgeEditingId) && (
                  <div className="ux-panel-body grid gap-3">
                    <label className="ux-field">
                      <span className="ux-label">Título</span>
                      <input
                        className="ux-input"
                        aria-label="Título do documento"
                        placeholder="Ex.: Política de trocas"
                        value={knowledgeForm.title}
                        onChange={(event) =>
                          setKnowledgeForm({ ...knowledgeForm, title: event.target.value })
                        }
                      />
                    </label>
                    <label className="ux-field">
                      <span className="ux-label">Conteúdo</span>
                      <textarea
                        className="ux-input"
                        aria-label="Conteúdo do documento"
                        placeholder="Cole aqui o texto que o agente pode usar nas respostas"
                        value={knowledgeForm.content}
                        onChange={(event) =>
                          setKnowledgeForm({ ...knowledgeForm, content: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="ux-btn ux-btn--ghost"
                        onClick={closeKnowledgeForm}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="ux-btn"
                        disabled={
                          knowledgeBusy ||
                          !knowledgeForm.title.trim() ||
                          !knowledgeForm.content.trim()
                        }
                        onClick={saveKnowledgeDocument}
                      >
                        {knowledgeEditingId ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          <Plus size={16} aria-hidden="true" />
                        )}
                        {knowledgeEditingId ? "Salvar documento" : "Adicionar documento"}
                      </button>
                    </div>
                  </div>
                )}
                {knowledgeDocuments.length > 0 ? (
                  <ul className="ux-list border-t border-[var(--ux-line)]">
                    {knowledgeDocuments.map((document) => (
                      <li key={document.id} className="ux-row">
                        <BookOpenText
                          size={18}
                          className="shrink-0 text-[var(--ux-subtle)]"
                          aria-hidden="true"
                        />
                        <div className="ux-row-main">
                          <div className="ux-row-title">
                            <p title={document.title} className="truncate ux-strong">
                              {document.title}
                            </p>
                            {!document.active && <span className="ux-pill">Pausado</span>}
                          </div>
                          <p className="line-clamp-1 ux-meta">{document.content}</p>
                        </div>
                        <button
                          type="button"
                          className="ux-icon-btn"
                          aria-label={`Editar ${document.title}`}
                          onClick={() => editKnowledgeDocument(document)}
                        >
                          <PencilSimple size={18} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="ux-icon-btn ux-icon-btn--danger"
                          aria-label={`Remover ${document.title}`}
                          onClick={() => setPendingKnowledgeDelete(document)}
                        >
                          <Trash size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ux-meta border-t border-[var(--ux-line)] px-[18px] py-4">
                    Nenhum documento cadastrado.
                  </p>
                )}
              </section>

              <section className="ux-panel" aria-labelledby="agent-runs-title">
                <div className="ux-panel-head">
                  <div className="min-w-0">
                    <h2 id="agent-runs-title" className="ux-h2">
                      Atividade recente
                    </h2>
                    <p className="ux-meta">Últimas respostas geradas pelos agentes.</p>
                  </div>
                </div>
                {runs.length > 0 ? (
                  <ul className="ux-list">
                    {runs.slice(0, 8).map((r) => {
                      const runAgent = agents.find((agent) => agent.id === r.agent_id);
                      const tone =
                        r.status === "failed"
                          ? "danger"
                          : r.status === "completed"
                            ? "positive"
                            : "warning";
                      return (
                        <li key={r.id} className="ux-row">
                          <span className="ux-dot" data-tone={tone} aria-hidden="true" />
                          <div className="ux-row-main">
                            <span
                              title={r.input_excerpt || "Sem entrada"}
                              className="truncate text-[13px] text-[var(--ux-ink)]"
                            >
                              {r.input_excerpt || "Sem entrada"}
                            </span>
                            <span className="ux-meta truncate">
                              {AGENT_RUN_STATUS[r.status] || r.status}
                              {runAgent ? ` · ${runAgent.name}` : ""} ·{" "}
                              {formatRunTime(r.started_at)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="ux-meta px-[18px] py-4">
                    Nenhuma execução ainda. Use "Testar" para ver como um agente responde.
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>

      <DialogPrimitive.Root
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            ref={editorDialogRef}
            className={`ux-drawer`}
            aria-describedby="agent-editor-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title id="agent-editor-title" className="ux-h2">
                  {editingId ? "Editar agente" : "Novo agente"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="agent-editor-description" className="ux-meta">
                  As respostas seguem o objetivo, o tom e os limites definidos aqui.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar editor de agente">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <nav className="ux-tabs" aria-label="Seções do agente">
              {AGENT_EDITOR_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="ux-tab"
                  aria-current={editorSection === section.id ? "true" : undefined}
                  onClick={() => {
                    setEditorSection(section.id);
                    document
                      .getElementById(section.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {section.label}
                </button>
              ))}
            </nav>
            <div
              className="ux-drawer-body"
              onScroll={(event) => {
                const body = event.currentTarget;
                const top = body.getBoundingClientRect().top;
                let current: string = AGENT_EDITOR_SECTIONS[0].id;
                for (const section of AGENT_EDITOR_SECTIONS) {
                  const node = document.getElementById(section.id);
                  if (node && node.getBoundingClientRect().top - top <= 96) current = section.id;
                }
                if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) {
                  current = "agent-sec-context";
                }
                if (current !== editorSection) setEditorSection(current);
              }}
            >
              <section className="ux-section" id="agent-sec-identity">
                <div className="ux-section-head">
                  <h3 className="ux-h3">Identificação</h3>
                  <p className="ux-meta">Nome interno e onde o agente atua.</p>
                </div>
                <div className="ux-form-grid">
                  <UxField label="Nome" htmlFor="agent-name">
                    <input
                      id="agent-name"
                      className="ux-input"
                      placeholder="Ex.: Pré-vendas"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Conexão do WhatsApp">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
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
                          {i.instance_name}
                          {i.status === "open" ? "" : " (desconectada)"}
                        </SelectItem>
                      ))}
                    </SurfaceSelect>
                  </UxField>
                  <UxField label="Provedor de IA">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
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
                  </UxField>
                  <UxField label="Modelo">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
                      ariaLabel="Modelo de IA autorizado"
                      value={form.model || "__administrator_default__"}
                      disabled={!providerModels.length}
                      onValueChange={(model) =>
                        setForm({
                          ...form,
                          model: model === "__administrator_default__" ? "" : model,
                        })
                      }
                      placeholder="Modelo de IA autorizado"
                    >
                      <SelectItem value="__administrator_default__">
                        Padrão do administrador
                      </SelectItem>
                      {providerModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SurfaceSelect>
                  </UxField>
                </div>
              </section>

              <section className="ux-section" id="agent-sec-behavior">
                <div className="ux-section-head">
                  <h3 className="ux-h3">Comportamento</h3>
                  <p className="ux-meta">O que o agente busca e como ele conversa.</p>
                </div>
                <div className="ux-form-grid">
                  <UxField
                    label="Objetivo"
                    htmlFor="agent-objective"
                    hint="Obrigatório. Ex.: qualificar o contato e agendar uma demonstração."
                    className="ux-span-2"
                  >
                    <textarea
                      id="agent-objective"
                      className="ux-input"
                      aria-label="Objetivo principal do agente"
                      value={form.objective}
                      onChange={(e) => setForm({ ...form, objective: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Público atendido" htmlFor="agent-audience">
                    <input
                      id="agent-audience"
                      className="ux-input"
                      aria-label="Público do agente"
                      placeholder="Ex.: donos de pequenas clínicas"
                      value={form.audience}
                      onChange={(e) => setForm({ ...form, audience: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Personalidade" htmlFor="agent-personality">
                    <input
                      id="agent-personality"
                      className="ux-input"
                      aria-label="Personalidade do agente"
                      placeholder="Ex.: consultiva e objetiva"
                      value={form.personality}
                      onChange={(e) => setForm({ ...form, personality: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Tom de voz">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
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
                  </UxField>
                  <UxField label="Saudação inicial" htmlFor="agent-greeting">
                    <input
                      id="agent-greeting"
                      className="ux-input"
                      aria-label="Saudação inicial"
                      placeholder="Ex.: Olá! Como posso ajudar?"
                      value={form.greeting}
                      onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Regras obrigatórias" htmlFor="agent-rules" hint="Uma por linha.">
                    <textarea
                      id="agent-rules"
                      className="ux-input"
                      aria-label="Regras obrigatórias"
                      value={form.rules}
                      onChange={(e) => setForm({ ...form, rules: e.target.value })}
                    />
                  </UxField>
                  <UxField
                    label="Assuntos proibidos"
                    htmlFor="agent-forbidden"
                    hint="Um por linha."
                  >
                    <textarea
                      id="agent-forbidden"
                      className="ux-input"
                      aria-label="Assuntos proibidos"
                      value={form.forbiddenTopics}
                      onChange={(e) => setForm({ ...form, forbiddenTopics: e.target.value })}
                    />
                  </UxField>
                  <UxField
                    label="Instruções adicionais"
                    htmlFor="agent-extra"
                    hint="Opcional."
                    className="ux-span-2"
                  >
                    <textarea
                      id="agent-extra"
                      className="ux-input"
                      aria-label="Instruções adicionais"
                      value={form.additionalInstructions}
                      onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })}
                    />
                  </UxField>
                </div>
              </section>

              <section className="ux-section" id="agent-sec-replies">
                <div className="ux-section-head">
                  <h3 className="ux-h3">Respostas</h3>
                  <p className="ux-meta">Quando e como o agente responde.</p>
                </div>
                <div className="ux-form-grid">
                  <UxField
                    label="Modo"
                    hint={
                      form.replyMode === "automatic"
                        ? "Responde clientes reais assim que uma mensagem chega."
                        : "Nada é enviado a clientes. Use para testar."
                    }
                    className="ux-span-2"
                  >
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
                      value={form.replyMode}
                      onValueChange={(replyMode) => setForm({ ...form, replyMode })}
                      placeholder="Modo de resposta"
                      ariaLabel="Modo de resposta"
                    >
                      <SelectItem value="manual">Só teste</SelectItem>
                      <SelectItem value="automatic">Responder automaticamente</SelectItem>
                    </SurfaceSelect>
                  </UxField>
                  <UxField
                    label="Criatividade"
                    htmlFor="agent-temperature"
                    hint="0 = mais previsível, 1 = mais variado. Recomendado: 0,3."
                  >
                    <input
                      id="agent-temperature"
                      className="ux-input"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                    />
                  </UxField>
                  <UxField
                    label="Tamanho máximo da resposta"
                    htmlFor="agent-max-tokens"
                    hint="Em tokens. 700 equivale a uns 3 parágrafos."
                  >
                    <input
                      id="agent-max-tokens"
                      className="ux-input"
                      type="number"
                      min="64"
                      max="8192"
                      value={form.maxTokens}
                      onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                    />
                  </UxField>
                  <label className="ux-check ux-span-2" htmlFor="agent-allow-groups">
                    <Checkbox
                      id="agent-allow-groups"
                      checked={form.allowGroups}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, allowGroups: checked === true })
                      }
                    />
                    <span>
                      Responder em grupos
                      <small className="ux-hint">
                        Por padrão o agente só responde conversas individuais.
                      </small>
                    </span>
                  </label>
                </div>
              </section>

              <section className="ux-section" id="agent-sec-handoff">
                <div className="ux-section-head">
                  <h3 className="ux-h3">Transferência para humano</h3>
                  <p className="ux-meta">O agente para e chama a equipe quando o cliente pedir.</p>
                </div>
                <label className="ux-check" htmlFor="agent-handoff-enabled">
                  <Checkbox
                    id="agent-handoff-enabled"
                    checked={form.handoffEnabled}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, handoffEnabled: checked === true })
                    }
                  />
                  <span>Transferir para atendimento humano</span>
                </label>
                <UxField
                  label="Frases que acionam a transferência"
                  htmlFor="agent-handoff-triggers"
                  hint="Separe por vírgula."
                >
                  <input
                    id="agent-handoff-triggers"
                    className="ux-input"
                    aria-label="Gatilhos de atendimento humano"
                    placeholder="falar com humano, atendente"
                    disabled={!form.handoffEnabled}
                    value={form.handoffTriggers}
                    onChange={(e) => setForm({ ...form, handoffTriggers: e.target.value })}
                  />
                </UxField>
              </section>

              <section className="ux-section" id="agent-sec-context">
                <div className="ux-section-head">
                  <h3 className="ux-h3">Contexto e agenda</h3>
                  <p className="ux-meta">Informações extras que o agente pode usar.</p>
                </div>
                <div className="grid gap-1">
                  <label className="ux-check" htmlFor="agent-client-tags">
                    <Checkbox
                      id="agent-client-tags"
                      checked={form.includeClientTags}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeClientTags: checked === true })
                      }
                    />
                    <span>Tags do cliente</span>
                  </label>
                  <label className="ux-check" htmlFor="agent-follow-ups">
                    <Checkbox
                      id="agent-follow-ups"
                      checked={form.includeFollowUps}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeFollowUps: checked === true })
                      }
                    />
                    <span>Follow-ups pendentes</span>
                  </label>
                  <label className="ux-check" htmlFor="agent-knowledge-base">
                    <Checkbox
                      id="agent-knowledge-base"
                      checked={form.includeKnowledgeBase}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, includeKnowledgeBase: checked === true })
                      }
                    />
                    <span>
                      Base de conhecimento
                      <small className="ux-hint">
                        {knowledgeDocuments.filter((document) => document.active).length}{" "}
                        documento(s) ativo(s) neste workspace.
                      </small>
                    </span>
                  </label>
                  <label className="ux-check" htmlFor="agent-calendar-enabled">
                    <Checkbox
                      id="agent-calendar-enabled"
                      checked={form.calendarEnabled}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, calendarEnabled: checked === true })
                      }
                    />
                    <span>Consultar e gerenciar agendamentos</span>
                  </label>
                </div>
                {form.calendarEnabled && (
                  <div className="ux-form-grid">
                    <UxField label="Calendário">
                      <SurfaceSelect
                        isDarkMode={isDarkMode}
                        className="ux-input"
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
                    </UxField>
                    <div className="ux-field" role="group" aria-label="Permissões de calendário">
                      <span className="ux-label">O agente pode</span>
                      <div className="grid grid-cols-2 gap-x-3">
                        {AGENT_CALENDAR_PERMISSIONS.map((permission) => (
                          <label
                            key={permission.value}
                            className="ux-check"
                            htmlFor={`agent-calendar-${permission.value}`}
                          >
                            <Checkbox
                              id={`agent-calendar-${permission.value}`}
                              checked={calendarPermissionSet.has(permission.value)}
                              onCheckedChange={(checked) =>
                                toggleCalendarPermission(permission.value, checked === true)
                              }
                            />
                            <span>{permission.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="ux-drawer-foot">
              <p className="ux-meta">
                {canSaveAgent ? "" : "Preencha nome e objetivo para salvar."}
              </p>
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="button"
                  className="ux-btn ux-btn--primary"
                  disabled={busy || !canSaveAgent}
                  onClick={saveAgent}
                >
                  {editingId ? "Salvar alterações" : "Criar agente"}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={Boolean(testingAgent)}
        onOpenChange={(open) => {
          if (!open) setTestAgentId(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className={`ux-drawer ux-drawer--narrow`}
            aria-describedby="agent-test-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2 truncate">
                  Testar {testingAgent?.name}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="agent-test-description" className="ux-meta">
                  Simula a primeira mensagem de um cliente. Nada é enviado no WhatsApp.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar teste do agente">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <div className="ux-drawer-body">
              <div className="ux-thread" aria-live="polite">
                {testThread.length === 0 && (
                  <p className="ux-meta">
                    Escreva como um cliente escreveria. Cada mensagem é avaliada sem o histórico das
                    anteriores.
                  </p>
                )}
                {testThread.map((message, index) => (
                  <div key={index} className="ux-bubble" data-role={message.role}>
                    {message.text}
                  </div>
                ))}
                {testBusy && (
                  <div className="ux-bubble ux-meta" data-role="agent">
                    Gerando resposta...
                  </div>
                )}
              </div>
            </div>
            <form
              className="ux-composer"
              onSubmit={(event) => {
                event.preventDefault();
                sendTest();
              }}
            >
              <input
                className="ux-input"
                aria-label="Mensagem de teste"
                placeholder={
                  aiConfigured ? "Ex.: Vocês atendem no sábado?" : "Provedor de IA não configurado"
                }
                disabled={!aiConfigured}
                value={testDraft}
                onChange={(e) =>
                  testingAgent && setTestText({ ...testText, [testingAgent.id]: e.target.value })
                }
              />
              <button
                type="submit"
                className="ux-btn ux-btn--primary"
                disabled={!aiConfigured || testBusy || !testDraft.trim()}
                aria-label="Enviar mensagem de teste"
              >
                <PaperPlaneRight size={16} aria-hidden="true" />
              </button>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

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
      <ConfirmDialog
        open={Boolean(pendingAgentDeleteIds)}
        title={(pendingAgentDeleteIds?.length || 0) > 1 ? "Excluir agentes?" : "Excluir agente?"}
        description={`${
          (pendingAgentDeleteIds?.length || 0) > 1
            ? `${pendingAgentDeleteIds?.length} agentes serão excluídos`
            : "O agente será excluído"
        } e deixará de responder. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        busy={busy}
        dark={isDarkMode}
        onCancel={() => setPendingAgentDeleteIds(null)}
        onConfirm={() => {
          const ids = pendingAgentDeleteIds;
          if (!ids) return;
          setPendingAgentDeleteIds(null);
          void run(
            async () => {
              for (const id of ids) await deleteAgent(id);
              setSelectedAgentIds((current) => current.filter((id) => !ids.includes(id)));
            },
            ids.length > 1 ? "Agentes excluídos." : "Agente excluído.",
          );
        }}
      />
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
