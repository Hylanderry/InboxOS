import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  isAllowedNewsletterMedia,
  MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES,
} from "@/lib/newsletter-upload-policy";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { AdminCustomerDetails } from "./admin/AdminCustomerDetails";
import { NewsletterPreview } from "./admin/NewsletterPreview";
import { formatAdminMetricLabel, formatAdminStatusLabel } from "./admin/admin-presentation";

type Tab = "overview" | "users" | "workspaces" | "integrations" | "newsletter" | "audit" | "admins";
type NewsletterBlock = {
  type: string;
  text?: string;
  src?: string;
  alt?: string;
  href?: string;
  thumbnail?: string;
  title?: string;
  label?: string;
  [key: string]: string | undefined;
};
type AdminUser = {
  id: string;
  email?: string;
  control?: { status?: string };
};
type AdminWorkspace = { id: string; name: string; slug: string; status: string };
type WorkspaceMember = { id: string; user_id: string; role: string; status: string };
type WorkspaceInvite = {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
};
type AdminIntegration = {
  id: string;
  key: string;
  provider?: string;
  name: string;
  base_url: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
};
type NewsletterCampaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  from_email: string | null;
  segment_id: string | null;
  content: NewsletterBlock[];
};
type NewsletterSegment = { id: string; name: string };
type SystemAdmin = { user_id: string; email?: string | null; role: string; status: string };
type AuditEntry = {
  id: string | number;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
  actor_role: string | null;
};
type AdminData = {
  metrics?: Record<string, unknown>;
  users?: AdminUser[];
  workspaces?: AdminWorkspace[];
  count?: number;
  hasMore?: boolean;
  integrations?: AdminIntegration[];
  campaigns?: NewsletterCampaign[];
  admins?: SystemAdmin[];
  entries?: AuditEntry[];
};
type AdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  execute: () => void;
};
const panels: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "users", label: "Usuários" },
  { id: "workspaces", label: "Workspaces" },
  { id: "integrations", label: "Serviços" },
  { id: "newsletter", label: "Newsletter" },
  { id: "audit", label: "Auditoria" },
  { id: "admins", label: "Administração" },
];
const systemRoleLabel: Record<string, string> = {
  superadmin: "Superadministrador",
  operator: "Operações",
  support: "Suporte",
  auditor: "Auditoria",
};
const workspaceRoleLabel: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador do workspace",
  manager: "Gerente",
  support: "Suporte",
  analyst: "Analista",
  agent: "Atendimento",
};

function AdminSelect({
  isDarkMode,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  children,
}: {
  isDarkMode: boolean;
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const inputClass = isDarkMode
    ? "w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none focus:border-white/40"
    : "w-full rounded-xl border border-black/15 bg-black/[0.03] px-3 py-2 text-xs text-neutral-900 outline-none focus:border-black/40";
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={inputClass} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

async function call<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await apiFetch(`/api/admin/${path}`, init, { workspace: false });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Falha HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

// Field/Box vivem no nível do módulo: declarados dentro de SystemAdminView, cada render criava
// um componente novo, remontava os inputs e fazia o campo perder o foco a cada tecla.
const AdminThemeContext = createContext(true);

function adminTheme(isDarkMode: boolean) {
  return {
    inputClass: isDarkMode
      ? "w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none focus:border-white/40"
      : "w-full rounded-xl border border-black/15 bg-black/[0.03] px-3 py-2 text-xs text-neutral-900 outline-none focus:border-black/40",
    boxBorderClass: isDarkMode
      ? "border-white/10 bg-white/[0.025]"
      : "border-black/10 bg-white/80 shadow-xs",
    textTitleClass: isDarkMode ? "text-white" : "text-neutral-900",
    textMutedClass: isDarkMode ? "text-zinc-400" : "text-neutral-500",
  };
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { inputClass, textMutedClass } = adminTheme(useContext(AdminThemeContext));
  const resolvedPlaceholder = placeholder ?? `Digite ${label.toLowerCase()}`;
  return (
    <label className={`grid gap-1 text-[11px] ${textMutedClass}`}>
      {label}
      {type === "password" ? (
        <PasswordInput
          disabled={disabled}
          type="password"
          value={value}
          placeholder={resolvedPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-10`}
        />
      ) : (
        <input
          disabled={disabled}
          type={type}
          value={value}
          placeholder={resolvedPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </label>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  const { boxBorderClass, textTitleClass } = adminTheme(useContext(AdminThemeContext));
  return (
    <section className={`min-w-0 rounded-2xl border ${boxBorderClass} p-4`}>
      <h3 className={`mb-4 break-words text-sm font-semibold ${textTitleClass}`}>{title}</h3>
      {children}
    </section>
  );
}

export function SystemAdminView({ isDarkMode = true }: { isDarkMode?: boolean }) {
  const inputClass = isDarkMode
    ? "w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none focus:border-white/40"
    : "w-full rounded-xl border border-black/15 bg-black/[0.03] px-3 py-2 text-xs text-neutral-900 outline-none focus:border-black/40";
  const actionClass = isDarkMode
    ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50 shadow-xs";
  const boxBorderClass = isDarkMode
    ? "border-white/10 bg-white/[0.025]"
    : "border-black/10 bg-white/80 shadow-xs";
  const rowBorderClass = isDarkMode ? "border-white/10" : "border-black/10";
  const selectedTabClass = isDarkMode
    ? "bg-white/[0.14] text-white"
    : "bg-black/[0.07] text-neutral-950";
  const textTitleClass = isDarkMode ? "text-white" : "text-neutral-900";
  const textMutedClass = isDarkMode ? "text-zinc-400" : "text-neutral-500";

  const [tab, setTab] = useState<Tab>("overview"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [data, setData] = useState<AdminData>({}),
    [role, setRole] = useState<string>(""),
    [selectedWorkspace, setSelectedWorkspace] = useState(""),
    [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1),
    [workspacesPage, setWorkspacesPage] = useState(1),
    [userFilter, setUserFilter] = useState(""),
    [workspaceFilter, setWorkspaceFilter] = useState("");
  const [memberData, setMemberData] = useState<WorkspaceMember[]>([]),
    [memberEdit, setMemberEdit] = useState<Record<string, string>>({});
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("agent");
  const [adminEmail, setAdminEmail] = useState(""),
    [adminRole, setAdminRole] = useState("support"),
    [adminStatus, setAdminStatus] = useState("active");
  const [statusReason, setStatusReason] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<AdminConfirmation | null>(null);
  const [integrationKey, setIntegrationKey] = useState("evolution"),
    [integrationName, setIntegrationName] = useState(""),
    [integrationUrl, setIntegrationUrl] = useState("");
  const [creatingCustom, setCreatingCustom] = useState(false),
    [integrationEnabled, setIntegrationEnabled] = useState(false);
  const [secretName, setSecretName] = useState("api_key"),
    [secretValue, setSecretValue] = useState("");
  // Configuração por campos (sem JSON cru): cada provedor mostra só o que faz sentido.
  const [integrationProvider, setIntegrationProvider] = useState("evolution");
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  const [allowedModelsText, setAllowedModelsText] = useState("");
  const [customTestPath, setCustomTestPath] = useState(""),
    [customHeader, setCustomHeader] = useState(""),
    [customPrefix, setCustomPrefix] = useState(""),
    [customSecretKey, setCustomSecretKey] = useState("");
  const loadConfigForm = (provider: string, config: Record<string, unknown>) => {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    setIntegrationProvider(provider);
    setConfigDraft(config);
    setAllowedModelsText(
      Array.isArray(config["allowed_models"])
        ? config["allowed_models"].filter((m): m is string => typeof m === "string").join("\n")
        : "",
    );
    setCustomTestPath(text(config["test_path"]));
    setCustomHeader(text(config["header"]));
    setCustomPrefix(text(config["prefix"]));
    setCustomSecretKey(text(config["secret_key"]));
    setSecretName("api_key");
  };
  const buildConfig = (): Record<string, unknown> => {
    // Parte da configuração existente para preservar chaves que esta tela não edita.
    const next: Record<string, unknown> = { ...configDraft };
    const setOrDrop = (key: string, value: string) => {
      if (value.trim()) next[key] = value.trim();
      else delete next[key];
    };
    if (integrationProvider === "groq" || integrationProvider === "openrouter") {
      const models = [
        ...new Set(
          allowedModelsText
            .split(/[\n,]+/)
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ];
      if (models.length) next["allowed_models"] = models;
      else delete next["allowed_models"];
    }
    if (integrationProvider === "custom") {
      setOrDrop("test_path", customTestPath);
      setOrDrop("header", customHeader);
      setOrDrop("prefix", customPrefix);
      setOrDrop("secret_key", customSecretKey);
    }
    return next;
  };
  const [campaignName, setCampaignName] = useState(""),
    [campaignSubject, setCampaignSubject] = useState(""),
    [campaignFrom, setCampaignFrom] = useState(""),
    [campaignSegment, setCampaignSegment] = useState("");
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([
    { type: "heading", text: "Novidades" },
    { type: "paragraph", text: "" },
  ]);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState(""),
    [audienceEmail, setAudienceEmail] = useState(""),
    [audienceSegmentId, setAudienceSegmentId] = useState(""),
    [consentConfirmed, setConsentConfirmed] = useState(false),
    [segments, setSegments] = useState<NewsletterSegment[]>([]);
  const run = useCallback(async (task: () => Promise<void>, ok?: string) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await task();
      if (ok) {
        setSuccess(ok);
        WhatsAppToast.success(ok);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setError(msg);
      WhatsAppToast.networkError(msg);
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = useCallback(
    async (which: Tab = tab) => {
      if (which === "overview") setData(await call<AdminData>("overview/"));
      if (which === "users") setData(await call<AdminData>(`users/?page=${usersPage}`));
      if (which === "workspaces")
        setData(await call<AdminData>(`workspaces/?page=${workspacesPage}`));
      if (which === "integrations") setData(await call<AdminData>("integrations/"));
      if (which === "newsletter") {
        setData(await call<AdminData>("newsletter/"));
        try {
          const a = await call<{ segments?: { data?: NewsletterSegment[] } }>(
            "newsletter/audience/",
          );
          setSegments(Array.isArray(a.segments?.data) ? a.segments.data : []);
        } catch {
          setSegments([]);
        }
      }
      if (which === "audit") setData(await call<AdminData>("audit/"));
      if (which === "admins") setData(await call<AdminData>("system-admins/"));
    },
    [tab, usersPage, workspacesPage],
  );
  useEffect(() => {
    let disposed = false;
    void call<{ role: string }>("me/")
      .then((d) => {
        if (!disposed) setRole(d.role);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    void run(() => refresh(tab));
  }, [tab, refresh, run]);
  const members = async (id: string) => {
    setSelectedWorkspace(id);
    const q = encodeURIComponent(id);
    const [r, v] = await Promise.all([
      call<{ members?: WorkspaceMember[] }>(`members/?workspaceId=${q}`),
      call<{ invitations?: WorkspaceInvite[] }>(`invitations/?workspaceId=${q}`),
    ]);
    setMemberData(r.members ?? []);
    setInvites(v.invitations ?? []);
  };
  const saveWorkspaceStatus = (workspaceId: string, status: "active" | "suspended") =>
    setPendingConfirmation({
      title: status === "suspended" ? "Suspender workspace?" : "Reativar workspace?",
      description:
        status === "suspended"
          ? "O workspace ficará indisponível para seus membros até ser reativado."
          : "Os membros poderão voltar a usar o workspace imediatamente.",
      confirmLabel: status === "suspended" ? "Suspender workspace" : "Reativar workspace",
      destructive: status === "suspended",
      execute: () =>
        void run(async () => {
          await call("workspaces/", "PATCH", { workspaceId, status, reason: statusReason || null });
          await refresh("workspaces");
        }, "Workspace atualizado."),
    });
  const saveUserStatus = (userId: string, status: "active" | "suspended") =>
    setPendingConfirmation({
      title: status === "suspended" ? "Suspender usuário?" : "Reativar usuário?",
      description:
        status === "suspended"
          ? "As sessões ativas serão revogadas e o acesso será bloqueado até nova ativação."
          : "O acesso do usuário será restaurado de acordo com as permissões existentes.",
      confirmLabel: status === "suspended" ? "Suspender usuário" : "Reativar usuário",
      destructive: status === "suspended",
      execute: () =>
        void run(async () => {
          await call("users/", "PATCH", { userId, status, reason: statusReason || null });
          await refresh("users");
        }, "Usuário atualizado."),
    });
  const filteredUsers = (data.users ?? []).filter((user) => {
    const query = userFilter.trim().toLowerCase();
    return !query || `${user.email ?? ""} ${user.id}`.toLowerCase().includes(query);
  });
  const filteredWorkspaces = (data.workspaces ?? []).filter((workspace) => {
    const query = workspaceFilter.trim().toLowerCase();
    return !query || `${workspace.name} ${workspace.slug}`.toLowerCase().includes(query);
  });
  return (
    <AdminThemeContext.Provider value={isDarkMode}>
      <div
        className={`admin-control-plane min-h-0 min-w-0 w-full space-y-5 px-3 pb-24 pt-5 sm:px-6 ${isDarkMode ? "text-white" : "text-neutral-900"}`}
      >
        <header className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">Administração global</h2>
          <p className={`text-xs ${textMutedClass}`}>
            Controle independente de workspaces · papel:{" "}
            {systemRoleLabel[role] || role || "validando"}
          </p>
        </header>
        <div className="admin-control-plane__tabs inboxos-admin-tabs">
          <div className="flex gap-2" role="tablist" aria-label="Áreas administrativas">
            {panels
              .filter(
                (x) =>
                  role === "superadmin" ||
                  (role === "operator" && x.id !== "admins") ||
                  (role === "support" &&
                    ["overview", "users", "workspaces", "audit"].includes(x.id)) ||
                  (role === "auditor" && ["overview", "audit"].includes(x.id)),
              )
              .map((x) => (
                <button
                  key={x.id}
                  onClick={() => setTab(x.id)}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const tabs = Array.from(
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      ) ?? [],
                    );
                    const currentIndex = tabs.indexOf(event.currentTarget);
                    if (currentIndex < 0 || tabs.length === 0) return;
                    const nextIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                            tabs.length;
                    const nextTab = tabs[nextIndex];
                    const nextId = nextTab?.dataset["adminTab"] as Tab | undefined;
                    if (!nextTab || !nextId) return;
                    setTab(nextId);
                    nextTab.focus();
                  }}
                  id={`admin-tab-${x.id}`}
                  data-admin-tab={x.id}
                  className={`${actionClass} admin-control-plane__action ${tab === x.id ? selectedTabClass : ""}`}
                  role="tab"
                  tabIndex={tab === x.id ? 0 : -1}
                  aria-selected={tab === x.id}
                  aria-controls={`admin-panel-${x.id}`}
                >
                  {x.label}
                </button>
              ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="inbox-feedback inbox-feedback-error">
            <WarningCircle size={17} weight="duotone" aria-hidden="true" />
            {error}
          </p>
        )}
        {success && (
          <p className="inbox-feedback inbox-feedback-success" role="status">
            <CheckCircle size={17} weight="duotone" aria-hidden="true" />
            {success}
          </p>
        )}
        <button
          className={`${actionClass} admin-control-plane__action`}
          disabled={loading}
          onClick={() => void run(() => refresh())}
        >
          {loading ? "Carregando..." : "Atualizar dados"}
        </button>
        {tab === "overview" && (
          <div id="admin-panel-overview" role="tabpanel" aria-labelledby="admin-tab-overview">
            <Box title="Indicadores globais">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {Object.entries(data.metrics ?? {}).map(([key, val]) => (
                  <div
                    key={key}
                    className={`admin-control-plane__metric rounded-xl border ${rowBorderClass} p-3`}
                  >
                    <p className={`text-[10px] ${textMutedClass}`}>{formatAdminMetricLabel(key)}</p>
                    <p className="mt-2 text-lg font-semibold">{String(val)}</p>
                  </div>
                ))}
              </div>
            </Box>
          </div>
        )}
        {tab === "users" && (
          <div
            id="admin-panel-users"
            role="tabpanel"
            aria-labelledby="admin-tab-users"
            className="space-y-3"
          >
            <Box title="Suspensão, sessões e contas">
              <p className={`mb-3 text-xs ${textMutedClass}`}>
                Ações auditadas. Não é possível suspender a própria conta nem o último superadmin.
              </p>
              <Field
                label="Justificativa (registrada na auditoria)"
                value={statusReason}
                onChange={setStatusReason}
              />
              <label className={`mb-3 mt-3 grid max-w-lg gap-1 text-xs ${textMutedClass}`}>
                Filtro desta página
                <input
                  className={inputClass}
                  value={userFilter}
                  onChange={(event) => setUserFilter(event.target.value)}
                  placeholder="E-mail ou ID"
                  aria-label="Filtrar esta página de usuários"
                />
              </label>
              <div className="mt-4 grid gap-2">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className={`admin-control-plane__row flex min-w-0 flex-col gap-2 rounded-xl border ${rowBorderClass} p-3 sm:flex-row sm:items-center sm:justify-between`}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm">{u.email || u.id}</p>
                      <p className={`break-all text-[10px] ${textMutedClass}`}>
                        {u.id} · {formatAdminStatusLabel(u.control?.status || "active")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className={actionClass} onClick={() => setSelectedCustomerId(u.id)}>
                        Detalhes
                      </button>
                      {(role === "superadmin" || role === "operator") &&
                        (u.control?.status === "suspended" ? (
                          <button
                            className={actionClass}
                            disabled={loading}
                            onClick={() => void saveUserStatus(u.id, "active")}
                          >
                            Reativar
                          </button>
                        ) : (
                          <button
                            className={actionClass}
                            disabled={loading}
                            onClick={() => void saveUserStatus(u.id, "suspended")}
                          >
                            Suspender
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${textMutedClass}`}>
                  Página {usersPage} · até 50 cadastros por página
                </p>
                <div className="flex gap-2">
                  <button
                    className={actionClass}
                    disabled={loading || usersPage <= 1}
                    onClick={() => {
                      setUsersPage((value) => Math.max(1, value - 1));
                      setSelectedCustomerId(null);
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    className={actionClass}
                    disabled={loading || data.hasMore === false || filteredUsers.length < 50}
                    onClick={() => {
                      setUsersPage((value) => value + 1);
                      setSelectedCustomerId(null);
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
              {selectedCustomerId && (
                <div className="mt-4">
                  <AdminCustomerDetails
                    userId={selectedCustomerId}
                    dark={isDarkMode}
                    onClose={() => setSelectedCustomerId(null)}
                  />
                </div>
              )}
            </Box>
          </div>
        )}
        {tab === "workspaces" && (
          <div
            id="admin-panel-workspaces"
            role="tabpanel"
            aria-labelledby="admin-tab-workspaces"
            className="space-y-3"
          >
            <Box title="Workspaces">
              <Field label="Justificativa" value={statusReason} onChange={setStatusReason} />
              <label className={`mb-3 mt-3 grid max-w-lg gap-1 text-xs ${textMutedClass}`}>
                Filtro desta página
                <input
                  className={inputClass}
                  value={workspaceFilter}
                  onChange={(event) => setWorkspaceFilter(event.target.value)}
                  placeholder="Nome ou slug"
                  aria-label="Filtrar esta página de workspaces"
                />
              </label>
              <div className="mt-4 grid gap-2">
                {filteredWorkspaces.map((w) => (
                  <div
                    key={w.id}
                    className={`admin-control-plane__row flex min-w-0 flex-col gap-2 rounded-xl border ${rowBorderClass} p-3 sm:flex-row sm:items-center sm:justify-between`}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{w.name}</p>
                      <p className={`break-words text-[10px] ${textMutedClass}`}>
                        {w.slug} · {formatAdminStatusLabel(w.status)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className={actionClass} onClick={() => void run(() => members(w.id))}>
                        Membros
                      </button>
                      {(role === "superadmin" || role === "operator") && (
                        <button
                          disabled={loading}
                          className={actionClass}
                          onClick={() =>
                            void saveWorkspaceStatus(
                              w.id,
                              w.status === "active" ? "suspended" : "active",
                            )
                          }
                        >
                          {w.status === "active" ? "Suspender" : "Reativar"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${textMutedClass}`}>
                  Página {workspacesPage} · {data.count ?? "-"} workspace(s) no total
                </p>
                <div className="flex gap-2">
                  <button
                    className={actionClass}
                    disabled={loading || workspacesPage <= 1}
                    onClick={() => {
                      setWorkspacesPage((value) => Math.max(1, value - 1));
                      setSelectedWorkspace("");
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    className={actionClass}
                    disabled={loading || data.hasMore === false || filteredWorkspaces.length < 50}
                    onClick={() => {
                      setWorkspacesPage((value) => value + 1);
                      setSelectedWorkspace("");
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </Box>
            {selectedWorkspace && (
              <Box title="Membros e papéis">
                <p className={`mb-2 text-xs ${textMutedClass}`}>Workspace: {selectedWorkspace}</p>
                {memberData.map((m) => (
                  <div
                    key={m.id}
                    className={`my-2 grid min-w-0 gap-2 rounded-xl border ${rowBorderClass} p-3 md:grid-cols-[minmax(0,1fr)_130px_130px_auto]`}
                  >
                    <p className="self-center break-all text-xs">{m.user_id}</p>
                    <AdminSelect
                      isDarkMode={isDarkMode}
                      value={memberEdit[`${m.id}:role`] || m.role}
                      onValueChange={(memberRole) =>
                        setMemberEdit((s) => ({ ...s, [`${m.id}:role`]: memberRole }))
                      }
                      ariaLabel={`Papel de ${m.user_id}`}
                    >
                      <SelectItem value="agent">{workspaceRoleLabel["agent"]}</SelectItem>
                      <SelectItem value="support">{workspaceRoleLabel["support"]}</SelectItem>
                      <SelectItem value="analyst">{workspaceRoleLabel["analyst"]}</SelectItem>
                      <SelectItem value="manager">{workspaceRoleLabel["manager"]}</SelectItem>
                      <SelectItem value="admin">{workspaceRoleLabel["admin"]}</SelectItem>
                      {role === "superadmin" && (
                        <SelectItem value="owner">{workspaceRoleLabel["owner"]}</SelectItem>
                      )}
                    </AdminSelect>
                    <AdminSelect
                      isDarkMode={isDarkMode}
                      value={memberEdit[`${m.id}:status`] || m.status}
                      onValueChange={(memberStatus) =>
                        setMemberEdit((s) => ({ ...s, [`${m.id}:status`]: memberStatus }))
                      }
                      ariaLabel={`Status de ${m.user_id}`}
                    >
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                    </AdminSelect>
                    <button
                      disabled={loading}
                      className={actionClass}
                      onClick={() =>
                        void run(async () => {
                          await call("members/", "PATCH", {
                            workspaceId: selectedWorkspace,
                            userId: m.user_id,
                            role: memberEdit[`${m.id}:role`] || m.role,
                            status: memberEdit[`${m.id}:status`] || m.status,
                          });
                          await members(selectedWorkspace);
                        }, "Membro atualizado")
                      }
                    >
                      Salvar
                    </button>
                  </div>
                ))}
              </Box>
            )}
            {selectedWorkspace && (
              <Box title="Convites por e-mail">
                <p className={`mb-3 text-xs ${textMutedClass}`}>
                  Convites duram 7 dias e são enviados pelo Resend. Contas já vinculadas devem ser
                  gerenciadas em Membros.
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                  <Field
                    label="E-mail do convidado"
                    type="email"
                    value={inviteEmail}
                    onChange={setInviteEmail}
                  />
                  <label className={`grid gap-1 text-xs ${textMutedClass}`}>
                    Papel
                    <AdminSelect
                      isDarkMode={isDarkMode}
                      value={inviteRole}
                      onValueChange={setInviteRole}
                      ariaLabel="Papel do convidado"
                    >
                      <SelectItem value="agent">{workspaceRoleLabel["agent"]}</SelectItem>
                      <SelectItem value="support">{workspaceRoleLabel["support"]}</SelectItem>
                      <SelectItem value="analyst">{workspaceRoleLabel["analyst"]}</SelectItem>
                      <SelectItem value="manager">{workspaceRoleLabel["manager"]}</SelectItem>
                      <SelectItem value="admin">{workspaceRoleLabel["admin"]}</SelectItem>
                    </AdminSelect>
                  </label>
                  <button
                    className={`${actionClass} self-end`}
                    disabled={loading || !inviteEmail}
                    onClick={() =>
                      void run(async () => {
                        await call("invitations/", "POST", {
                          workspaceId: selectedWorkspace,
                          email: inviteEmail,
                          role: inviteRole,
                        });
                        setInviteEmail("");
                        await members(selectedWorkspace);
                      }, "Convite enviado")
                    }
                  >
                    Convidar
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {invites.map((i) => (
                    <div
                      key={i.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border ${rowBorderClass} p-3 text-xs`}
                    >
                      <div className="min-w-0 break-all">
                        {i.email} · {workspaceRoleLabel[i.role] || i.role} ·{" "}
                        {i.accepted_at
                          ? "aceito"
                          : i.revoked_at
                            ? "revogado"
                            : new Date(i.expires_at) < new Date()
                              ? "expirado"
                              : "pendente"}
                      </div>
                      {!i.accepted_at && !i.revoked_at && new Date(i.expires_at) >= new Date() && (
                        <button
                          className={actionClass}
                          disabled={loading}
                          onClick={() =>
                            setPendingConfirmation({
                              title: "Revogar convite pendente?",
                              description: `O link enviado para ${i.email} deixará de ser válido imediatamente.`,
                              confirmLabel: "Revogar convite",
                              destructive: true,
                              execute: () =>
                                void run(async () => {
                                  await call("invitations/", "PATCH", {
                                    workspaceId: selectedWorkspace,
                                    invitationId: i.id,
                                  });
                                  await members(selectedWorkspace);
                                }, "Convite revogado"),
                            })
                          }
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Box>
            )}
          </div>
        )}
        {tab === "integrations" && (
          <div
            id="admin-panel-integrations"
            role="tabpanel"
            aria-labelledby="admin-tab-integrations"
            className="space-y-3"
          >
            <Box title="Chaves e conexões">
              <p className={`mb-3 text-xs ${textMutedClass}`}>
                Valores secretos são gravados criptografados e jamais exibidos novamente. A chave
                mestra permanece somente no ambiente do servidor.
              </p>
              <div className="grid gap-2">
                {(data.integrations ?? []).map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setCreatingCustom(false);
                      setIntegrationKey(i.key);
                      setIntegrationName(i.name);
                      setIntegrationUrl(i.base_url || "");
                      setIntegrationEnabled(i.enabled === true);
                      loadConfigForm(i.provider ?? "custom", i.config || {});
                    }}
                    className={`rounded-xl border p-3 text-left text-xs transition-colors ${integrationKey === i.key ? (isDarkMode ? "border-white/40 bg-white/[0.06]" : "border-black/30 bg-black/[0.03]") : rowBorderClass}`}
                  >
                    <b>{i.name || i.key}</b> · {i.enabled ? "ativada" : "desativada"}
                    <p className={`mt-1 ${textMutedClass}`}>
                      Configuração protegida · segredo nunca exibido
                    </p>
                  </button>
                ))}
              </div>
              <button
                className={`${actionClass} mt-3`}
                onClick={() => {
                  setCreatingCustom(true);
                  setIntegrationKey("");
                  setIntegrationName("");
                  setIntegrationUrl("");
                  setIntegrationEnabled(false);
                  loadConfigForm("custom", {});
                }}
              >
                Adicionar integração custom
              </button>
            </Box>
            <Box title="Alterar integração">
              <Field
                label="Chave de identificação"
                disabled={!creatingCustom}
                value={integrationKey}
                onChange={setIntegrationKey}
              />
              <div className="mt-2">
                <Field
                  label="Nome amigável"
                  value={integrationName}
                  onChange={setIntegrationName}
                />
              </div>
              <div className="mt-2">
                <Field label="URL HTTPS" value={integrationUrl} onChange={setIntegrationUrl} />
              </div>
              <label
                htmlFor="integration-enabled"
                className={`mt-2 flex min-h-11 items-center gap-2 text-xs ${textMutedClass}`}
              >
                <Checkbox
                  id="integration-enabled"
                  checked={integrationEnabled}
                  onCheckedChange={(checked) => setIntegrationEnabled(checked === true)}
                />
                Integração ativada
              </label>
              {(integrationProvider === "groq" || integrationProvider === "openrouter") && (
                <label className={`mt-2 grid gap-1 text-xs ${textMutedClass}`}>
                  Modelos liberados (um por linha)
                  <textarea
                    className={`${inputClass} min-h-24 font-mono`}
                    value={allowedModelsText}
                    onChange={(e) => setAllowedModelsText(e.target.value)}
                    placeholder={"provedor/modelo-a\nprovedor/modelo-b"}
                    spellCheck={false}
                  />
                  <span className="text-[11px]">
                    O catálogo fica sob controle do administrador: workspaces não recebem a chave e
                    só podem escolher modelos desta lista.
                  </span>
                </label>
              )}
              {integrationProvider === "custom" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field
                    label="Caminho de teste"
                    value={customTestPath}
                    onChange={setCustomTestPath}
                    placeholder="/v1/health"
                  />
                  <Field
                    label="Nome do segredo usado no teste"
                    value={customSecretKey}
                    onChange={setCustomSecretKey}
                    placeholder="api_key"
                  />
                  <Field
                    label="Cabeçalho de autenticação"
                    value={customHeader}
                    onChange={setCustomHeader}
                    placeholder="Authorization"
                  />
                  <Field
                    label="Prefixo do valor"
                    value={customPrefix}
                    onChange={setCustomPrefix}
                    placeholder="Bearer "
                  />
                </div>
              )}
              <button
                disabled={loading}
                className={`${actionClass} mt-3`}
                onClick={() =>
                  void run(async () => {
                    await call(
                      "integrations/",
                      creatingCustom ? "POST" : "PATCH",
                      creatingCustom
                        ? {
                            key: integrationKey,
                            name: integrationName,
                            baseUrl: integrationUrl || null,
                            provider: "custom",
                            enabled: integrationEnabled,
                            config: buildConfig(),
                          }
                        : {
                            key: integrationKey,
                            name: integrationName,
                            baseUrl: integrationUrl || null,
                            enabled: integrationEnabled,
                            config: buildConfig(),
                          },
                    );
                    setCreatingCustom(false);
                    await refresh("integrations");
                  }, "Integração salva")
                }
              >
                Salvar configurações
              </button>
              <button
                className={`${actionClass} mt-3 ml-2`}
                disabled={loading || creatingCustom}
                onClick={() =>
                  void run(async () => {
                    const r = await call<{ ok: boolean }>("integrations/test/", "POST", {
                      key: integrationKey,
                    });
                    if (!r.ok) throw Error("Conexão não aprovada");
                    await refresh("integrations");
                  }, "Conectividade verificada")
                }
              >
                Testar conexão
              </button>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {integrationProvider === "custom" ? (
                  <Field label="Nome do segredo" value={secretName} onChange={setSecretName} />
                ) : (
                  <label className={`grid gap-1 text-[11px] ${textMutedClass}`}>
                    Segredo a rotacionar
                    <AdminSelect
                      isDarkMode={isDarkMode}
                      value={secretName}
                      onValueChange={setSecretName}
                      ariaLabel="Segredo a rotacionar"
                    >
                      <SelectItem value="api_key">Chave de API</SelectItem>
                      {integrationProvider === "evolution" && (
                        <SelectItem value="webhook_token">Token de webhook</SelectItem>
                      )}
                    </AdminSelect>
                  </label>
                )}
                <Field
                  label="Novo segredo (não será exibido novamente)"
                  type="password"
                  value={secretValue}
                  onChange={setSecretValue}
                />
              </div>
              <button
                className={`${actionClass} mt-3`}
                disabled={loading || secretValue.length < 8}
                onClick={() =>
                  void run(async () => {
                    await call("integrations/rotate/", "POST", {
                      integrationKey,
                      secretKey: secretName,
                      value: secretValue,
                    });
                    setSecretValue("");
                    await refresh("integrations");
                  }, "Segredo rotacionado")
                }
              >
                Rotacionar segredo
              </button>
            </Box>
          </div>
        )}
        {tab === "newsletter" && (
          <div
            id="admin-panel-newsletter"
            role="tabpanel"
            aria-labelledby="admin-tab-newsletter"
            className="space-y-3"
          >
            <Box title="Campanhas">
              <div className="grid gap-2">
                {(data.campaigns ?? []).map((c) => (
                  <div key={c.id} className={`rounded-xl border ${rowBorderClass} p-3`}>
                    <p className="text-sm">
                      {c.name} — {c.subject}
                    </p>
                    <p className={`text-[10px] ${textMutedClass}`}>
                      {c.id} · {c.status}
                    </p>
                    {c.status === "draft" && (
                      <button
                        className={`${actionClass} mt-2`}
                        disabled={loading}
                        onClick={() => {
                          setCreatedCampaignId(c.id);
                          setCampaignName(c.name);
                          setCampaignSubject(c.subject);
                          setCampaignFrom(c.from_email || "");
                          setCampaignSegment(c.segment_id || "");
                          setBlocks(c.content || []);
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Box>
            <Box title="Segmentos e audiência">
              <p className={`mb-3 text-xs ${textMutedClass}`}>
                Adicione contatos de marketing apenas com consentimento explícito. Unsubscribe é
                gerenciado pelo Resend.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  label="Nome do novo segmento"
                  value={segmentName}
                  onChange={setSegmentName}
                />
                <div className="self-end">
                  <button
                    className={actionClass}
                    disabled={loading || !segmentName.trim()}
                    onClick={() =>
                      void run(async () => {
                        await call("newsletter/audience/", "POST", {
                          action: "create_segment",
                          name: segmentName,
                        });
                        setSegmentName("");
                        await refresh("newsletter");
                      }, "Segmento criado")
                    }
                  >
                    Criar segmento
                  </button>
                </div>
                <Field
                  label="E-mail do assinante"
                  type="email"
                  value={audienceEmail}
                  onChange={setAudienceEmail}
                />
                <label className={`grid gap-1 text-xs ${textMutedClass}`}>
                  Segmento
                  <AdminSelect
                    isDarkMode={isDarkMode}
                    value={audienceSegmentId || "__none__"}
                    onValueChange={(segmentId) =>
                      setAudienceSegmentId(segmentId === "__none__" ? "" : segmentId)
                    }
                    ariaLabel="Segmento da newsletter"
                  >
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {segments.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </AdminSelect>
                </label>
              </div>
              <label
                htmlFor="newsletter-marketing-consent"
                className={`mt-3 flex min-h-11 items-center gap-2 text-xs ${textMutedClass}`}
              >
                <Checkbox
                  id="newsletter-marketing-consent"
                  checked={consentConfirmed}
                  onCheckedChange={(checked) => setConsentConfirmed(checked === true)}
                />
                Confirmo que este contato autorizou receber comunicações de marketing.
              </label>
              <button
                className={`${actionClass} mt-3`}
                disabled={loading || !consentConfirmed || !audienceEmail || !audienceSegmentId}
                onClick={() =>
                  void run(async () => {
                    await call("newsletter/audience/", "POST", {
                      action: "add_contact",
                      email: audienceEmail,
                      segmentId: audienceSegmentId,
                      consentConfirmed: true,
                    });
                    setAudienceEmail("");
                    setAudienceSegmentId("");
                    setConsentConfirmed(false);
                  }, "Contato adicionado ao segmento")
                }
              >
                Adicionar contato
              </button>
            </Box>
            <Box title="Editor de newsletter">
              <p className={`mb-3 text-xs ${textMutedClass}`}>
                Imagens renderizam por URL HTTPS. Vídeo é capa clicável, não player embutido no
                e-mail.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Nome da campanha" value={campaignName} onChange={setCampaignName} />
                <Field label="Assunto" value={campaignSubject} onChange={setCampaignSubject} />
                <Field
                  label="E-mail de origem"
                  type="email"
                  value={campaignFrom}
                  onChange={setCampaignFrom}
                />
                <Field
                  label="ID do segmento Resend"
                  value={campaignSegment}
                  onChange={setCampaignSegment}
                />
              </div>
              <div className="my-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
                <div className="space-y-3">
                  {blocks.map((b, index) => (
                    <div key={index} className={`rounded-xl border ${rowBorderClass} p-3`}>
                      <div className="flex flex-wrap gap-2">
                        <span className={`self-center text-xs ${textMutedClass}`}>
                          Tipo de conteúdo
                        </span>
                        <AdminSelect
                          isDarkMode={isDarkMode}
                          value={b.type}
                          onValueChange={(blockType) =>
                            setBlocks((old) =>
                              old.map((row, i) => (i === index ? { type: blockType } : row)),
                            )
                          }
                          ariaLabel={`Tipo do bloco ${index + 1}`}
                        >
                          {["heading", "paragraph", "image", "video", "button", "divider"].map(
                            (v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ),
                          )}
                        </AdminSelect>
                        <button
                          className={actionClass}
                          onClick={() => setBlocks((s) => s.filter((_, i) => i !== index))}
                        >
                          Excluir
                        </button>
                        <button
                          className={actionClass}
                          disabled={index === 0}
                          aria-label="Mover para cima"
                          onClick={() =>
                            setBlocks((s) => {
                              if (index === 0) return s;
                              const next = [...s];
                              [next[index - 1]!, next[index]!] = [next[index]!, next[index - 1]!];
                              return next;
                            })
                          }
                        >
                          Mover para cima
                        </button>
                        <button
                          className={actionClass}
                          disabled={index === blocks.length - 1}
                          aria-label="Mover para baixo"
                          onClick={() =>
                            setBlocks((s) => {
                              if (index >= s.length - 1) return s;
                              const next = [...s];
                              [next[index]!, next[index + 1]!] = [next[index + 1]!, next[index]!];
                              return next;
                            })
                          }
                        >
                          Mover para baixo
                        </button>
                      </div>
                      {(b.type === "heading" || b.type === "paragraph") && (
                        <textarea
                          className={`${inputClass} mt-2 min-h-20`}
                          value={b.text || ""}
                          onChange={(e) =>
                            setBlocks((s) =>
                              s.map((row, i) =>
                                i === index ? { ...row, text: e.target.value } : row,
                              ),
                            )
                          }
                        />
                      )}
                      {(b.type === "image" || b.type === "video" || b.type === "button") &&
                        (b.type === "image"
                          ? ["src", "alt"]
                          : b.type === "video"
                            ? ["href", "thumbnail", "title"]
                            : ["href", "label"]
                        ).map((k) => (
                          <input
                            key={k}
                            placeholder={k}
                            className={`${inputClass} mt-2`}
                            value={b[k] || ""}
                            onChange={(e) =>
                              setBlocks((s) =>
                                s.map((row, i) =>
                                  i === index ? { ...row, [k]: e.target.value } : row,
                                ),
                              )
                            }
                          />
                        ))}
                    </div>
                  ))}
                </div>
                <NewsletterPreview blocks={blocks} subject={campaignSubject} />
              </div>
              <button
                className={actionClass}
                onClick={() => setBlocks((s) => [...s, { type: "paragraph", text: "" }])}
              >
                Adicionar bloco
              </button>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={actionClass}
                  disabled={loading}
                  onClick={() =>
                    void run(async () => {
                      if (
                        blocks.some(
                          (b) => b.type === "video" && !b.thumbnail?.startsWith("https://"),
                        )
                      )
                        throw new Error(
                          "Informe a URL HTTPS de uma imagem de capa em cada bloco de vídeo antes de salvar.",
                        );
                      const r = await call<{ campaign: { id: string } }>(
                        "newsletter/",
                        createdCampaignId ? "PATCH" : "POST",
                        {
                          id: createdCampaignId || undefined,
                          name: campaignName,
                          subject: campaignSubject,
                          fromEmail: campaignFrom,
                          segmentId: campaignSegment,
                          content: blocks,
                        },
                      );
                      setCreatedCampaignId(r.campaign.id);
                      await refresh("newsletter");
                    }, "Rascunho salvo")
                  }
                >
                  Salvar rascunho
                </button>
                <button
                  className={actionClass}
                  disabled={loading || !createdCampaignId}
                  onClick={() =>
                    setPendingConfirmation({
                      title: "Enviar campanha agora?",
                      description:
                        "O envio será iniciado para o segmento selecionado e não poderá ser desfeito.",
                      confirmLabel: "Enviar campanha",
                      destructive: true,
                      execute: () =>
                        void run(async () => {
                          await call("newsletter/send/", "POST", {
                            id: createdCampaignId,
                            confirmation: "ENVIAR NEWSLETTER",
                          });
                          await refresh("newsletter");
                        }, "Campanha enviada ao Resend"),
                    })
                  }
                >
                  Enviar campanha
                </button>
              </div>
            </Box>
            <Box title="Upload de imagem ou vídeo">
              <p className={`mb-2 text-xs ${textMutedClass}`}>
                Envio direto pelo servidor: até{" "}
                {MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES / (1024 * 1024)} MB. Para vídeos maiores,
                hospede fora e use o link HTTPS; o bloco de vídeo exige uma capa HTTPS.
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                onChange={(e) => setAssetFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
              <button
                className={`${actionClass} ml-3`}
                disabled={!assetFile || loading}
                onClick={() =>
                  void run(async () => {
                    if (!assetFile || !isAllowedNewsletterMedia(assetFile.type, assetFile.size))
                      throw new Error(
                        "Arquivo não permitido ou acima de 3 MB; use uma URL HTTPS para vídeos maiores.",
                      );
                    const form = new FormData();
                    form.append("file", assetFile);
                    const r = await apiFetch(
                      "/api/admin/newsletter/media/",
                      { method: "POST", body: form },
                      { workspace: false },
                    );
                    const p = await r.json();
                    if (!r.ok) throw Error(p.error || "Erro no upload");
                    setBlocks((s) => [
                      ...s,
                      p.kind === "image"
                        ? { type: "image", src: p.url, alt: "Imagem da campanha" }
                        : {
                            type: "video",
                            href: p.url,
                            thumbnail:
                              s
                                .slice()
                                .reverse()
                                .find((b) => b.type === "image" && b.src?.startsWith("https://"))
                                ?.src ?? "",
                            title: "Assistir ao vídeo",
                          },
                    ]);
                  }, "Arquivo adicionado ao editor")
                }
              >
                Enviar mídia
              </button>
            </Box>
          </div>
        )}
        {tab === "admins" && role === "superadmin" && (
          <div
            id="admin-panel-admins"
            role="tabpanel"
            aria-labelledby="admin-tab-admins"
            className="space-y-3"
          >
            <Box title="Administradores globais">
              <p className={`mb-3 text-xs ${textMutedClass}`}>
                Apenas superadmin pode alterar funções globais. O último superadmin ativo fica
                protegido.
              </p>
              <div className="grid gap-2">
                {(data.admins ?? []).map((a) => (
                  <button
                    key={a.user_id}
                    className={`min-w-0 break-all rounded-lg border ${rowBorderClass} p-3 text-left text-xs`}
                    onClick={() => {
                      setAdminEmail(a.email ?? "");
                      setAdminRole(a.role);
                      setAdminStatus(a.status);
                    }}
                  >
                    {a.email ?? "Usuário sem e-mail"} · {a.role} · {a.status}
                  </button>
                ))}
              </div>
            </Box>
            <Box title="Adicionar ou alterar System Admin">
              <Field
                type="email"
                label="E-mail do usuário cadastrado"
                placeholder="pessoa@empresa.com"
                value={adminEmail}
                onChange={setAdminEmail}
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  Papel
                  <AdminSelect
                    isDarkMode={isDarkMode}
                    value={adminRole}
                    onValueChange={setAdminRole}
                    ariaLabel="Papel do System Admin"
                  >
                    {Object.entries(systemRoleLabel).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </AdminSelect>
                </label>
                <label className="grid gap-1 text-xs">
                  Status
                  <AdminSelect
                    isDarkMode={isDarkMode}
                    value={adminStatus}
                    onValueChange={setAdminStatus}
                    ariaLabel="Status do System Admin"
                  >
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </AdminSelect>
                </label>
              </div>
              <button
                className={`${actionClass} mt-3`}
                disabled={loading || !adminEmail}
                onClick={() =>
                  setPendingConfirmation({
                    title: "Alterar privilégio global?",
                    description:
                      "A alteração modifica o acesso administrativo do usuário em todos os workspaces.",
                    confirmLabel: "Salvar administrador",
                    destructive: adminStatus === "suspended",
                    execute: () =>
                      void run(async () => {
                        await call("system-admins/", "POST", {
                          email: adminEmail.trim(),
                          role: adminRole,
                          status: adminStatus,
                        });
                        await refresh("admins");
                      }, "System Admin atualizado"),
                  })
                }
              >
                Salvar administrador
              </button>
            </Box>
          </div>
        )}
        {tab === "audit" && (
          <div id="admin-panel-audit" role="tabpanel" aria-labelledby="admin-tab-audit">
            <Box title="Últimas ações administrativas">
              <div className="grid gap-2">
                {(data.entries ?? []).map((e) => (
                  <div
                    key={e.id}
                    className={`min-w-0 break-words rounded-xl border ${rowBorderClass} p-3 text-xs`}
                  >
                    <b>{e.action}</b> · {e.target_type}/{e.target_id}
                    <p className={`mt-1 ${textMutedClass}`}>
                      {new Date(e.created_at).toLocaleString("pt-BR")} · {e.actor_role}
                    </p>
                  </div>
                ))}
              </div>
            </Box>
          </div>
        )}
        <ConfirmDialog
          open={Boolean(pendingConfirmation)}
          title={pendingConfirmation?.title || "Confirmar ação"}
          description={pendingConfirmation?.description || "Revise a ação antes de continuar."}
          confirmLabel={pendingConfirmation?.confirmLabel || "Confirmar"}
          destructive={Boolean(pendingConfirmation?.destructive)}
          busy={loading}
          dark={isDarkMode}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={() => {
            if (!pendingConfirmation) return;
            const confirmation = pendingConfirmation;
            setPendingConfirmation(null);
            confirmation.execute();
          }}
        />
      </div>
    </AdminThemeContext.Provider>
  );
}
