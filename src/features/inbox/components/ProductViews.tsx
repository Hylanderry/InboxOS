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
  DotsThree,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  updateStage,
  deleteStage,
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

const NUMBER_FORMAT = new Intl.NumberFormat("pt-BR");

type DashboardTarget = "inbox" | "follow-up" | "conexoes" | "agentes";
type AttentionItem = {
  id: string;
  tone: "danger" | "warning" | undefined;
  title: string;
  description: string;
  action: string;
  view: DashboardTarget;
};

export function DashboardView(_props: Props) {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const navigate = useNavigate();
  const go = (view: DashboardTarget) => void navigate({ to: "/", search: { view } });

  const refresh = useCallback(() => {
    setError("");
    setIsLoading(true);
    void loadDashboard()
      .then((x) => {
        setData(x.metrics);
        setUpdatedAt(new Date());
      })
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

  const viewState = deriveViewDataState({
    hasData: Boolean(data),
    isLoading,
    hasError: Boolean(error),
    isEmpty: false,
  });

  const attention: AttentionItem[] = [];
  if (data) {
    const disconnected = data.totalInstances - data.connectedInstances;
    if (data.totalInstances === 0) {
      attention.push({
        id: "no-number",
        tone: "warning",
        title: "Nenhum número do WhatsApp conectado",
        description: "Conecte um número para receber e responder conversas.",
        action: "Conectar número",
        view: "conexoes",
      });
    } else if (disconnected > 0) {
      attention.push({
        id: "disconnected",
        tone: "danger",
        title: `${disconnected} ${disconnected === 1 ? "número desconectado" : "números desconectados"}`,
        description: "Mensagens desses números não chegam até reconectar.",
        action: "Ver conexões",
        view: "conexoes",
      });
    }
    if (data.unread > 0) {
      attention.push({
        id: "unread",
        tone: "warning",
        title: `${NUMBER_FORMAT.format(data.unread)} ${data.unread === 1 ? "mensagem não lida" : "mensagens não lidas"}`,
        description: "Clientes aguardando resposta no Inbox.",
        action: "Abrir Inbox",
        view: "inbox",
      });
    }
    if (data.overdueFollowUps > 0) {
      attention.push({
        id: "overdue",
        tone: "danger",
        title: `${data.overdueFollowUps} ${data.overdueFollowUps === 1 ? "follow-up atrasado" : "follow-ups atrasados"}`,
        description: "Tarefas que passaram do prazo combinado.",
        action: "Ver follow-ups",
        view: "follow-up",
      });
    }
    if (data.enabledAgents === 0) {
      attention.push({
        id: "agents",
        tone: undefined,
        title: "Nenhum agente de IA ativo",
        description: "Um agente pode responder dúvidas comuns fora do horário.",
        action: "Ver agentes",
        view: "agentes",
      });
    }
  }

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-dashboard-surface ux-page flex-1 overflow-auto">
      <div className="ux-container">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1">Dashboard</h1>
            <p className="ux-lead">Como está a operação do workspace agora.</p>
          </div>
          <div className="ux-actions">
            {updatedAt && (
              <span className="ux-meta">
                Atualizado às{" "}
                {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              className="ux-icon-btn"
              onClick={refresh}
              aria-label="Atualizar dados de Dashboard"
              title="Atualizar"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        {error && <ErrorBox text={error} />}
        {viewState === "initial" && (
          <DataSkeleton label="Preparando indicadores do workspace" columns={5} />
        )}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando indicadores...
          </p>
        )}
        {data && (
          <section className="ux-panel ux-kpis" aria-label="Indicadores principais">
            <div className="ux-kpi">
              <span className="ux-meta">Mensagens em 24h</span>
              <strong className="ux-kpi-value">{NUMBER_FORMAT.format(data.messages24h)}</strong>
              <span className="ux-meta">enviadas e recebidas</span>
            </div>
            <div className="ux-kpi">
              <span className="ux-meta">Conversas ativas</span>
              <strong className="ux-kpi-value">{NUMBER_FORMAT.format(data.activeChats)}</strong>
              <span className="ux-meta">{NUMBER_FORMAT.format(data.unread)} não lidas</span>
            </div>
            <div className="ux-kpi">
              <span className="ux-meta">Leads no CRM</span>
              <strong className="ux-kpi-value">{NUMBER_FORMAT.format(data.crmLeads)}</strong>
              <span className="ux-meta">{data.pendingFollowUps} follow-ups pendentes</span>
            </div>
            <div className="ux-kpi">
              <span className="ux-meta">Pipeline aberto</span>
              <strong className="ux-kpi-value ux-kpi-value--money" title={money}>
                {money}
              </strong>
              <span className="ux-meta">em negociação</span>
            </div>
          </section>
        )}
        {data && (
          <div className="ux-layout-rail">
            <section className="ux-panel" aria-labelledby="dashboard-attention-title">
              <div className="ux-panel-head">
                <div className="flex min-w-0 items-baseline gap-3">
                  <h2 id="dashboard-attention-title" className="ux-h2">
                    Precisa de atenção
                  </h2>
                  {attention.length > 0 && <span className="ux-meta">{attention.length}</span>}
                </div>
              </div>
              {attention.length === 0 ? (
                <div className="ux-empty">
                  <p className="ux-h3">Tudo em dia</p>
                  <p>Nenhuma conversa esperando, nenhum prazo vencido e todos os números online.</p>
                </div>
              ) : (
                <ul className="ux-list">
                  {attention.map((item) => (
                    <li key={item.id} className="ux-row">
                      <span className="ux-dot" data-tone={item.tone} aria-hidden="true" />
                      <div className="ux-row-main">
                        <p className="ux-strong">{item.title}</p>
                        <p className="ux-meta">{item.description}</p>
                      </div>
                      <button
                        type="button"
                        className="ux-btn ux-btn--ghost"
                        onClick={() => go(item.view)}
                      >
                        {item.action}
                        <CaretRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <aside className="ux-rail" aria-label="Resumo do workspace">
              <section className="ux-panel" aria-labelledby="dashboard-service-title">
                <div className="ux-panel-head">
                  <h2 id="dashboard-service-title" className="ux-h2">
                    Atendimento
                  </h2>
                </div>
                <dl className="ux-stats">
                  <div>
                    <dt>Números conectados</dt>
                    <dd>
                      <span
                        className="ux-dot"
                        data-tone={
                          data.totalInstances > 0 && data.connectedInstances === data.totalInstances
                            ? "positive"
                            : "warning"
                        }
                        aria-hidden="true"
                      />
                      {data.connectedInstances} de {data.totalInstances}
                    </dd>
                  </div>
                  <div>
                    <dt>Conversas ativas</dt>
                    <dd>{NUMBER_FORMAT.format(data.activeChats)}</dd>
                  </div>
                  <div>
                    <dt>Não lidas</dt>
                    <dd>{NUMBER_FORMAT.format(data.unread)}</dd>
                  </div>
                  <div>
                    <dt>Mensagens em 24h</dt>
                    <dd>{NUMBER_FORMAT.format(data.messages24h)}</dd>
                  </div>
                </dl>
              </section>
              <section className="ux-panel" aria-labelledby="dashboard-sales-title">
                <div className="ux-panel-head">
                  <h2 id="dashboard-sales-title" className="ux-h2">
                    Vendas e automação
                  </h2>
                </div>
                <dl className="ux-stats">
                  <div>
                    <dt>Leads no CRM</dt>
                    <dd>{NUMBER_FORMAT.format(data.crmLeads)}</dd>
                  </div>
                  <div>
                    <dt>Follow-ups pendentes</dt>
                    <dd>{data.pendingFollowUps}</dd>
                  </div>
                  <div>
                    <dt>Follow-ups atrasados</dt>
                    <dd>
                      {data.overdueFollowUps > 0 && (
                        <span className="ux-dot" data-tone="danger" aria-hidden="true" />
                      )}
                      {data.overdueFollowUps}
                    </dd>
                  </div>
                  <div>
                    <dt>Agentes ativos</dt>
                    <dd>{data.enabledAgents}</dd>
                  </div>
                  <div>
                    <dt>Respondendo sozinhos</dt>
                    <dd>{data.automaticAgents}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format((cents || 0) / 100);
}

function sumLeadValues(items: CrmLead[]) {
  const byCurrency = new Map<string, number>();
  for (const lead of items) {
    const currency = lead.currency || "BRL";
    byCurrency.set(currency, (byCurrency.get(currency) || 0) + (lead.value_cents || 0));
  }
  if (!byCurrency.size) return formatMoney(0);
  return Array.from(byCurrency.entries())
    .map(([currency, cents]) => formatMoney(cents, currency))
    .join(" · ");
}

const STAGE_COLORS = [
  "#71717a",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

const STAGE_KIND_LABEL: Record<string, string> = {
  open: "Em andamento",
  won: "Ganho",
  lost: "Perdido",
};

function centsToInput(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [leadDrawerOpen, setLeadDrawerOpen] = useState(false);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [crmQuery, setCrmQuery] = useState("");
  const [detailLead, setDetailLead] = useState<CrmLead | null>(null);
  const [detailForm, setDetailForm] = useState({
    name: "",
    value: "",
    company: "",
    email: "",
    phone: "",
    notes: "",
    stageId: "",
  });
  const [stageEdit, setStageEdit] = useState<{
    id: string;
    name: string;
    color: string;
    kind: "open" | "won" | "lost";
  } | null>(null);
  const [pendingStageDelete, setPendingStageDelete] = useState<CrmStage | null>(null);
  const [activeStageId, setActiveStageId] = useState("");
  const [boardWidth, setBoardWidth] = useState(0);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = boardWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBoardWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  });

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
      setLeadDrawerOpen(false);
    }, "Lead criado com sucesso.");

  const moveLead = (lead: CrmLead, stageId: string) => {
    if (lead.stage_id === stageId) return;
    // Movimento otimista: o card muda de coluna na hora; o refresh confirma.
    setLeads((current) =>
      current.map((item) => (item.id === lead.id ? { ...item, stage_id: stageId } : item)),
    );
    void run(() => updateLead({ id: lead.id, stageId }), "Lead movido de etapa.");
  };

  const openLead = (lead: CrmLead) => {
    setDetailLead(lead);
    setDetailForm({
      name: lead.name || "",
      value: centsToInput(lead.value_cents),
      company: lead.company || "",
      email: lead.email || "",
      phone: lead.phone_e164 || "",
      notes: lead.notes || "",
      stageId: lead.stage_id,
    });
  };

  const saveLeadDetail = () => {
    const lead = detailLead;
    if (!lead || !detailForm.name.trim()) return;
    const patch: Record<string, unknown> = { id: lead.id };
    if (detailForm.name.trim() !== lead.name) patch["name"] = detailForm.name.trim();
    const cents = parseCurrencyValue(detailForm.value);
    if (cents !== (lead.value_cents || 0)) patch["valueCents"] = cents;
    if ((detailForm.company.trim() || null) !== (lead.company || null))
      patch["company"] = detailForm.company.trim() || null;
    if ((detailForm.email.trim() || null) !== (lead.email || null))
      patch["email"] = detailForm.email.trim() || null;
    if ((detailForm.phone.trim() || null) !== (lead.phone_e164 || null))
      patch["phoneE164"] = detailForm.phone.trim() || null;
    if ((detailForm.notes || null) !== (lead.notes || null))
      patch["notes"] = detailForm.notes || null;
    if (detailForm.stageId !== lead.stage_id) patch["stageId"] = detailForm.stageId;
    if (Object.keys(patch).length === 1) {
      setDetailLead(null);
      return;
    }
    void run(async () => {
      await updateLead(patch);
      setDetailLead(null);
    }, "Lead atualizado.");
  };

  const shiftStage = (stage: CrmStage, direction: -1 | 1) => {
    const ordered = [...stages].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((item) => item.id === stage.id);
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    setStages((current) =>
      current.map((item) =>
        item.id === stage.id
          ? { ...item, position: neighbor.position }
          : item.id === neighbor.id
            ? { ...item, position: stage.position }
            : item,
      ),
    );
    void run(async () => {
      await updateStage({ id: stage.id, position: neighbor.position });
      await updateStage({ id: neighbor.id, position: stage.position });
    }, "Etapa reordenada.");
  };

  const handleDeleteLead = (lead: CrmLead) => setPendingLeadDelete(lead);
  const viewState = deriveViewDataState({
    hasData: hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && stages.length === 0 && leads.length === 0,
  });

  const normalizedQuery = crmQuery.trim().toLowerCase();
  const filteredLeads = normalizedQuery
    ? leads.filter((lead) =>
        `${lead.name} ${lead.company || ""} ${lead.phone_e164 || ""} ${lead.email || ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : leads;
  const openStageIds = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id));
  const openValue = sumLeadValues(leads.filter((lead) => openStageIds.has(lead.stage_id)));

  const orderedStageList = [...stages].sort((a, b) => a.position - b.position);
  // Sem rolagem horizontal: todas as colunas lado a lado só quando cada uma
  // recebe ao menos 210px; caso contrário, abas de etapa + uma coluna.
  const fitsBoard = boardWidth === 0 || boardWidth / Math.max(1, stages.length) >= 210;
  const currentStageId =
    orderedStageList.find((stage) => stage.id === activeStageId)?.id ||
    orderedStageList[0]?.id ||
    "";

  const leadContact = (lead: CrmLead) =>
    lead.company || lead.phone_e164 || lead.email || "Sem contato";

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-crm-surface ux-page flex-1 overflow-auto">
      <div className="ux-container ux-container--wide">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1">CRM</h1>
            <p className="ux-lead">
              {hasLoaded
                ? `${leads.length} ${leads.length === 1 ? "lead" : "leads"} · ${openValue} em negociação`
                : "Pipeline de vendas do workspace."}
            </p>
          </div>
          <div className="ux-actions">
            <button
              type="button"
              className="ux-icon-btn"
              onClick={() => void refresh()}
              aria-label="Atualizar dados de CRM"
              title="Atualizar"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
            {canManage && (
              <button
                type="button"
                className="ux-btn ux-btn--primary"
                onClick={() => setLeadDrawerOpen(true)}
              >
                <Plus size={16} aria-hidden="true" /> Novo lead
              </button>
            )}
          </div>
        </header>
        {error && <ErrorBox text={error} />}
        {viewState === "initial" && (
          <DataSkeleton label="Preparando pipeline comercial" columns={3} />
        )}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando pipeline...
          </p>
        )}
        {viewState === "empty" && (
          <section className="ux-panel">
            <div className="ux-empty">
              <p className="ux-h3">Pipeline vazio</p>
              <p>Crie as etapas do seu processo de venda e adicione o primeiro lead.</p>
            </div>
          </section>
        )}
        {hasLoaded && viewState !== "empty" && (
          <div className="ux-toolbar ux-toolbar--bare">
            <div className="ux-search">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <input
                className="ux-input"
                aria-label="Buscar leads"
                placeholder="Buscar lead, empresa ou telefone"
                value={crmQuery}
                onChange={(event) => setCrmQuery(event.target.value)}
              />
            </div>
            {canManage && (
              <button
                type="button"
                className="ux-btn ux-btn--ghost ml-auto"
                onClick={() =>
                  setStageEdit({
                    id: "",
                    name: "",
                    color: STAGE_COLORS[1] || "#3b82f6",
                    kind: "open",
                  })
                }
              >
                <Plus size={16} aria-hidden="true" /> Nova etapa
              </button>
            )}
            <div
              className={`ux-segmented ${canManage ? "" : "ml-auto"}`}
              role="tablist"
              aria-label="Modo de exibição"
            >
              <button
                type="button"
                role="tab"
                aria-selected={layout === "board"}
                className="ux-segment"
                onClick={() => setLayout("board")}
              >
                Quadro
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layout === "list"}
                className="ux-segment"
                onClick={() => setLayout("list")}
              >
                Lista
              </button>
            </div>
          </div>
        )}

        {hasLoaded && viewState !== "empty" && layout === "board" && (
          <div ref={boardWrapRef} className="grid min-w-0 gap-3">
            {!fitsBoard && (
              <div className="ux-segmented ux-stage-tabs" role="tablist" aria-label="Etapas">
                {orderedStageList.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    role="tab"
                    aria-selected={currentStageId === stage.id}
                    className="ux-segment"
                    onClick={() => setActiveStageId(stage.id)}
                  >
                    <span
                      className="ux-chip-dot"
                      style={{ background: stage.color }}
                      aria-hidden="true"
                    />
                    {stage.name}
                    <span className="ux-segment-count">
                      {filteredLeads.filter((lead) => lead.stage_id === stage.id).length}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div
              className="ux-board"
              aria-label="Quadro do pipeline"
              style={{
                gridTemplateColumns: `repeat(${fitsBoard ? Math.max(1, stages.length) : 1}, minmax(0, 1fr))`,
              }}
            >
              {orderedStageList
                .map((stage, stageIndex, orderedStages) => ({ stage, stageIndex, orderedStages }))
                .filter(({ stage }) => fitsBoard || stage.id === currentStageId)
                .map(({ stage, stageIndex, orderedStages }) => {
                  const stageLeads = filteredLeads.filter((lead) => lead.stage_id === stage.id);
                  const visibleLeadLimit =
                    visibleLeadCounts[stage.id] ?? progressiveRenderLimit(viewport.horizontal);
                  const visibleLeads = stageLeads.slice(0, visibleLeadLimit);
                  return (
                    <section
                      key={stage.id}
                      className="ux-col"
                      data-drop={dropStageId === stage.id}
                      aria-label={`Etapa ${stage.name}`}
                      onDragOver={(event) => {
                        if (!dragLeadId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dropStageId !== stage.id) setDropStageId(stage.id);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                          setDropStageId(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const lead = leads.find((item) => item.id === dragLeadId);
                        setDropStageId(null);
                        setDragLeadId(null);
                        if (lead) moveLead(lead, stage.id);
                      }}
                    >
                      <div className="ux-col-head" style={{ borderTopColor: stage.color }}>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <h2 title={stage.name} className="truncate ux-h3">
                              {stage.name}
                            </h2>
                            <span className="ux-col-count">{stageLeads.length}</span>
                          </div>
                          <p className="ux-meta truncate">{sumLeadValues(stageLeads)}</p>
                        </div>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="ux-icon-btn ux-col-menu"
                              aria-label={`Opções da etapa ${stage.name}`}
                            >
                              <DotsThree size={18} weight="bold" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[200px]">
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStageEdit({
                                    id: stage.id,
                                    name: stage.name,
                                    color: stage.color,
                                    kind: stage.kind,
                                  })
                                }
                              >
                                <PencilSimple size={16} aria-hidden="true" /> Editar etapa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={stageIndex === 0}
                                onSelect={() => shiftStage(stage, -1)}
                              >
                                <ArrowLeft size={16} aria-hidden="true" /> Mover para a esquerda
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={stageIndex === orderedStages.length - 1}
                                onSelect={() => shiftStage(stage, 1)}
                              >
                                <ArrowRight size={16} aria-hidden="true" /> Mover para a direita
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[var(--ux-danger)] focus:text-[var(--ux-danger)]"
                                onSelect={() => setPendingStageDelete(stage)}
                              >
                                <Trash size={16} aria-hidden="true" /> Excluir etapa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <div className="ux-col-body">
                        {visibleLeads.map((lead) => (
                          <article
                            key={lead.id}
                            className="ux-card"
                            draggable={canManage}
                            data-dragging={dragLeadId === lead.id}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", lead.id);
                              setDragLeadId(lead.id);
                            }}
                            onDragEnd={() => {
                              setDragLeadId(null);
                              setDropStageId(null);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  className="ux-card-open"
                                  onClick={() => openLead(lead)}
                                  aria-label={`Abrir detalhes de ${lead.name}`}
                                >
                                  <p title={lead.name} className="truncate ux-strong">
                                    {lead.name}
                                  </p>
                                </button>
                                <p title={leadContact(lead)} className="truncate ux-meta">
                                  {leadContact(lead)}
                                </p>
                              </div>
                              {canManage && (
                                <button
                                  type="button"
                                  className="ux-icon-btn ux-icon-btn--danger ux-card-action"
                                  onClick={() => handleDeleteLead(lead)}
                                  aria-label={`Excluir lead ${lead.name}`}
                                  title="Excluir"
                                >
                                  <Trash size={16} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            <div className="ux-card-foot">
                              <span className="ux-card-value" data-empty={!lead.value_cents}>
                                {lead.value_cents
                                  ? formatMoney(lead.value_cents, lead.currency || "BRL")
                                  : "Sem valor"}
                              </span>
                              {lead.contactCategory === "saved_contact" && (
                                <span className="ux-card-tag">Contato salvo</span>
                              )}
                              {lead.contactCategory === "potential_lead" && (
                                <span className="ux-card-tag">Possível lead</span>
                              )}
                            </div>
                            {canManage && (
                              <div className="ux-card-stage">
                                <SurfaceSelect
                                  isDarkMode={isDarkMode}
                                  className="ux-input ux-input--sm"
                                  value={lead.stage_id}
                                  onValueChange={(stageId) => moveLead(lead, stageId)}
                                  placeholder="Etapa do lead"
                                  ariaLabel={`Mover etapa do lead ${lead.name}`}
                                >
                                  {stages.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SurfaceSelect>
                              </div>
                            )}
                          </article>
                        ))}
                        {!stageLeads.length && (
                          <p className="ux-col-empty">
                            {dragLeadId
                              ? "Solte aqui"
                              : normalizedQuery
                                ? "Nenhum resultado"
                                : "Sem leads"}
                          </p>
                        )}
                        {stageLeads.length > visibleLeads.length && (
                          <button
                            type="button"
                            className="ux-btn ux-btn--ghost w-full"
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
          </div>
        )}

        {hasLoaded && viewState !== "empty" && layout === "list" && (
          <section className="ux-panel" aria-label="Lista de leads">
            {filteredLeads.length ? (
              <div className="ux-table ux-table--crm" role="table" aria-label="Leads">
                <div className="ux-table-head" role="row">
                  <span role="columnheader">Lead</span>
                  <span role="columnheader">Etapa</span>
                  <span role="columnheader" className="ux-col-company">
                    Valor
                  </span>
                  <span role="columnheader" className="ux-col-tags">
                    Origem
                  </span>
                  <span role="columnheader" aria-label="Ações" />
                </div>
                {filteredLeads.slice(0, 300).map((lead) => {
                  const stage = stages.find((item) => item.id === lead.stage_id);
                  return (
                    <div key={lead.id} className="ux-table-row" role="row">
                      <span role="cell" className="ux-client">
                        <span className="ux-avatar" aria-hidden="true">
                          {lead.profilePicUrl ? (
                            <img src={lead.profilePicUrl} alt="" loading="lazy" />
                          ) : (
                            <span>{(lead.name || "?").trim().charAt(0).toUpperCase()}</span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left ux-strong hover:underline"
                            onClick={() => openLead(lead)}
                          >
                            {lead.name}
                          </button>
                          <span className="block truncate ux-meta">{leadContact(lead)}</span>
                        </span>
                      </span>
                      <span role="cell" className="flex min-w-0 items-center gap-2">
                        <span
                          className="ux-chip-dot"
                          style={{ background: stage?.color || "var(--ux-subtle)" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{stage?.name || "—"}</span>
                      </span>
                      <span role="cell" className="ux-col-company tabular-nums">
                        {formatMoney(lead.value_cents, lead.currency || "BRL")}
                      </span>
                      <span role="cell" className="ux-col-tags ux-meta">
                        {lead.contactCategory === "saved_contact"
                          ? "Contato salvo"
                          : lead.contactCategory === "potential_lead"
                            ? "Possível lead"
                            : "Manual"}
                      </span>
                      <span role="cell" className="flex justify-end">
                        {canManage && (
                          <button
                            type="button"
                            className="ux-icon-btn ux-icon-btn--danger"
                            onClick={() => handleDeleteLead(lead)}
                            aria-label={`Excluir lead ${lead.name} da lista`}
                          >
                            <Trash size={16} aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ux-empty">
                <p className="ux-h3">Nenhum resultado</p>
                <p>Ajuste a busca para ver outros leads.</p>
              </div>
            )}
            {filteredLeads.length > 300 && (
              <p className="ux-meta border-t border-[var(--ux-line)] px-[18px] py-3">
                Mostrando 300 de {filteredLeads.length}. Use a busca para refinar.
              </p>
            )}
          </section>
        )}
      </div>

      <DialogPrimitive.Root open={leadDrawerOpen} onOpenChange={setLeadDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="crm-lead-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">Novo lead</DialogPrimitive.Title>
                <DialogPrimitive.Description id="crm-lead-description" className="ux-meta">
                  O lead entra na primeira etapa do pipeline.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar novo lead">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              id="crm-lead-form"
              className="ux-drawer-body"
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy && form.name.trim()) void add();
              }}
            >
              <div className="ux-section">
                <UxField label="Nome" htmlFor="crm-lead-name">
                  <input
                    id="crm-lead-name"
                    className="ux-input"
                    placeholder="Nome do lead ou da empresa"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </UxField>
                <UxField
                  label="Valor estimado"
                  htmlFor="crm-lead-value"
                  hint="Em reais. Ex.: 1.500,00"
                >
                  <input
                    id="crm-lead-value"
                    className="ux-input"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              <span />
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  form="crm-lead-form"
                  className="ux-btn ux-btn--primary"
                  disabled={busy || !form.name.trim()}
                >
                  Criar lead
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={Boolean(detailLead)}
        onOpenChange={(open) => {
          if (!open) setDetailLead(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="crm-detail-description"
          >
            <div className="ux-drawer-head">
              <div className="flex min-w-0 items-center gap-3">
                <span className="ux-avatar" aria-hidden="true">
                  {detailLead?.profilePicUrl ? (
                    <img src={detailLead.profilePicUrl} alt="" />
                  ) : (
                    <span>{(detailLead?.name || "?").trim().charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="ux-h2 truncate">
                    {detailLead?.name}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description id="crm-detail-description" className="ux-meta">
                    Atualizado em{" "}
                    {detailLead
                      ? new Date(detailLead.updated_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </DialogPrimitive.Description>
                </div>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar detalhes do lead">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              id="crm-detail-form"
              className="ux-drawer-body"
              onSubmit={(event) => {
                event.preventDefault();
                saveLeadDetail();
              }}
            >
              <div className="ux-section">
                <div className="ux-form-grid">
                  <UxField label="Etapa">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
                      value={detailForm.stageId}
                      disabled={!canManage}
                      onValueChange={(stageId) => setDetailForm({ ...detailForm, stageId })}
                      placeholder="Etapa"
                      ariaLabel="Etapa do lead"
                    >
                      {stages.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SurfaceSelect>
                  </UxField>
                  <UxField label="Valor estimado" htmlFor="crm-detail-value">
                    <input
                      id="crm-detail-value"
                      className="ux-input"
                      inputMode="decimal"
                      disabled={!canManage}
                      value={detailForm.value}
                      onChange={(e) => setDetailForm({ ...detailForm, value: e.target.value })}
                    />
                  </UxField>
                </div>
              </div>
              <div className="ux-section">
                <h3 className="ux-h3">Contato</h3>
                <UxField label="Nome" htmlFor="crm-detail-name">
                  <input
                    id="crm-detail-name"
                    className="ux-input"
                    disabled={!canManage}
                    value={detailForm.name}
                    onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })}
                  />
                </UxField>
                <UxField label="Empresa" htmlFor="crm-detail-company">
                  <input
                    id="crm-detail-company"
                    className="ux-input"
                    disabled={!canManage}
                    value={detailForm.company}
                    onChange={(e) => setDetailForm({ ...detailForm, company: e.target.value })}
                  />
                </UxField>
                <div className="ux-form-grid">
                  <UxField label="Telefone" htmlFor="crm-detail-phone" hint="Ex.: +5511999999999">
                    <input
                      id="crm-detail-phone"
                      className="ux-input"
                      inputMode="tel"
                      disabled={!canManage}
                      value={detailForm.phone}
                      onChange={(e) => setDetailForm({ ...detailForm, phone: e.target.value })}
                    />
                  </UxField>
                  <UxField label="E-mail" htmlFor="crm-detail-email">
                    <input
                      id="crm-detail-email"
                      className="ux-input"
                      type="email"
                      disabled={!canManage}
                      value={detailForm.email}
                      onChange={(e) => setDetailForm({ ...detailForm, email: e.target.value })}
                    />
                  </UxField>
                </div>
              </div>
              <div className="ux-section">
                <UxField label="Notas" htmlFor="crm-detail-notes" hint="Visível só para a equipe.">
                  <textarea
                    id="crm-detail-notes"
                    className="ux-input"
                    rows={5}
                    disabled={!canManage}
                    value={detailForm.notes}
                    onChange={(e) => setDetailForm({ ...detailForm, notes: e.target.value })}
                  />
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              {canManage && detailLead ? (
                <button
                  type="button"
                  className="ux-btn ux-btn--ghost ux-btn--danger"
                  onClick={() => {
                    const lead = detailLead;
                    setDetailLead(null);
                    handleDeleteLead(lead);
                  }}
                >
                  <Trash size={16} aria-hidden="true" /> Excluir
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Fechar
                </DialogPrimitive.Close>
                {canManage && (
                  <button
                    type="submit"
                    form="crm-detail-form"
                    className="ux-btn ux-btn--primary"
                    disabled={busy || !detailForm.name.trim()}
                  >
                    Salvar alterações
                  </button>
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={Boolean(stageEdit)}
        onOpenChange={(open) => {
          if (!open) setStageEdit(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content className="ux-modal" aria-describedby="crm-stage-description">
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">
                  {stageEdit?.id ? "Editar etapa" : "Nova etapa"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="crm-stage-description" className="ux-meta">
                  Nome, cor e tipo da etapa no pipeline.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar edição da etapa">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            {stageEdit && (
              <form
                className="ux-section"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!stageEdit.name.trim()) return;
                  const edit = stageEdit;
                  void run(
                    async () => {
                      if (edit.id) {
                        await updateStage({
                          id: edit.id,
                          name: edit.name.trim(),
                          color: edit.color,
                          kind: edit.kind,
                        });
                      } else {
                        await createStage({
                          name: edit.name.trim(),
                          color: edit.color,
                          kind: edit.kind,
                          position: stages.length,
                        });
                      }
                      setStageEdit(null);
                    },
                    edit.id ? "Etapa atualizada." : "Etapa criada com sucesso.",
                  );
                }}
              >
                <UxField label="Nome" htmlFor="crm-stage-name">
                  <input
                    id="crm-stage-name"
                    className="ux-input"
                    value={stageEdit.name}
                    onChange={(e) => setStageEdit({ ...stageEdit, name: e.target.value })}
                  />
                </UxField>
                <div className="ux-field">
                  <span className="ux-label">Cor</span>
                  <div className="ux-swatches" role="radiogroup" aria-label="Cor da etapa">
                    {Array.from(
                      new Set([
                        (
                          stages.find((item) => item.id === stageEdit.id)?.color || ""
                        ).toLowerCase(),
                        ...STAGE_COLORS,
                      ]),
                    )
                      .filter((color) => /^#[0-9a-f]{6}$/.test(color))
                      .map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={stageEdit.color.toLowerCase() === color}
                          aria-label={`Cor ${color}`}
                          className="ux-swatch"
                          style={{ background: color }}
                          onClick={() => setStageEdit({ ...stageEdit, color })}
                        />
                      ))}
                  </div>
                </div>
                <UxField label="Tipo" hint="Ganho e Perdido não somam no valor em negociação.">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input"
                    value={stageEdit.kind}
                    onValueChange={(kind) =>
                      setStageEdit({ ...stageEdit, kind: kind as "open" | "won" | "lost" })
                    }
                    placeholder="Tipo"
                    ariaLabel="Tipo da etapa"
                  >
                    {Object.entries(STAGE_KIND_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                </UxField>
                <div className="flex justify-end gap-2">
                  <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                    Cancelar
                  </DialogPrimitive.Close>
                  <button
                    type="submit"
                    className="ux-btn ux-btn--primary"
                    disabled={busy || !stageEdit.name.trim()}
                  >
                    {stageEdit.id ? "Salvar etapa" : "Criar etapa"}
                  </button>
                </div>
              </form>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <ConfirmDialog
        open={Boolean(pendingStageDelete)}
        title="Excluir etapa?"
        description={`A etapa ${pendingStageDelete?.name || "selecionada"} será removida. Etapas com leads não podem ser excluídas: mova os leads antes.`}
        confirmLabel="Excluir etapa"
        destructive
        busy={busy}
        dark={isDarkMode}
        onCancel={() => setPendingStageDelete(null)}
        onConfirm={() => {
          if (!pendingStageDelete) return;
          const stage = pendingStageDelete;
          setPendingStageDelete(null);
          void run(() => deleteStage(stage.id), "Etapa excluída.");
        }}
      />

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

type FollowUpFilter = "pending" | "overdue" | "done" | "all";

const FOLLOW_UP_PRIORITY: Record<string, { label: string; tone?: "danger" }> = {
  high: { label: "Alta", tone: "danger" },
  normal: { label: "Normal" },
  low: { label: "Baixa" },
};

function toLocalInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function followUpBucket(task: FollowUpTask, now: number) {
  if (task.status !== "pending") return "Concluídas";
  const due = new Date(task.due_at).getTime();
  if (due < now) return "Atrasadas";
  const today = startOfDay(new Date(now));
  const day = 86400000;
  if (due < today + day) return "Hoje";
  if (due < today + 2 * day) return "Amanhã";
  if (due < today + 7 * day) return "Próximos 7 dias";
  return "Mais adiante";
}

function formatDue(task: FollowUpTask, now: number) {
  const due = new Date(task.due_at);
  const time = due.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (task.status === "pending" && due.getTime() < now) {
    const days = Math.floor((now - due.getTime()) / 86400000);
    return days >= 1
      ? `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`
      : `Venceu hoje às ${time}`;
  }
  const bucket = followUpBucket(task, now);
  if (bucket === "Hoje") return `Hoje, ${time}`;
  if (bucket === "Amanhã") return `Amanhã, ${time}`;
  return due.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FOLLOW_UP_BUCKET_ORDER = [
  "Atrasadas",
  "Hoje",
  "Amanhã",
  "Próximos 7 dias",
  "Mais adiante",
  "Concluídas",
];

export function FollowUpView({ isDarkMode }: Props) {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingFollowUpDelete, setPendingFollowUpDelete] = useState<FollowUpTask | null>(null);
  const [filter, setFilter] = useState<FollowUpFilter>("pending");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const local = toLocalInputValue(new Date(Date.now() + 86400000));
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

  const now = Date.now();
  const counts = {
    pending: tasks.filter((task) => task.status === "pending").length,
    overdue: tasks.filter(
      (task) => task.status === "pending" && new Date(task.due_at).getTime() < now,
    ).length,
    done: tasks.filter((task) => task.status === "done").length,
    all: tasks.length,
  };
  const visible = tasks
    .filter((task) => {
      if (filter === "pending") return task.status === "pending";
      if (filter === "overdue")
        return task.status === "pending" && new Date(task.due_at).getTime() < now;
      if (filter === "done") return task.status === "done";
      return true;
    })
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const groups = FOLLOW_UP_BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: visible.filter((task) => followUpBucket(task, now) === bucket),
  })).filter((group) => group.items.length > 0);

  const canCreate =
    !busy && Boolean(form.title.trim()) && !Number.isNaN(new Date(form.dueAt).getTime());
  const createTask = () =>
    void run(async () => {
      await createFollowUp({
        title: form.title.trim(),
        dueAt: new Date(form.dueAt).toISOString(),
        priority: form.priority,
        leadId: form.leadId || null,
        note: form.note.trim() || null,
      });
      setForm({ ...form, title: "", leadId: "", note: "" });
      setCreatorOpen(false);
    }, "Follow-up registrado com sucesso.");

  const filters: Array<{ id: FollowUpFilter; label: string }> = [
    { id: "pending", label: "Pendentes" },
    { id: "overdue", label: "Atrasadas" },
    { id: "done", label: "Concluídas" },
    { id: "all", label: "Todas" },
  ];

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-follow-up-surface ux-page flex-1 overflow-auto">
      <div className="ux-container">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1">Follow-up</h1>
            <p className="ux-lead">
              Tarefas de acompanhamento com prazo e prioridade. Conclua com um clique.
            </p>
          </div>
          <div className="ux-actions">
            <button
              type="button"
              className="ux-icon-btn"
              onClick={() => void refresh()}
              aria-label="Atualizar dados de Follow-up"
              title="Atualizar"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
            {canManage && (
              <button
                type="button"
                className="ux-btn ux-btn--primary"
                onClick={() => {
                  setForm({ ...form, dueAt: toLocalInputValue(new Date(Date.now() + 86400000)) });
                  setCreatorOpen(true);
                }}
              >
                <Plus size={16} aria-hidden="true" /> Nova tarefa
              </button>
            )}
          </div>
        </header>
        {error && <ErrorBox text={error} />}
        {viewState === "initial" && <DataSkeleton label="Preparando follow-ups" columns={2} />}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando follow-ups...
          </p>
        )}
        {hasLoaded && (
          <section className="ux-panel" aria-label="Tarefas de follow-up">
            <div className="ux-panel-head">
              <div className="ux-segmented" role="tablist" aria-label="Filtrar tarefas">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.id}
                    className="ux-segment"
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                    <span className="ux-segment-count">{counts[item.id]}</span>
                  </button>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <div className="ux-empty">
                <p className="ux-h3">
                  {tasks.length === 0
                    ? "Nenhuma tarefa ainda"
                    : filter === "overdue"
                      ? "Nada atrasado"
                      : "Nada por aqui"}
                </p>
                <p>
                  {tasks.length === 0
                    ? "Crie tarefas para lembrar de retornar clientes, enviar propostas ou confirmar pagamentos."
                    : "Nenhuma tarefa neste filtro."}
                </p>
                {viewState === "empty" && canManage && (
                  <button
                    type="button"
                    className="ux-btn ux-btn--primary mt-2"
                    onClick={() => setCreatorOpen(true)}
                  >
                    <Plus size={16} aria-hidden="true" /> Criar primeira tarefa
                  </button>
                )}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.bucket} className="ux-group">
                  <p
                    className="ux-group-title"
                    data-tone={group.bucket === "Atrasadas" ? "danger" : undefined}
                  >
                    {group.bucket}
                    <span>{group.items.length}</span>
                  </p>
                  <ul className="ux-list">
                    {group.items.map((task) => {
                      const overdue =
                        task.status === "pending" && new Date(task.due_at).getTime() < now;
                      const done = task.status === "done";
                      const priority = FOLLOW_UP_PRIORITY[task.priority] || {
                        label: task.priority,
                      };
                      const lead = leads.find((item) => item.id === task.lead_id);
                      return (
                        <li key={task.id} className="ux-row ux-task" data-done={done}>
                          <button
                            type="button"
                            className="ux-task-check"
                            data-checked={done}
                            disabled={!canManage || busy || done}
                            onClick={() =>
                              void run(
                                () => updateFollowUp({ id: task.id, status: "done" }),
                                "Follow-up concluído com sucesso.",
                              )
                            }
                            aria-label={
                              done
                                ? `Tarefa ${task.title} concluída`
                                : `Concluir tarefa ${task.title}`
                            }
                          >
                            <Check size={12} weight="bold" aria-hidden="true" />
                          </button>
                          <div className="ux-row-main">
                            <p title={task.title} className="ux-task-title truncate">
                              {task.title}
                            </p>
                            <p className="ux-meta flex flex-wrap items-center gap-x-2">
                              <span className={overdue ? "text-[var(--ux-danger)]" : undefined}>
                                {formatDue(task, now)}
                              </span>
                              {lead && <span>· {lead.name || lead.phone_e164 || "Cliente"}</span>}
                            </p>
                            {task.note && <p className="ux-row-detail line-clamp-1">{task.note}</p>}
                          </div>
                          {task.priority !== "normal" && (
                            <span className="ux-pill" data-tone={priority.tone}>
                              {priority.label}
                            </span>
                          )}
                          {canManage && editingTask === task.id ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <input
                                className="ux-input w-auto"
                                type="datetime-local"
                                value={editingDueAt}
                                onChange={(e) => setEditingDueAt(e.target.value)}
                                aria-label={`Nova data da tarefa ${task.title}`}
                              />
                              <button
                                type="button"
                                className="ux-btn ux-btn--primary"
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
                                type="button"
                                className="ux-btn ux-btn--ghost"
                                onClick={() => setEditingTask(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            canManage && (
                              <div className="flex shrink-0 items-center gap-1">
                                {!done && (
                                  <button
                                    type="button"
                                    className="ux-icon-btn"
                                    onClick={() => {
                                      setEditingTask(task.id);
                                      setEditingDueAt(toLocalInputValue(new Date(task.due_at)));
                                    }}
                                    aria-label={`Reagendar tarefa ${task.title}`}
                                    title="Reagendar"
                                  >
                                    <CalendarDots size={18} aria-hidden="true" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ux-icon-btn ux-icon-btn--danger"
                                  onClick={() => handleDeleteFollowUp(task)}
                                  aria-label={`Excluir tarefa ${task.title}`}
                                  title="Excluir"
                                >
                                  <Trash size={18} aria-hidden="true" />
                                </button>
                              </div>
                            )
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        )}
      </div>

      <DialogPrimitive.Root open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="follow-up-creator-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">Nova tarefa</DialogPrimitive.Title>
                <DialogPrimitive.Description id="follow-up-creator-description" className="ux-meta">
                  Você será lembrado no prazo definido.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar nova tarefa">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              className="ux-drawer-body"
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreate) createTask();
              }}
            >
              <div className="ux-section">
                <UxField label="O que fazer" htmlFor="follow-up-title">
                  <input
                    id="follow-up-title"
                    className="ux-input"
                    placeholder="Ex.: Enviar proposta revisada"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </UxField>
                <div className="ux-form-grid">
                  <UxField label="Prazo" htmlFor="follow-up-due">
                    <input
                      id="follow-up-due"
                      className="ux-input"
                      type="datetime-local"
                      value={form.dueAt}
                      onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                    />
                  </UxField>
                  <UxField label="Prioridade">
                    <SurfaceSelect
                      isDarkMode={isDarkMode}
                      className="ux-input"
                      value={form.priority}
                      onValueChange={(priority) => setForm({ ...form, priority })}
                      placeholder="Prioridade"
                      ariaLabel="Prioridade do follow-up"
                    >
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                    </SurfaceSelect>
                  </UxField>
                </div>
                <UxField label="Cliente" hint="Opcional.">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input"
                    value={form.leadId || "__none__"}
                    onValueChange={(leadId) =>
                      setForm({ ...form, leadId: leadId === "__none__" ? "" : leadId })
                    }
                    placeholder="Sem cliente"
                    ariaLabel="Cliente do follow-up"
                  >
                    <SelectItem value="__none__">Sem cliente</SelectItem>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name || lead.phone_e164 || "Cliente"}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                </UxField>
                <UxField label="Observação interna" htmlFor="follow-up-note" hint="Opcional.">
                  <textarea
                    id="follow-up-note"
                    className="ux-input"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              <span />
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="button"
                  className="ux-btn ux-btn--primary"
                  disabled={!canCreate}
                  onClick={createTask}
                >
                  Criar tarefa
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

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

const APPOINTMENT_STATUS: Record<string, { label: string; tone?: "positive" | "danger" }> = {
  scheduled: { label: "Agendado" },
  confirmed: { label: "Confirmado", tone: "positive" },
  completed: { label: "Concluído" },
  canceled: { label: "Cancelado", tone: "danger" },
  no_show: { label: "Não compareceu", tone: "danger" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<CalendarAppointment | null>(null);
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

  const activeAppointments = appointments
    .filter((appointment) => appointment.status !== "canceled")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const selectedAppointments = activeAppointments.filter(
    (appointment) => dayKey(appointment.starts_at) === selectedDay,
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
    setAppointmentOpen(true);
  };

  const newAppointmentOnDay = (key: string) => {
    const now = new Date();
    const base = new Date(
      `${key}T${String(Math.max(9, now.getHours() + 1)).padStart(2, "0")}:00:00`,
    );
    const slot = selectedCalendar?.slot_duration_minutes || 30;
    setEditingAppointmentId(null);
    setForm((current) => ({
      ...current,
      title: "",
      startsAt: localDateTime(base),
      endsAt: localDateTime(new Date(base.getTime() + slot * 60_000)),
      leadId: "",
      agentId: "",
    }));
    setAppointmentOpen(true);
  };

  const viewState = deriveViewDataState({
    hasData: appointments.length > 0 || calendars.length > 0 || hasLoaded,
    isLoading,
    hasError: Boolean(error),
    isEmpty: hasLoaded && appointments.length === 0 && calendars.length === 0,
  });
  const todayKey = dayKey(new Date());
  const selectedDate = new Date(`${selectedDay}T12:00:00`);

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-calendar-surface ux-page flex-1 overflow-auto">
      <div className="ux-container">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1">Calendário</h1>
            <p className="ux-lead">
              Agendamentos com clientes, feitos pela equipe ou pelos agentes de IA.
            </p>
          </div>
          <div className="ux-actions">
            <button
              type="button"
              className="ux-icon-btn"
              onClick={() => void refresh()}
              aria-label="Atualizar dados de Calendário"
              title="Atualizar"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
            {canManage && calendars.length > 0 && (
              <button
                type="button"
                className="ux-btn ux-btn--primary"
                onClick={() => newAppointmentOnDay(selectedDay)}
              >
                <Plus size={16} aria-hidden="true" /> Novo agendamento
              </button>
            )}
          </div>
        </header>
        {error && <ErrorBox text={error} />}
        {viewState === "initial" && <DataSkeleton label="Preparando calendário" columns={2} />}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando calendário...
          </p>
        )}

        {hasLoaded && calendars.length === 0 && (
          <section className="ux-panel">
            <div className="ux-empty">
              <p className="ux-h3">Nenhuma agenda criada</p>
              <p>
                Crie uma agenda com horário de atendimento e capacidade diária. Os agentes de IA
                usam essas regras para oferecer horários livres.
              </p>
              {canManage && (
                <button
                  type="button"
                  className="ux-btn ux-btn--primary mt-2"
                  onClick={() => setCalendarOpen(true)}
                >
                  <Plus size={16} aria-hidden="true" /> Criar agenda
                </button>
              )}
            </div>
          </section>
        )}

        {hasLoaded && calendars.length > 0 && (
          <div className="ux-layout-rail">
            <section className="ux-panel" aria-labelledby="calendar-month-title">
              <div className="ux-panel-head">
                <h2 id="calendar-month-title" className="ux-h2 first-letter:uppercase">
                  {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="ux-icon-btn"
                    aria-label="Mês anterior"
                    onClick={() =>
                      setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))
                    }
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ux-btn ux-btn--ghost"
                    onClick={() => {
                      const now = new Date();
                      setMonth(now);
                      setSelectedDay(dayKey(now));
                    }}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    className="ux-icon-btn"
                    aria-label="Próximo mês"
                    onClick={() =>
                      setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))
                    }
                  >
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="ux-month" role="grid" aria-labelledby="calendar-month-title">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="ux-month-weekday" role="columnheader">
                    {day}
                  </span>
                ))}
                {monthDays(month).map((date) => {
                  const key = dayKey(date);
                  const dayItems = activeAppointments.filter(
                    (appointment) => dayKey(appointment.starts_at) === key,
                  );
                  const outside = date.getMonth() !== month.getMonth();
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      aria-selected={selectedDay === key}
                      aria-label={`${date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}, ${dayItems.length} agendamentos`}
                      className="ux-day"
                      data-outside={outside}
                      data-today={key === todayKey}
                      onClick={() => setSelectedDay(key)}
                      onDoubleClick={() => canManage && newAppointmentOnDay(key)}
                    >
                      <span className="ux-day-number">{date.getDate()}</span>
                      {dayItems.slice(0, 2).map((appointment) => (
                        <span key={appointment.id} className="ux-day-event">
                          <b>{timeLabel(appointment.starts_at)}</b> {appointment.title}
                        </span>
                      ))}
                      {dayItems.length > 2 && (
                        <span className="ux-day-more">+{dayItems.length - 2}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="ux-rail" aria-label="Agenda do dia">
              <section className="ux-panel" aria-labelledby="calendar-day-title">
                <div className="ux-panel-head">
                  <div className="min-w-0">
                    <h2 id="calendar-day-title" className="ux-h2 first-letter:uppercase">
                      {selectedDate.toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </h2>
                    <p className="ux-meta">
                      {selectedAppointments.length} de {selectedCalendar?.daily_capacity ?? 0}{" "}
                      horários ocupados
                    </p>
                  </div>
                </div>
                {selectedAppointments.length > 0 ? (
                  <ul className="ux-list">
                    {selectedAppointments.map((appointment) => {
                      const status = APPOINTMENT_STATUS[appointment.status] || {
                        label: appointment.status,
                      };
                      return (
                        <li key={appointment.id} className="ux-row ux-appointment">
                          <span className="ux-appointment-time">
                            <b>{timeLabel(appointment.starts_at)}</b>
                            <span>{timeLabel(appointment.ends_at)}</span>
                          </span>
                          <div className="ux-row-main">
                            <p title={appointment.title} className="truncate ux-strong">
                              {appointment.title}
                            </p>
                            <p className="ux-meta truncate">
                              {appointment.lead?.name ?? "Sem cliente"}
                              {appointment.source === "agent"
                                ? ` · via ${appointment.agent?.name || "agente"}`
                                : ""}
                            </p>
                            <span
                              className="ux-pill mt-1 justify-self-start"
                              data-tone={status.tone}
                            >
                              {status.label}
                            </span>
                          </div>
                          {canManage && (
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                type="button"
                                className="ux-icon-btn"
                                aria-label={`Remarcar ${appointment.title}`}
                                title="Remarcar"
                                onClick={() => editAppointment(appointment)}
                              >
                                <PencilSimple size={18} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="ux-icon-btn ux-icon-btn--danger"
                                aria-label={`Cancelar ${appointment.title}`}
                                title="Cancelar"
                                onClick={() => setPendingCancel(appointment)}
                              >
                                <X size={18} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="ux-empty">
                    <p>Nenhum agendamento neste dia.</p>
                  </div>
                )}
                {canManage && (
                  <div className="border-t border-[var(--ux-line)] p-3">
                    <button
                      type="button"
                      className="ux-btn ux-btn--ghost w-full"
                      onClick={() => newAppointmentOnDay(selectedDay)}
                    >
                      <Plus size={16} aria-hidden="true" /> Agendar neste dia
                    </button>
                  </div>
                )}
              </section>
              {selectedCalendar && (
                <section className="ux-panel" aria-labelledby="calendar-config-title">
                  <div className="ux-panel-head">
                    <h2 id="calendar-config-title" className="ux-h2">
                      {selectedCalendar.name}
                    </h2>
                  </div>
                  <dl className="ux-stats">
                    <div>
                      <dt>Duração do horário</dt>
                      <dd>{selectedCalendar.slot_duration_minutes} min</dd>
                    </div>
                    <div>
                      <dt>Intervalo</dt>
                      <dd>{selectedCalendar.buffer_minutes} min</dd>
                    </div>
                    <div>
                      <dt>Capacidade diária</dt>
                      <dd>{selectedCalendar.daily_capacity}</dd>
                    </div>
                    <div>
                      <dt>Fuso horário</dt>
                      <dd className="truncate">{selectedCalendar.timezone}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>

      <DialogPrimitive.Root
        open={appointmentOpen}
        onOpenChange={(open) => {
          setAppointmentOpen(open);
          if (!open) setEditingAppointmentId(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="appointment-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">
                  {editingAppointmentId ? "Remarcar agendamento" : "Novo agendamento"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="appointment-description" className="ux-meta">
                  Conflitos e capacidade da agenda são verificados ao salvar.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar agendamento">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              id="appointment-form"
              className="ux-drawer-body"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || !form.title.trim() || !form.calendarId) return;
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
                    }).then(() => {
                      setEditingAppointmentId(null);
                      setAppointmentOpen(false);
                    }),
                  editingAppointmentId ? "Agendamento remarcado." : "Agendamento salvo.",
                );
              }}
            >
              <div className="ux-section">
                <UxField label="Título" htmlFor="appointment-title">
                  <input
                    id="appointment-title"
                    className="ux-input"
                    placeholder="Ex.: Demonstração do produto"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                  />
                </UxField>
                <UxField label="Agenda">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input"
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
                    <SelectItem value="__choose_calendar__">Escolha uma agenda</SelectItem>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                </UxField>
                <div className="ux-form-grid">
                  <UxField label="Início" htmlFor="appointment-start">
                    <input
                      id="appointment-start"
                      className="ux-input"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                      aria-label="Início do agendamento"
                    />
                  </UxField>
                  <UxField label="Fim" htmlFor="appointment-end">
                    <input
                      id="appointment-end"
                      className="ux-input"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                      aria-label="Fim do agendamento"
                    />
                  </UxField>
                </div>
                <UxField label="Cliente" hint="Opcional.">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input"
                    value={form.leadId || "__no_client__"}
                    onValueChange={(leadId) =>
                      setForm({ ...form, leadId: leadId === "__no_client__" ? "" : leadId })
                    }
                    placeholder="Sem cliente"
                    ariaLabel="Cliente do agendamento"
                  >
                    <SelectItem value="__no_client__">Sem cliente</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name || client.phone_e164 || "Cliente sem nome"}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                </UxField>
                <UxField label="Agente responsável" hint="Opcional.">
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input"
                    value={form.agentId || "__no_agent__"}
                    onValueChange={(agentId) =>
                      setForm({ ...form, agentId: agentId === "__no_agent__" ? "" : agentId })
                    }
                    placeholder="Nenhum"
                    ariaLabel="Agente do agendamento"
                  >
                    <SelectItem value="__no_agent__">Nenhum</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              <span />
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  form="appointment-form"
                  className="ux-btn ux-btn--primary"
                  disabled={busy || !form.title.trim() || !form.calendarId}
                >
                  {editingAppointmentId ? "Salvar remarcação" : "Agendar"}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="calendar-create-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">Criar agenda</DialogPrimitive.Title>
                <DialogPrimitive.Description id="calendar-create-description" className="ux-meta">
                  Atendimento de segunda a sexta, das 9h às 18h. Você pode ajustar depois.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar criar agenda">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              id="calendar-create-form"
              className="ux-drawer-body"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || !calendarForm.name.trim()) return;
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
                    }).then(() => setCalendarOpen(false)),
                  "Calendário criado.",
                );
              }}
            >
              <div className="ux-section">
                <UxField label="Nome da agenda" htmlFor="calendar-name">
                  <input
                    id="calendar-name"
                    className="ux-input"
                    value={calendarForm.name}
                    onChange={(event) =>
                      setCalendarForm({ ...calendarForm, name: event.target.value })
                    }
                  />
                </UxField>
                <UxField
                  label="Fuso horário"
                  htmlFor="calendar-timezone"
                  hint="Ex.: America/Sao_Paulo"
                >
                  <input
                    id="calendar-timezone"
                    className="ux-input"
                    value={calendarForm.timezone}
                    onChange={(event) =>
                      setCalendarForm({ ...calendarForm, timezone: event.target.value })
                    }
                  />
                </UxField>
                <div className="ux-form-grid">
                  <UxField label="Duração (min)" htmlFor="calendar-slot">
                    <input
                      id="calendar-slot"
                      className="ux-input"
                      type="number"
                      min="5"
                      value={calendarForm.slotDurationMinutes}
                      onChange={(event) =>
                        setCalendarForm({
                          ...calendarForm,
                          slotDurationMinutes: event.target.value,
                        })
                      }
                      aria-label="Duração"
                    />
                  </UxField>
                  <UxField label="Intervalo (min)" htmlFor="calendar-buffer">
                    <input
                      id="calendar-buffer"
                      className="ux-input"
                      type="number"
                      min="0"
                      value={calendarForm.bufferMinutes}
                      onChange={(event) =>
                        setCalendarForm({ ...calendarForm, bufferMinutes: event.target.value })
                      }
                      aria-label="Intervalo"
                    />
                  </UxField>
                </div>
                <UxField
                  label="Capacidade diária"
                  htmlFor="calendar-capacity"
                  hint="Máximo de agendamentos por dia."
                >
                  <input
                    id="calendar-capacity"
                    className="ux-input"
                    type="number"
                    min="1"
                    value={calendarForm.dailyCapacity}
                    onChange={(event) =>
                      setCalendarForm({ ...calendarForm, dailyCapacity: event.target.value })
                    }
                    aria-label="Capacidade diária"
                  />
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              <span />
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  form="calendar-create-form"
                  className="ux-btn ux-btn--primary"
                  disabled={busy || !calendarForm.name.trim()}
                >
                  Criar agenda
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Cancelar agendamento?"
        description={`O agendamento ${pendingCancel?.title || "selecionado"} será cancelado e o horário ficará livre.`}
        confirmLabel="Cancelar agendamento"
        cancelLabel="Manter"
        destructive
        busy={busy}
        dark={isDarkMode}
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (!pendingCancel) return;
          const appointment = pendingCancel;
          setPendingCancel(null);
          void run(() => cancelAppointment(appointment.id), "Agendamento cancelado.");
        }}
      />
    </main>
  );
}

type ClientCategoryFilter = "all" | "saved_contact" | "potential_lead" | "manual";

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
  const [categoryFilter, setCategoryFilter] = useState<ClientCategoryFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
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
  const categoryOf = (client: WorkspaceClient) => client.contactCategory || "manual";
  const categoryCounts = {
    all: clients.length,
    saved_contact: clients.filter((client) => categoryOf(client) === "saved_contact").length,
    potential_lead: clients.filter((client) => categoryOf(client) === "potential_lead").length,
    manual: clients.filter((client) => categoryOf(client) === "manual").length,
  };
  const visibleClients = clients.filter((client) => {
    if (categoryFilter !== "all" && categoryOf(client) !== categoryFilter) return false;
    if (tagFilter && !client.tags.some((tag) => tag.id === tagFilter)) return false;
    return true;
  });
  const allVisibleSelected =
    visibleClients.length > 0 && visibleClients.every((client) => selected.includes(client.id));
  const categoryFilters: Array<{ id: ClientCategoryFilter; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "saved_contact", label: "Salvos" },
    { id: "potential_lead", label: "Possíveis leads" },
    { id: "manual", label: "Manuais" },
  ];

  return (
    <main className="inboxos-page inboxos-product-surface inboxos-clients-surface ux-page flex-1 overflow-auto">
      <div className="ux-container">
        <header className="ux-page-header">
          <div className="min-w-0">
            <h1 className="ux-h1" title="Clientes">
              Clientes
            </h1>
            <p className="ux-lead">
              Contatos do WhatsApp e leads cadastrados. Use tags para organizar e segmentar.
            </p>
          </div>
          <div className="ux-actions">
            <button
              type="button"
              className="ux-icon-btn"
              onClick={() => {
                initialSync.current = true;
                void refresh();
              }}
              aria-label="Atualizar dados de Clientes"
              title="Sincronizar com o WhatsApp"
            >
              <ArrowClockwise size={18} aria-hidden="true" />
            </button>
            <label className="ux-btn ux-btn--ghost cursor-pointer">
              <UploadSimple size={16} aria-hidden="true" /> Importar CSV
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
              type="button"
              className="ux-btn ux-btn--ghost"
              disabled={busy || !clients.length}
              onClick={exportCsv}
            >
              <DownloadSimple size={16} aria-hidden="true" /> Exportar CSV
            </button>
            <button
              type="button"
              className="ux-btn ux-btn--primary"
              onClick={() => setShowCreate(true)}
            >
              <UserPlus size={16} aria-hidden="true" /> Novo cliente
            </button>
          </div>
        </header>
        {error && <ErrorBox text={error} />}
        {viewState === "initial" && (
          <DataSkeleton label="Preparando clientes do workspace" columns={2} />
        )}
        {viewState === "refreshing" && (
          <p data-state="refreshing" role="status" className="ux-meta">
            Atualizando clientes...
          </p>
        )}
        {importSummary && (
          <p role="status" className="ux-meta">
            Importação: {importSummary}
          </p>
        )}
        {hasLoaded && (
          <section className="ux-panel" aria-label="Lista de clientes">
            <div className="ux-toolbar">
              <div className="ux-search">
                <MagnifyingGlass size={16} aria-hidden="true" />
                <input
                  className="ux-input"
                  aria-label="Buscar clientes"
                  placeholder="Buscar por nome, telefone, e-mail ou empresa"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="ux-segmented" role="tablist" aria-label="Filtrar por origem">
                {categoryFilters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={categoryFilter === item.id}
                    className="ux-segment"
                    onClick={() => setCategoryFilter(item.id)}
                  >
                    {item.label}
                    <span className="ux-segment-count">{categoryCounts[item.id]}</span>
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {tags.length > 0 && (
                  <SurfaceSelect
                    isDarkMode={isDarkMode}
                    className="ux-input min-w-[150px]"
                    value={tagFilter || "__all__"}
                    onValueChange={(value) => setTagFilter(value === "__all__" ? "" : value)}
                    placeholder="Todas as tags"
                    ariaLabel="Filtrar por tag"
                  >
                    <SelectItem value="__all__">Todas as tags</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SurfaceSelect>
                )}
                <button
                  type="button"
                  className="ux-btn ux-btn--ghost"
                  onClick={() => setTagsOpen(true)}
                >
                  <Tag size={16} aria-hidden="true" /> Tags
                </button>
              </div>
            </div>

            {selected.length > 0 && (
              <div className="ux-bulkbar" aria-live="polite">
                <span className="ux-strong">
                  {selected.length} {selected.length === 1 ? "selecionado" : "selecionados"}
                </span>
                <span className="ux-meta">Aplicar tag:</span>
                {tags.length === 0 && <span className="ux-meta">crie uma tag primeiro</span>}
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="ux-chip"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => assignClientTags(selected, [tag.id]),
                        `Tag ${tag.name} atribuída.`,
                      )
                    }
                  >
                    <span className="ux-chip-dot" style={{ background: tag.color }} />
                    {tag.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="ux-btn ux-btn--ghost ml-auto"
                  onClick={() => setSelected([])}
                >
                  Limpar seleção
                </button>
              </div>
            )}

            {visibleClients.length > 0 ? (
              <div className="ux-table" role="table" aria-label="Clientes">
                <div className="ux-table-head" role="row">
                  <span role="columnheader">
                    <Checkbox
                      aria-label="Selecionar todos os clientes visíveis"
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true
                            ? Array.from(
                                new Set([...current, ...visibleClients.map((client) => client.id)]),
                              )
                            : current.filter(
                                (id) => !visibleClients.some((client) => client.id === id),
                              ),
                        )
                      }
                    />
                  </span>
                  <span role="columnheader">Cliente</span>
                  <span role="columnheader" className="ux-col-company">
                    Empresa
                  </span>
                  <span role="columnheader" className="ux-col-tags">
                    Tags
                  </span>
                  <span role="columnheader" className="ux-col-origin">
                    Origem
                  </span>
                </div>
                {visibleClients.map((client) => {
                  const checked = selected.includes(client.id);
                  const category = categoryOf(client);
                  return (
                    <div
                      key={client.id}
                      className="ux-table-row"
                      role="row"
                      data-selected={checked}
                    >
                      <span role="cell">
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
                      </span>
                      <span role="cell" className="ux-client">
                        <span className="ux-avatar" aria-hidden="true">
                          {client.profilePicUrl ? (
                            <img src={client.profilePicUrl} alt="" loading="lazy" />
                          ) : (
                            <span>{(client.name || "?").trim().charAt(0).toUpperCase()}</span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <p title={client.name} className="truncate ux-strong">
                            {client.name}
                          </p>
                          <p
                            title={client.phone_e164 || client.email || "Sem contato"}
                            className="truncate ux-meta"
                          >
                            {client.phone_e164 || client.email || "Sem contato"}
                          </p>
                        </span>
                      </span>
                      <span role="cell" className="ux-col-company truncate ux-meta">
                        {client.company || "—"}
                      </span>
                      <span role="cell" className="ux-col-tags">
                        {client.tags.length ? (
                          client.tags.map((tag) => (
                            <span key={tag.id} className="ux-chip ux-chip--static">
                              <span className="ux-chip-dot" style={{ background: tag.color }} />
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="ux-meta">—</span>
                        )}
                      </span>
                      <span role="cell" className="ux-col-origin">
                        <span
                          className="ux-pill"
                          data-tone={category === "potential_lead" ? "positive" : undefined}
                        >
                          {category === "saved_contact"
                            ? "Salvo"
                            : category === "potential_lead"
                              ? "Possível lead"
                              : "Manual"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ux-empty">
                <p className="ux-h3">
                  {viewState === "empty" && !query ? "Nenhum cliente ainda" : "Nenhum resultado"}
                </p>
                <p>
                  {viewState === "empty" && !query
                    ? "Os contatos do WhatsApp aparecem aqui automaticamente. Você também pode importar um CSV ou cadastrar manualmente."
                    : "Ajuste a busca ou os filtros para ver outros clientes."}
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      <DialogPrimitive.Root open={showCreate} onOpenChange={setShowCreate}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="client-create-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">Novo cliente</DialogPrimitive.Title>
                <DialogPrimitive.Description id="client-create-description" className="ux-meta">
                  O cliente fica disponível no CRM, no calendário e para os agentes.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar novo cliente">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <form
              id="client-create-form"
              className="ux-drawer-body"
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
              <div className="ux-section">
                <UxField label="Nome" htmlFor="client-name">
                  <input
                    id="client-name"
                    className="ux-input"
                    placeholder="Nome do cliente"
                    value={newClient.name}
                    onChange={(event) => setNewClient({ ...newClient, name: event.target.value })}
                    required
                  />
                </UxField>
                <UxField
                  label="Telefone"
                  htmlFor="client-phone"
                  hint="Com código do país. Ex.: +5511999999999"
                >
                  <input
                    id="client-phone"
                    className="ux-input"
                    placeholder="+5511999999999"
                    inputMode="tel"
                    value={newClient.phone}
                    onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })}
                  />
                </UxField>
                <UxField label="E-mail" htmlFor="client-email" hint="Opcional.">
                  <input
                    id="client-email"
                    className="ux-input"
                    placeholder="cliente@empresa.com"
                    type="email"
                    value={newClient.email}
                    onChange={(event) => setNewClient({ ...newClient, email: event.target.value })}
                  />
                </UxField>
              </div>
            </form>
            <div className="ux-drawer-foot">
              <span />
              <div className="flex gap-2">
                <DialogPrimitive.Close className="ux-btn ux-btn--ghost">
                  Cancelar
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  form="client-create-form"
                  className="ux-btn ux-btn--primary"
                  disabled={busy || !newClient.name.trim()}
                >
                  Salvar cliente
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ux-drawer-overlay" />
          <DialogPrimitive.Content
            className="ux-drawer ux-drawer--narrow"
            aria-describedby="client-tags-description"
          >
            <div className="ux-drawer-head">
              <div className="min-w-0">
                <DialogPrimitive.Title className="ux-h2">Tags</DialogPrimitive.Title>
                <DialogPrimitive.Description id="client-tags-description" className="ux-meta">
                  Selecione clientes na lista para aplicar uma tag.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="ux-icon-btn" aria-label="Fechar tags">
                <X size={18} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <div className="ux-drawer-body">
              <form
                className="ux-section"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newTag.trim()) return;
                  void run(async () => {
                    const result = await saveClientTag({ name: newTag.trim(), color: "#71717a" });
                    setTags((current) => [...current, result.tag]);
                    setNewTag("");
                  }, "Tag criada.");
                }}
              >
                <UxField label="Nova tag" htmlFor="client-new-tag">
                  <div className="flex gap-2">
                    <input
                      id="client-new-tag"
                      className="ux-input"
                      placeholder="Ex.: VIP, Orçamento enviado"
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="ux-btn ux-btn--primary"
                      disabled={busy || !newTag.trim()}
                    >
                      Criar tag
                    </button>
                  </div>
                </UxField>
              </form>
              {tags.length > 0 ? (
                <ul className="ux-list border-t border-[var(--ux-line)]">
                  {tags.map((tag) => (
                    <li key={tag.id} className="ux-row">
                      <span className="ux-chip-dot" style={{ background: tag.color }} />
                      <span className="ux-row-main ux-strong">{tag.name}</span>
                      <span className="ux-meta">
                        {
                          clients.filter((client) => client.tags.some((t) => t.id === tag.id))
                            .length
                        }{" "}
                        clientes
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ux-meta border-t border-[var(--ux-line)] px-6 py-4">
                  Nenhuma tag criada.
                </p>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </main>
  );
}
