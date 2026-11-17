import { billingUiEnabled } from "../billing-flag";
import {
  Buildings,
  CreditCard,
  Devices,
  IdentificationCard,
  LockKey,
  ShieldCheck,
  UsersThree,
  CheckCircle,
  WarningCircle,
  X,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLES,
  canManageWorkspaceRole,
} from "@/lib/workspace-roles";
import { loadBilling, type BillingDto } from "../workspace-product-api";
import {
  activateWorkspace,
  authPost,
  createWorkspace,
  inviteMember,
  loadCompany,
  loadInvitations,
  loadLegalStatus,
  loadMembers,
  loadProfile,
  loadSecuritySessions,
  loadWorkspaces,
  mutateMember,
  publicAuthPost,
  revokeInvitation,
  saveCompany,
  saveProfile,
  securityAction,
  uploadAvatar,
  uploadCompanyLogo,
  type CompanyDto,
  type DeviceDto,
  type InvitationDto,
  type LegalDocumentStatusDto,
  type MemberDto,
  type ProfileDto,
  type SessionDto,
  type WorkspacePermission,
  type WorkspacePermissionOverrides,
  type WorkspaceDto,
  type InviteWorkspaceRole,
  type WorkspaceRole,
} from "../settings-api";
import {
  createPrivacyRequest,
  getPrivacyExportDownload,
  loadConsentHistory,
  loadPrivacySummary,
  savePrivacySettings,
  type ConsentHistoryDto,
  type PrivacyAuditDto,
  type PrivacyRequestDto,
  type PrivacySettingsDto,
} from "../privacy-api";

type Props = { isDarkMode: boolean };
type Notice = { kind: "success" | "error"; text: string } | null;

const PERMISSION_OPTIONS: Array<{ key: WorkspacePermission; label: string }> = [
  { key: "workspace.read", label: "Ver workspace" },
  { key: "workspace.manage", label: "Editar workspace" },
  { key: "members.read", label: "Ver equipe" },
  { key: "members.manage", label: "Gerenciar equipe" },
  { key: "instances.read", label: "Ver conexões" },
  { key: "instances.manage", label: "Gerenciar conexões" },
  { key: "messages.read", label: "Ler mensagens" },
  { key: "messages.send", label: "Enviar mensagens" },
  { key: "contacts.read", label: "Ver contatos" },
  { key: "crm.read", label: "Ver CRM" },
  { key: "crm.manage", label: "Gerenciar CRM" },
  { key: "agents.manage", label: "Gerenciar agentes" },
  { key: "billing.read", label: "Ver billing" },
  { key: "billing.manage", label: "Gerenciar billing" },
];

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<WorkspacePermission>> = {
  agent: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
  ]),
  admin: new Set([
    "workspace.read",
    "workspace.manage",
    "members.read",
    "members.manage",
    "instances.read",
    "instances.manage",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
    "agents.manage",
    "billing.read",
  ]),
  manager: new Set([
    "workspace.read",
    "members.read",
    "members.manage",
    "instances.read",
    "instances.manage",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
    "agents.manage",
    "billing.read",
  ]),
  support: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
  ]),
  analyst: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "contacts.read",
    "crm.read",
    "billing.read",
  ]),
  owner: new Set(PERMISSION_OPTIONS.map(({ key }) => key)),
};

function permissionValues(
  role: WorkspaceRole,
  overrides: WorkspacePermissionOverrides | null | undefined,
) {
  return Object.fromEntries(
    PERMISSION_OPTIONS.map(({ key }) => [
      key,
      ROLE_PERMISSIONS[role].has(key) && overrides?.[key] !== false,
    ]),
  ) as Record<WorkspacePermission, boolean>;
}

function permissionRestrictions(
  role: WorkspaceRole,
  values: Partial<Record<WorkspacePermission, boolean>>,
) {
  return Object.fromEntries(
    PERMISSION_OPTIONS.filter(
      ({ key }) => ROLE_PERMISSIONS[role].has(key) && values[key] === false,
    ).map(({ key }) => [key, false]),
  ) as WorkspacePermissionOverrides;
}

function inviteRolesFor(role: WorkspaceRole | null): InviteWorkspaceRole[] {
  if (!role) return [];
  return WORKSPACE_ROLES.filter(
    (candidate): candidate is InviteWorkspaceRole =>
      candidate !== "owner" && canManageWorkspaceRole(role, candidate),
  );
}

type EmailFlow =
  | { step: "idle" }
  | { step: "old-code"; challengeId: string; code: string }
  | { step: "new-email"; oldChallengeId: string; grantToken: string; newEmail: string }
  | {
      step: "new-code";
      oldChallengeId: string;
      grantToken: string;
      newEmail: string;
      newChallengeId: string;
      code: string;
    };

type PhoneFlow =
  | { step: "idle"; phone: string; countryCode: string }
  | { step: "code"; phone: string; countryCode: string; challengeId: string; code: string };

type PasswordFlow =
  | { step: "idle" }
  | { step: "code"; challengeId: string; code: string }
  | {
      step: "password";
      challengeId: string;
      grantToken: string;
      password: string;
      confirm: string;
    };

function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
  isDarkMode,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  isDarkMode: boolean;
}) {
  return (
    <section
      className={`flex h-full min-w-0 flex-col rounded-2xl border p-4 sm:p-5 ${
        isDarkMode ? "border-white/[0.075] bg-white/[0.025]" : "border-black/[0.075] bg-white/70"
      }`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
            isDarkMode
              ? "border-white/[0.08] bg-white/[0.045] text-zinc-300"
              : "border-black/[0.07] bg-black/[0.035] text-neutral-700"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-sm font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const resolvedPlaceholder = placeholder ?? `Digite ${label.toLowerCase()}`;
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      {type === "password" ? (
        <PasswordInput
          className="h-10 min-w-0 rounded-xl border border-current/10 bg-black/5 px-3 pr-10 text-xs outline-none focus:border-current/25 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white/[0.03]"
          value={value}
          type="password"
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          readOnly={!onChange}
        />
      ) : (
        <input
          className="h-10 min-w-0 rounded-xl border border-current/10 bg-black/5 px-3 text-xs outline-none focus:border-current/25 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white/[0.03]"
          value={value}
          type={type}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          readOnly={!onChange}
        />
      )}
    </label>
  );
}

function Button({
  children,
  onClick,
  disabled,
  danger,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-red-500/20 text-red-500 hover:bg-red-500/10"
          : "border-current/10 hover:bg-current/[0.04]"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ThemedSelect({
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className="h-10 min-w-0 rounded-xl border border-current/10 bg-black/5 px-3 text-xs outline-none focus:border-current/25 dark:bg-white/[0.03]"
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      className={`inbox-feedback mb-4 ${
        notice.kind === "error" ? "inbox-feedback-error" : "inbox-feedback-success"
      }`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
    >
      {notice.kind === "error" ? (
        <WarningCircle size={17} weight="duotone" aria-hidden="true" />
      ) : (
        <CheckCircle size={17} weight="duotone" aria-hidden="true" />
      )}
      {notice.text}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function deviceLabel(device: DeviceDto) {
  return (
    device.display_name ||
    [device.browser, device.os].filter(Boolean).join(" · ") ||
    device.device_family ||
    "Dispositivo"
  );
}

type SecurityConnection = {
  key: string;
  device: DeviceDto | null;
  sessions: SessionDto[];
  latestAt: string | null;
};

function isActiveSecuritySession(session: SessionDto) {
  if (session.revoked_at) return false;
  if (!session.expires_at) return true;
  const expiresAt = new Date(session.expires_at).getTime();
  return Number.isNaN(expiresAt) || expiresAt > Date.now();
}

function legacySessionKey(session: SessionDto) {
  // Sessions created before device_id was persisted still need to render as
  // one connection. IP + user-agent is the narrowest stable compatibility
  // identity available without mutating historical security records.
  const rawIp = session.last_ip?.trim();
  const rawAgent = session.user_agent?.trim();
  if (!rawIp && !rawAgent) return `legacy-session:${session.id}`;
  const ip = rawIp || "unknown-ip";
  const agent = rawAgent?.replace(/\s+/g, " ").toLowerCase() || "unknown-agent";
  return `legacy:${ip}:${agent}`;
}

function buildSecurityConnections(
  sessions: SessionDto[],
  devices: DeviceDto[],
): SecurityConnection[] {
  const byKey = new Map<string, SecurityConnection>();

  for (const device of devices) {
    if (device.revoked_at) continue;
    byKey.set(`device:${device.id}`, {
      key: `device:${device.id}`,
      device,
      sessions: [],
      latestAt: device.last_seen_at,
    });
  }

  for (const session of sessions) {
    if (!isActiveSecuritySession(session)) continue;
    const key = session.device_id ? `device:${session.device_id}` : legacySessionKey(session);
    const existing = byKey.get(key);
    if (existing) {
      existing.sessions.push(session);
      if (
        session.last_seen_at &&
        (!existing.latestAt ||
          new Date(session.last_seen_at).getTime() > new Date(existing.latestAt).getTime())
      ) {
        existing.latestAt = session.last_seen_at;
      }
      continue;
    }
    byKey.set(key, {
      key,
      device: null,
      sessions: [session],
      latestAt: session.last_seen_at,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const left = a.latestAt ? new Date(a.latestAt).getTime() : 0;
    const right = b.latestAt ? new Date(b.latestAt).getTime() : 0;
    return right - left;
  });
}

function SecurityConnectionCard({
  connection,
  index,
  currentSessionId,
  currentDeviceId,
  isDarkMode,
  busy,
  showSessions,
  onRevokeSession,
  onUntrustDevice,
  onRevokeDevice,
}: {
  connection: SecurityConnection;
  index: number;
  currentSessionId: string | null;
  currentDeviceId: string | null;
  isDarkMode: boolean;
  busy: boolean;
  showSessions?: boolean;
  onRevokeSession: (id: string) => void;
  onUntrustDevice: (id: string) => void;
  onRevokeDevice: (id: string) => void;
}) {
  const { device, sessions } = connection;
  const isCurrent =
    device?.id === currentDeviceId || sessions.some((session) => session.id === currentSessionId);
  const label = device
    ? deviceLabel(device) === "Dispositivo" && !isCurrent
      ? `Dispositivo ${index + 1}`
      : deviceLabel(device) === "Dispositivo"
        ? "Este dispositivo"
        : deviceLabel(device)
    : isCurrent
      ? "Este dispositivo"
      : `Conexão ${index + 1}`;

  return (
    <article
      className={`rounded-xl border p-3 ${
        isDarkMode ? "border-white/[0.08] bg-white/[0.018]" : "border-black/[0.07] bg-white/65"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                isCurrent ? "bg-emerald-500" : "bg-zinc-400"
              }`}
              aria-hidden="true"
            />
            <p className="truncate text-xs font-semibold">
              {label}
              {isCurrent ? " · atual" : ""}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Último uso: {formatDate(connection.latestAt)}
            {device?.trusted_until
              ? ` · confiança até ${formatDate(device.trusted_until)}`
              : " · não confiável"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {sessions.length === 0
              ? "Nenhuma sessão ativa"
              : `${sessions.length} sessão${sessions.length === 1 ? "" : "ões"} ativa${sessions.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {device?.trusted_until && (
            <Button onClick={() => onUntrustDevice(device.id)} disabled={busy}>
              Remover confiança
            </Button>
          )}
          {device && !isCurrent && (
            <Button danger onClick={() => onRevokeDevice(device.id)} disabled={busy}>
              Revogar dispositivo
            </Button>
          )}
        </div>
      </div>
      {showSessions && sessions.length > 0 && (
        <div
          className={`mt-3 grid gap-2 border-t pt-3 ${
            isDarkMode ? "border-white/[0.06]" : "border-black/[0.06]"
          }`}
        >
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {session.id === currentSessionId ? "Sessão atual" : "Sessão neste dispositivo"}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  Último uso: {formatDate(session.last_seen_at)}
                  {session.last_ip ? ` · ${session.last_ip}` : ""}
                </p>
              </div>
              {session.id !== currentSessionId && (
                <Button danger onClick={() => onRevokeSession(session.id)} disabled={busy}>
                  Encerrar sessão
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function SettingsView({ isDarkMode }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    countryCode: "BR",
  });
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [companyForm, setCompanyForm] = useState({
    legalName: "",
    tradeName: "",
    taxId: "",
    phone: "",
    countryCode: "BR",
    brandName: "",
    supportEmail: "",
    senderName: "",
    accentToken: "neutral" as CompanyDto["accent_token"],
    whiteLabelEnabled: false,
    customDomain: "",
  });
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteWorkspaceRole>("agent");
  const [invitePermissions, setInvitePermissions] = useState<
    Partial<Record<WorkspacePermission, boolean>>
  >({});
  const [permissionEditor, setPermissionEditor] = useState<{
    memberId: string;
    values: Record<WorkspacePermission, boolean>;
  } | null>(null);
  const [memberRoleDraft, setMemberRoleDraft] = useState<Record<string, InviteWorkspaceRole>>({});
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const sessionsCloseRef = useRef<HTMLButtonElement | null>(null);
  const sessionsDialogRef = useRef<HTMLElement | null>(null);
  const [legalDocs, setLegalDocs] = useState<LegalDocumentStatusDto[]>([]);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettingsDto | null>(null);
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequestDto[]>([]);
  const [privacyAudit, setPrivacyAudit] = useState<PrivacyAuditDto[]>([]);
  const [consentHistory, setConsentHistory] = useState<ConsentHistoryDto[]>([]);
  const [billing, setBilling] = useState<BillingDto | null>(null);
  const [emailFlow, setEmailFlow] = useState<EmailFlow>({ step: "idle" });
  const [phoneFlow, setPhoneFlow] = useState<PhoneFlow>({
    step: "idle",
    phone: "",
    countryCode: "BR",
  });
  const [passwordFlow, setPasswordFlow] = useState<PasswordFlow>({ step: "idle" });

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );
  const canManageWorkspace = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";
  const invitableRoles = useMemo(
    () => inviteRolesFor(activeWorkspace?.role ?? null),
    [activeWorkspace?.role],
  );
  const canManageMembers = invitableRoles.length > 0;
  const securityConnections = useMemo(
    () => buildSecurityConnections(sessions, devices),
    [devices, sessions],
  );
  // Keep the page compact. The complete list is isolated in the accessible,
  // scrollable dialog below.
  const previewConnections = securityConnections.slice(0, 1);

  useEffect(() => {
    if (invitableRoles.includes(inviteRole)) return;
    setInviteRole(invitableRoles[0] ?? "agent");
    setInvitePermissions({});
  }, [inviteRole, invitableRoles]);

  const syncProfileForm = useCallback((value: ProfileDto | null) => {
    setProfile(value);
    setProfileForm({
      firstName: value?.first_name ?? "",
      lastName: value?.last_name ?? "",
      phone: value?.phone_e164 ?? "",
      countryCode: value?.country_code ?? "BR",
    });
    setPhoneFlow({
      step: "idle",
      phone: value?.phone_e164 ?? "",
      countryCode: value?.country_code ?? "BR",
    });
  }, []);

  const syncCompanyForm = useCallback((value: CompanyDto | null) => {
    setCompany(value);
    setCompanyForm({
      legalName: value?.legal_name ?? "",
      tradeName: value?.trade_name ?? "",
      taxId: value?.tax_id ?? "",
      phone: value?.phone_e164 ?? "",
      countryCode: value?.country_code ?? "BR",
      brandName: value?.brand_name ?? "",
      supportEmail: value?.support_email ?? "",
      senderName: value?.sender_name ?? "",
      accentToken: value?.accent_token ?? "neutral",
      whiteLabelEnabled: value?.white_label_enabled ?? false,
      customDomain: value?.custom_domain ?? "",
    });
  }, []);

  const refreshWorkspaceScoped = useCallback(async () => {
    if (!activeWorkspaceId) {
      syncCompanyForm(null);
      setMembers([]);
      setInvitations([]);
      setPrivacySettings(null);
      setPrivacyRequests([]);
      setPrivacyAudit([]);
      setConsentHistory([]);
      return;
    }
    const billingPromise = billingUiEnabled
      ? loadBilling()
      : Promise.resolve({ billing: null as BillingDto | null, canManage: false });
    const [
      companyResult,
      memberResult,
      invitationResult,
      billingResult,
      privacyResult,
      consentResult,
    ] = await Promise.allSettled([
      loadCompany(),
      loadMembers(),
      loadInvitations(),
      billingPromise,
      loadPrivacySummary(),
      loadConsentHistory(),
    ]);
    if (companyResult.status === "fulfilled") syncCompanyForm(companyResult.value.company);
    if (memberResult.status === "fulfilled") setMembers(memberResult.value.members);
    else setMembers([]);
    if (invitationResult.status === "fulfilled") setInvitations(invitationResult.value.invitations);
    else setInvitations([]);
    if (billingResult.status === "fulfilled") setBilling(billingResult.value.billing);
    else setBilling(null);
    const privacyPayload = privacyResult.status === "fulfilled" ? privacyResult.value : null;
    if (privacyPayload?.settings && typeof privacyPayload.settings === "object") {
      setPrivacySettings({
        ...privacyPayload.settings,
        disconnect_cleanup_policy: privacyPayload.settings.disconnect_cleanup_policy ?? "purge",
      });
      setPrivacyRequests(Array.isArray(privacyPayload.requests) ? privacyPayload.requests : []);
      setPrivacyAudit(Array.isArray(privacyPayload.audit) ? privacyPayload.audit : []);
    } else {
      setPrivacySettings(null);
      setPrivacyRequests([]);
      setPrivacyAudit([]);
    }
    const consentPayload = consentResult.status === "fulfilled" ? consentResult.value : null;
    setConsentHistory(Array.isArray(consentPayload?.consents) ? consentPayload.consents : []);
  }, [activeWorkspaceId, syncCompanyForm]);

  const refreshCore = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const [profileResult, workspaceResult, securityResult, legalResult] = await Promise.all([
        loadProfile(),
        loadWorkspaces(),
        loadSecuritySessions(),
        loadLegalStatus(),
      ]);
      syncProfileForm(profileResult.profile);
      setWorkspaces(workspaceResult.workspaces);
      const next = workspaceResult.activeWorkspaceId ?? workspaceResult.workspaces[0]?.id ?? null;
      setActiveWorkspaceId(next);
      setCurrentWorkspaceId(next);
      setCurrentSessionId(securityResult.currentSessionId);
      setCurrentDeviceId(securityResult.currentDeviceId);
      setSessions(securityResult.sessions);
      setDevices(securityResult.devices);
      setLegalDocs(legalResult.documents);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao carregar configurações";
      setNotice({ kind: "error", text: msg });
      WhatsAppToast.networkError(msg);
    } finally {
      setBusy(false);
    }
  }, [syncProfileForm]);

  useEffect(() => {
    void refreshCore();
  }, [refreshCore]);

  useEffect(() => {
    if (!isSessionsModalOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSessionsModalOpen(false);
      if (event.key !== "Tab") return;
      const dialog = sessionsDialogRef.current;
      if (!dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    sessionsCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [isSessionsModalOpen]);

  useEffect(() => {
    void refreshWorkspaceScoped();
  }, [refreshWorkspaceScoped]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", text: success });
      WhatsAppToast.success(success);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "A operação falhou";
      setNotice({ kind: "error", text: msg });
      WhatsAppToast.networkError(msg);
    } finally {
      setBusy(false);
    }
  }

  const handleRevokeSession = (id: string) => {
    void run(async () => {
      await securityAction("revoke_session", id);
      await refreshSecurity();
    }, "Sessão encerrada.");
  };

  const handleUntrustDevice = (id: string) => {
    void run(async () => {
      await securityAction("untrust_device", id);
      await refreshSecurity();
    }, "Confiança removida.");
  };

  const handleRevokeDevice = (id: string) => {
    void run(async () => {
      await securityAction("revoke_device", id);
      await refreshSecurity();
    }, "Dispositivo revogado.");
  };

  async function persistProfile() {
    await run(async () => {
      const result = await saveProfile(profileForm);
      syncProfileForm(result.profile);
    }, "Perfil atualizado.");
  }

  async function persistCompany() {
    await run(
      async () => {
        const result = await saveCompany(companyForm);
        syncCompanyForm(result.company);
      },
      company ? "Empresa atualizada." : "Perfil empresarial criado.",
    );
  }

  async function persistPrivacy() {
    if (!privacySettings || !canManageWorkspace) return;
    await run(async () => {
      const result = await savePrivacySettings({
        importHistoryPolicy: privacySettings.import_history_policy,
        messageRetentionDays: privacySettings.message_retention_days,
        mediaRetentionDays: privacySettings.media_retention_days,
        disconnectCleanupPolicy: privacySettings.disconnect_cleanup_policy,
        aiEnabled: privacySettings.ai_enabled,
        piiRedactionEnabled: privacySettings.pii_redaction_enabled,
      });
      setPrivacySettings(result.settings);
    }, "Política de privacidade atualizada.");
  }

  async function requestPrivacyAction(requestType: PrivacyRequestDto["request_type"]) {
    await run(async () => {
      const result = await createPrivacyRequest(requestType);
      setPrivacyRequests((current) => [result.request, ...current]);
    }, "Solicitação registrada para análise.");
  }

  async function downloadPrivacyExport(requestId: string) {
    await run(async () => {
      const result = await getPrivacyExportDownload(requestId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    }, "Exportação pronta para download.");
  }

  async function switchWorkspace(id: string) {
    if (id === activeWorkspaceId) return;
    await run(async () => {
      setCurrentWorkspaceId(id);
      setActiveWorkspaceId(id);
      await activateWorkspace();
      setCurrentWorkspaceId(id);
    }, "Workspace alterado.");
  }

  async function addWorkspace() {
    const name = workspaceName.trim();
    if (name.length < 2) return;
    await run(async () => {
      const result = await createWorkspace(name);
      setWorkspaces((current) => [...current, { ...result.workspace, role: "owner" as const }]);
      setCurrentWorkspaceId(result.workspace.id);
      setActiveWorkspaceId(result.workspace.id);
      await activateWorkspace();
      setCurrentWorkspaceId(result.workspace.id);
      setWorkspaceName("");
    }, "Workspace criado e ativado.");
  }

  async function refreshSecurity() {
    const data = await loadSecuritySessions();
    setCurrentSessionId(data.currentSessionId);
    setCurrentDeviceId(data.currentDeviceId);
    setSessions(data.sessions);
    setDevices(data.devices);
  }

  async function startEmailChange() {
    await run(async () => {
      const result = await authPost<{ challengeId: string }>("/api/auth/email-change/old/start");
      setEmailFlow({ step: "old-code", challengeId: result.challengeId, code: "" });
    }, "Código enviado para o e-mail atual.");
  }

  async function verifyOldEmail() {
    if (emailFlow.step !== "old-code" || emailFlow.code.length !== 6) return;
    await run(async () => {
      const result = await authPost<{ oldChallengeId: string; grantToken: string }>(
        "/api/auth/email-change/old/verify",
        { challengeId: emailFlow.challengeId, code: emailFlow.code },
      );
      setEmailFlow({
        step: "new-email",
        oldChallengeId: result.oldChallengeId,
        grantToken: result.grantToken,
        newEmail: "",
      });
    }, "E-mail atual confirmado.");
  }

  async function startNewEmail() {
    if (emailFlow.step !== "new-email" || !emailFlow.newEmail.trim()) return;
    await run(async () => {
      const result = await authPost<{ newChallengeId: string }>(
        "/api/auth/email-change/new/start",
        {
          oldChallengeId: emailFlow.oldChallengeId,
          grantToken: emailFlow.grantToken,
          newEmail: emailFlow.newEmail,
        },
      );
      setEmailFlow({
        ...emailFlow,
        step: "new-code",
        newChallengeId: result.newChallengeId,
        code: "",
      });
    }, "Código enviado para o novo e-mail.");
  }

  async function finishEmailChange() {
    if (emailFlow.step !== "new-code" || emailFlow.code.length !== 6) return;
    await run(async () => {
      await authPost<{ success: boolean; email: string }>("/api/auth/email-change/new/verify", {
        newChallengeId: emailFlow.newChallengeId,
        code: emailFlow.code,
      });
      await supabase.auth.refreshSession();
      const refreshed = await loadProfile();
      syncProfileForm(refreshed.profile);
      setEmailFlow({ step: "idle" });
    }, "E-mail alterado com sucesso.");
  }

  async function cancelEmailChange() {
    await run(async () => {
      await authPost("/api/auth/email-change/cancel");
      setEmailFlow({ step: "idle" });
    }, "Troca de e-mail cancelada.");
  }

  async function startPhoneChange() {
    if (phoneFlow.step !== "idle") return;
    await run(async () => {
      const result = await authPost<{ challengeId: string }>("/api/auth/phone-change/start", {
        phone: phoneFlow.phone,
        countryCode: phoneFlow.countryCode,
      });
      setPhoneFlow({ ...phoneFlow, step: "code", challengeId: result.challengeId, code: "" });
    }, "Código enviado para confirmar o novo telefone.");
  }

  async function finishPhoneChange() {
    if (phoneFlow.step !== "code" || phoneFlow.code.length !== 6) return;
    await run(async () => {
      await authPost("/api/auth/phone-change/verify", {
        challengeId: phoneFlow.challengeId,
        code: phoneFlow.code,
      });
      const refreshed = await loadProfile();
      syncProfileForm(refreshed.profile);
    }, "Telefone alterado.");
  }

  async function startPasswordChange() {
    if (!profile?.email) return;
    await run(async () => {
      const result = await publicAuthPost<{ challengeId?: string | null }>(
        "/api/auth/password/start",
        { email: profile.email },
      );
      if (!result.challengeId) throw new Error("Não foi possível criar o desafio de segurança");
      setPasswordFlow({ step: "code", challengeId: result.challengeId, code: "" });
    }, "Código enviado para alterar a senha.");
  }

  async function verifyPasswordCode() {
    if (passwordFlow.step !== "code" || passwordFlow.code.length !== 6) return;
    await run(async () => {
      const result = await publicAuthPost<{ challengeId: string; grantToken: string }>(
        "/api/auth/password/verify",
        { challengeId: passwordFlow.challengeId, code: passwordFlow.code },
      );
      setPasswordFlow({
        step: "password",
        challengeId: result.challengeId,
        grantToken: result.grantToken,
        password: "",
        confirm: "",
      });
    }, "Código confirmado.");
  }

  async function finishPasswordChange() {
    if (
      passwordFlow.step !== "password" ||
      passwordFlow.password.length < 8 ||
      passwordFlow.password !== passwordFlow.confirm
    )
      return;
    await run(async () => {
      await publicAuthPost("/api/auth/password/reset", {
        challengeId: passwordFlow.challengeId,
        grantToken: passwordFlow.grantToken,
        newPassword: passwordFlow.password,
        revokeOtherSessions: true,
      });
      await supabase.auth.signOut({ scope: "local" });
      window.location.replace("/auth/login");
    }, "Senha alterada.");
  }

  return (
    <div className="settings-scroll inboxos-page flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5 lg:pb-8">
      <div className="settings-content mx-auto w-full max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-zinc-500">
              Conta e workspace
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
              Configurações
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Perfil, empresa, segurança, dispositivos, membros e documentos disponíveis no sistema.
            </p>
          </div>
          <Button onClick={() => void refreshCore()} disabled={busy}>
            Atualizar dados
          </Button>
        </div>
        <NoticeBar notice={notice} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section
            icon={<IdentificationCard size={18} />}
            eyebrow="Perfil"
            title="Dados pessoais"
            description="Dados do usuário autenticado. E-mail e telefone usam fluxos de confirmação separados."
            isDarkMode={isDarkMode}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nome"
                value={profileForm.firstName}
                onChange={(firstName) => setProfileForm((v) => ({ ...v, firstName }))}
              />
              <Field
                label="Sobrenome"
                value={profileForm.lastName}
                onChange={(lastName) => setProfileForm((v) => ({ ...v, lastName }))}
              />
              <Field label="E-mail" value={profile?.email ?? ""} />
              <Field label="Telefone atual" value={profile?.phone_e164 ?? ""} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void persistProfile()} disabled={busy}>
                Salvar perfil
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-current/10 px-3 text-[10px] font-bold hover:bg-current/[0.04]">
                Trocar avatar
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void run(async () => {
                      await uploadAvatar(file);
                      const refreshed = await loadProfile();
                      syncProfileForm(refreshed.profile);
                    }, "Avatar atualizado.");
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </Section>

          <Section
            icon={<Buildings size={18} />}
            eyebrow="Empresa"
            title="Perfil empresarial"
            description="Dados jurídicos e identidade visual do workspace ativo."
            isDarkMode={isDarkMode}
          >
            <div className="mb-3 rounded-xl border border-current/5 px-3 py-2 text-[10px] text-zinc-500">
              {activeWorkspace
                ? `${activeWorkspace.name} · ${activeWorkspace.role}`
                : "Nenhum workspace ativo"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Razão social"
                value={companyForm.legalName}
                onChange={(legalName) => setCompanyForm((v) => ({ ...v, legalName }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="Nome fantasia"
                value={companyForm.tradeName}
                onChange={(tradeName) => setCompanyForm((v) => ({ ...v, tradeName }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="CNPJ"
                value={companyForm.taxId}
                onChange={(taxId) => setCompanyForm((v) => ({ ...v, taxId }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="Telefone"
                value={companyForm.phone}
                onChange={(phone) => setCompanyForm((v) => ({ ...v, phone }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="Nome da marca"
                value={companyForm.brandName}
                placeholder="Ex.: Acme Atendimento"
                onChange={(brandName) => setCompanyForm((v) => ({ ...v, brandName }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="E-mail de suporte"
                type="email"
                value={companyForm.supportEmail}
                placeholder="suporte@empresa.com"
                onChange={(supportEmail) => setCompanyForm((v) => ({ ...v, supportEmail }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="Nome do remetente"
                value={companyForm.senderName}
                placeholder="Equipe Acme"
                onChange={(senderName) => setCompanyForm((v) => ({ ...v, senderName }))}
                disabled={!canManageWorkspace}
              />
              <Field
                label="Domínio personalizado"
                value={companyForm.customDomain}
                placeholder="app.empresa.com"
                onChange={(customDomain) => setCompanyForm((v) => ({ ...v, customDomain }))}
                disabled={!canManageWorkspace}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-500">
                Acento visual
                <ThemedSelect
                  value={companyForm.accentToken}
                  disabled={!canManageWorkspace || busy}
                  onValueChange={(accentToken) =>
                    setCompanyForm((current) => ({
                      ...current,
                      accentToken: accentToken as CompanyDto["accent_token"],
                    }))
                  }
                  ariaLabel="Acento visual"
                >
                  <SelectItem value="neutral">Neutro</SelectItem>
                  <SelectItem value="teal">Teal</SelectItem>
                  <SelectItem value="indigo">Índigo</SelectItem>
                  <SelectItem value="amber">Âmbar</SelectItem>
                </ThemedSelect>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-current/10 px-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={companyForm.whiteLabelEnabled}
                  disabled={!canManageWorkspace || busy}
                  onChange={(event) =>
                    setCompanyForm((current) => ({
                      ...current,
                      whiteLabelEnabled: event.target.checked,
                    }))
                  }
                />
                Ativar identidade white-label
              </label>
            </div>
            {company?.custom_domain_status && company.custom_domain_status !== "not_configured" && (
              <p className="mt-2 text-[10px] text-zinc-500">
                Domínio:{" "}
                {company.custom_domain_status === "pending"
                  ? "aguardando verificação"
                  : company.custom_domain_status}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => void persistCompany()}
                disabled={busy || !activeWorkspaceId || !canManageWorkspace}
              >
                Salvar empresa
              </Button>
              <label
                className={`inline-flex h-9 items-center rounded-xl border border-current/10 px-3 text-[10px] font-bold ${company && canManageWorkspace ? "cursor-pointer hover:bg-current/[0.04]" : "cursor-not-allowed opacity-40"}`}
              >
                Trocar logo
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!company || !canManageWorkspace}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void run(async () => {
                      await uploadCompanyLogo(file);
                      const refreshed = await loadCompany();
                      syncCompanyForm(refreshed.company);
                    }, "Logo atualizada.");
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </Section>

          <Section
            icon={<LockKey size={18} />}
            eyebrow="Segurança"
            title="Senha, e-mail e telefone"
            description="Ações sensíveis confirmadas por código e registradas no backend."
            isDarkMode={isDarkMode}
          >
            <div className="grid gap-4">
              <div className="rounded-xl border border-current/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">Senha</p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Não reutiliza as três últimas. Após a troca, o login é solicitado novamente.
                    </p>
                  </div>
                  {passwordFlow.step === "idle" && (
                    <Button onClick={() => void startPasswordChange()} disabled={busy}>
                      Alterar
                    </Button>
                  )}
                </div>
                {passwordFlow.step === "code" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Field
                      label="Código"
                      value={passwordFlow.code}
                      onChange={(code) =>
                        setPasswordFlow({
                          ...passwordFlow,
                          code: code.replace(/\D/g, "").slice(0, 6),
                        })
                      }
                    />
                    <Button
                      onClick={() => void verifyPasswordCode()}
                      disabled={busy || passwordFlow.code.length !== 6}
                    >
                      Confirmar código
                    </Button>
                  </div>
                )}
                {passwordFlow.step === "password" && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Nova senha"
                      type="password"
                      value={passwordFlow.password}
                      onChange={(password) => setPasswordFlow({ ...passwordFlow, password })}
                    />
                    <Field
                      label="Confirmar senha"
                      type="password"
                      value={passwordFlow.confirm}
                      onChange={(confirm) => setPasswordFlow({ ...passwordFlow, confirm })}
                    />
                    <div className="sm:col-span-2">
                      <Button
                        onClick={() => void finishPasswordChange()}
                        disabled={
                          busy ||
                          passwordFlow.password.length < 8 ||
                          passwordFlow.password !== passwordFlow.confirm
                        }
                      >
                        Aplicar nova senha
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-current/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">E-mail</p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Confirma primeiro o e-mail atual e depois o novo.
                    </p>
                  </div>
                  {emailFlow.step === "idle" && (
                    <Button onClick={() => void startEmailChange()} disabled={busy}>
                      Alterar
                    </Button>
                  )}
                </div>
                {emailFlow.step === "old-code" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Field
                      label="Código do e-mail atual"
                      value={emailFlow.code}
                      onChange={(code) =>
                        setEmailFlow({ ...emailFlow, code: code.replace(/\D/g, "").slice(0, 6) })
                      }
                    />
                    <Button
                      onClick={() => void verifyOldEmail()}
                      disabled={busy || emailFlow.code.length !== 6}
                    >
                      Confirmar
                    </Button>
                    <Button onClick={() => void cancelEmailChange()} disabled={busy}>
                      Cancelar
                    </Button>
                  </div>
                )}
                {emailFlow.step === "new-email" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Field
                      label="Novo e-mail"
                      type="email"
                      value={emailFlow.newEmail}
                      onChange={(newEmail) => setEmailFlow({ ...emailFlow, newEmail })}
                    />
                    <Button
                      onClick={() => void startNewEmail()}
                      disabled={busy || !emailFlow.newEmail}
                    >
                      Enviar código
                    </Button>
                    <Button onClick={() => void cancelEmailChange()} disabled={busy}>
                      Cancelar
                    </Button>
                  </div>
                )}
                {emailFlow.step === "new-code" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Field
                      label="Código do novo e-mail"
                      value={emailFlow.code}
                      onChange={(code) =>
                        setEmailFlow({ ...emailFlow, code: code.replace(/\D/g, "").slice(0, 6) })
                      }
                    />
                    <Button
                      onClick={() => void finishEmailChange()}
                      disabled={busy || emailFlow.code.length !== 6}
                    >
                      Concluir
                    </Button>
                    <Button onClick={() => void cancelEmailChange()} disabled={busy}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-current/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">Telefone</p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Persistido em E.164 somente depois da confirmação.
                    </p>
                  </div>
                </div>
                {phoneFlow.step === "idle" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[100px_1fr_auto]">
                    <Field
                      label="País"
                      value={phoneFlow.countryCode}
                      onChange={(countryCode) =>
                        setPhoneFlow({
                          ...phoneFlow,
                          countryCode: countryCode.toUpperCase().slice(0, 2),
                        })
                      }
                    />
                    <Field
                      label="Novo telefone"
                      value={phoneFlow.phone}
                      onChange={(phone) => setPhoneFlow({ ...phoneFlow, phone })}
                    />
                    <div className="self-end">
                      <Button
                        onClick={() => void startPhoneChange()}
                        disabled={busy || !phoneFlow.phone}
                      >
                        Enviar código
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Field
                      label="Código"
                      value={phoneFlow.code}
                      onChange={(code) =>
                        setPhoneFlow({ ...phoneFlow, code: code.replace(/\D/g, "").slice(0, 6) })
                      }
                    />
                    <Button
                      onClick={() => void finishPhoneChange()}
                      disabled={busy || phoneFlow.code.length !== 6}
                    >
                      Confirmar telefone
                    </Button>
                    <Button
                      onClick={() =>
                        setPhoneFlow({
                          step: "idle",
                          phone: profile?.phone_e164 ?? "",
                          countryCode: profile?.country_code ?? "BR",
                        })
                      }
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-current/5 pt-3">
                <div>
                  <p className="text-xs font-semibold">Encerrar outras sessões</p>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Revoga todas as sessões de aplicação, exceto a atual.
                  </p>
                </div>
                <Button
                  onClick={() =>
                    void run(async () => {
                      await securityAction("revoke_others");
                      await refreshSecurity();
                    }, "Outras sessões encerradas.")
                  }
                  disabled={busy}
                >
                  Encerrar
                </Button>
              </div>
            </div>
          </Section>

          <Section
            icon={<Devices size={18} />}
            eyebrow="Dispositivos"
            title="Sessões e confiança"
            description="Revogue sessões ou remova a confiança de dispositivos lembrados."
            isDarkMode={isDarkMode}
          >
            <div className="grid gap-3">
              <div className="flex flex-col gap-3 rounded-xl border border-current/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Conexões ativas</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    {securityConnections.length} dispositivo
                    {securityConnections.length === 1 ? "" : "s"} ·{" "}
                    {securityConnections.reduce((total, item) => total + item.sessions.length, 0)}{" "}
                    sessão
                    {securityConnections.reduce(
                      (total, item) => total + item.sessions.length,
                      0,
                    ) === 1
                      ? ""
                      : "ões"}
                  </p>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => setIsSessionsModalOpen(true)}
                  disabled={!securityConnections.length}
                >
                  Ver todas as conexões
                  <ArrowUpRight
                    size={14}
                    weight="bold"
                    className="ml-1 inline-block"
                    aria-hidden="true"
                  />
                </Button>
              </div>
              {previewConnections.length > 0 ? (
                previewConnections.map((connection, index) => (
                  <SecurityConnectionCard
                    key={connection.key}
                    connection={connection}
                    index={index}
                    currentSessionId={currentSessionId}
                    currentDeviceId={currentDeviceId}
                    isDarkMode={isDarkMode}
                    busy={busy}
                    onRevokeSession={handleRevokeSession}
                    onUntrustDevice={handleUntrustDevice}
                    onRevokeDevice={handleRevokeDevice}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-current/10 px-3 py-5 text-center text-xs text-zinc-500">
                  Nenhuma conexão ativa neste momento.
                </div>
              )}
            </div>
          </Section>

          <Section
            icon={<UsersThree size={18} />}
            eyebrow="Workspace"
            title="Membros e permissões"
            description="Troque o workspace, crie ambientes e administre membros conforme seu papel."
            isDarkMode={isDarkMode}
          >
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold text-zinc-500">Workspace ativo</span>
                  <ThemedSelect
                    value={activeWorkspaceId ?? ""}
                    onValueChange={(workspaceId) => void switchWorkspace(workspaceId)}
                    disabled={busy}
                    ariaLabel="Workspace ativo"
                  >
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name} · {WORKSPACE_ROLE_LABELS[workspace.role]}
                      </SelectItem>
                    ))}
                  </ThemedSelect>
                </label>
                <div className="self-end">
                  <Button
                    onClick={() => void refreshWorkspaceScoped()}
                    disabled={busy || !activeWorkspaceId}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Field
                  label="Novo workspace"
                  value={workspaceName}
                  onChange={setWorkspaceName}
                  placeholder="Nome do workspace"
                />
                <div className="self-end">
                  <Button
                    onClick={() => void addWorkspace()}
                    disabled={busy || workspaceName.trim().length < 2}
                  >
                    Criar
                  </Button>
                </div>
              </div>

              {canManageMembers && (
                <div className="grid gap-2 rounded-xl border border-current/5 p-3 sm:grid-cols-[1fr_110px_auto]">
                  <Field
                    label="Convidar por e-mail"
                    type="email"
                    value={inviteEmail}
                    onChange={setInviteEmail}
                  />
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-semibold text-zinc-500">Papel</span>
                    <ThemedSelect
                      value={inviteRole}
                      onValueChange={(role) => {
                        setInviteRole(role as InviteWorkspaceRole);
                        setInvitePermissions({});
                      }}
                      ariaLabel="Papel do membro convidado"
                    >
                      {invitableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {WORKSPACE_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </ThemedSelect>
                  </label>
                  <div className="self-end">
                    <Button
                      onClick={() =>
                        void run(async () => {
                          await inviteMember(
                            inviteEmail,
                            inviteRole,
                            permissionRestrictions(inviteRole, invitePermissions),
                          );
                          setInviteEmail("");
                          setInvitePermissions({});
                          const refreshed = await loadInvitations();
                          setInvitations(refreshed.invitations);
                        }, "Convite enviado.")
                      }
                      disabled={busy || !inviteEmail}
                    >
                      Convidar
                    </Button>
                  </div>
                  <details className="sm:col-span-3 rounded-xl border border-current/5 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Permissões personalizadas{" "}
                      <span className="font-normal text-zinc-500">(opcional)</span>
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {PERMISSION_OPTIONS.map(({ key, label }) => {
                        const available = ROLE_PERMISSIONS[inviteRole].has(key);
                        return (
                          <label key={key} className="flex min-h-9 items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-current"
                              checked={available && invitePermissions[key] !== false}
                              disabled={!available}
                              onChange={(event) =>
                                setInvitePermissions((current) => ({
                                  ...current,
                                  [key]: event.target.checked ? undefined : false,
                                }))
                              }
                            />
                            <span className={!available ? "text-zinc-400" : undefined}>
                              {label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                </div>
              )}

              {members.map((member) => {
                const name =
                  [member.profile?.first_name, member.profile?.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  member.profile?.email ||
                  member.user_id;
                const canManageMember =
                  !!activeWorkspace && canManageWorkspaceRole(activeWorkspace.role, member.role);
                const selectedRole = memberRoleDraft[member.id] ?? member.role;
                return (
                  <div key={member.id} className="rounded-xl border border-current/5 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold">{name}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {WORKSPACE_ROLE_LABELS[member.role]} · {member.status}
                        </p>
                      </div>
                      {canManageMember && (
                        <div className="flex flex-wrap gap-2">
                          <label className="grid min-w-40 gap-1">
                            <span className="text-[10px] font-semibold text-zinc-500">Papel</span>
                            <ThemedSelect
                              value={selectedRole}
                              onValueChange={(role) =>
                                setMemberRoleDraft((current) => ({
                                  ...current,
                                  [member.id]: role as InviteWorkspaceRole,
                                }))
                              }
                              ariaLabel={`Papel de ${name}`}
                              disabled={busy}
                            >
                              {invitableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {WORKSPACE_ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </ThemedSelect>
                          </label>
                          <Button
                            onClick={() =>
                              void run(async () => {
                                await mutateMember({
                                  memberId: member.id,
                                  action: "set_role",
                                  role: selectedRole,
                                });
                                const refreshed = await loadMembers();
                                setMembers(refreshed.members);
                                setMemberRoleDraft((current) => {
                                  const { [member.id]: _, ...rest } = current;
                                  return rest;
                                });
                              }, "Papel atualizado.")
                            }
                            disabled={busy || selectedRole === member.role}
                          >
                            Salvar papel
                          </Button>
                          <Button
                            onClick={() =>
                              void run(
                                async () => {
                                  await mutateMember({
                                    memberId: member.id,
                                    action: member.status === "active" ? "suspend" : "activate",
                                  });
                                  const refreshed = await loadMembers();
                                  setMembers(refreshed.members);
                                },
                                member.status === "active"
                                  ? "Membro suspenso."
                                  : "Membro reativado.",
                              )
                            }
                            disabled={busy}
                          >
                            {member.status === "active" ? "Suspender" : "Reativar"}
                          </Button>
                          <Button
                            onClick={() =>
                              setPermissionEditor((current) =>
                                current?.memberId === member.id
                                  ? null
                                  : {
                                      memberId: member.id,
                                      values: permissionValues(member.role, member.permissions),
                                    },
                              )
                            }
                            disabled={busy}
                          >
                            Permissões
                          </Button>
                          <Button
                            danger
                            onClick={() =>
                              void run(async () => {
                                await mutateMember({ memberId: member.id, action: "remove" });
                                const refreshed = await loadMembers();
                                setMembers(refreshed.members);
                              }, "Membro removido.")
                            }
                            disabled={busy}
                          >
                            Remover
                          </Button>
                        </div>
                      )}
                    </div>
                    {permissionEditor?.memberId === member.id && (
                      <div className="mt-3 grid gap-3 rounded-xl border border-current/5 p-3">
                        <p className="text-xs font-semibold">
                          Permissões de {WORKSPACE_ROLE_LABELS[member.role]}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {PERMISSION_OPTIONS.map(({ key, label }) => {
                            const available = ROLE_PERMISSIONS[member.role].has(key);
                            const checked = permissionEditor.values[key] === true;
                            return (
                              <label key={key} className="flex min-h-9 items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-current"
                                  checked={available && checked}
                                  disabled={!available || busy}
                                  onChange={(event) =>
                                    setPermissionEditor((current) =>
                                      current?.memberId === member.id
                                        ? {
                                            ...current,
                                            values: {
                                              ...current.values,
                                              [key]: event.target.checked,
                                            },
                                          }
                                        : current,
                                    )
                                  }
                                />
                                <span className={!available ? "text-zinc-400" : undefined}>
                                  {label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            onClick={() =>
                              void run(async () => {
                                await mutateMember({
                                  memberId: member.id,
                                  action: "set_permissions",
                                  permissions: permissionRestrictions(
                                    member.role,
                                    permissionEditor.values,
                                  ),
                                });
                                const refreshed = await loadMembers();
                                setMembers(refreshed.members);
                                setPermissionEditor(null);
                              }, "Permissões atualizadas.")
                            }
                            disabled={busy}
                          >
                            Salvar permissões
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {invitations
                .filter((invite) => !invite.accepted_at && !invite.revoked_at)
                .map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-2 rounded-xl border border-current/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-xs font-semibold">{invite.email}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Convite {WORKSPACE_ROLE_LABELS[invite.role]} · expira{" "}
                        {formatDate(invite.expires_at)}
                      </p>
                    </div>
                    {canManageMembers && (
                      <Button
                        danger
                        onClick={() =>
                          void run(async () => {
                            await revokeInvitation(invite.id);
                            const refreshed = await loadInvitations();
                            setInvitations(refreshed.invitations);
                          }, "Convite revogado.")
                        }
                        disabled={busy}
                      >
                        Revogar convite
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          </Section>

          <Section
            icon={<ShieldCheck size={18} />}
            eyebrow="Privacidade"
            title="Central de privacidade"
            description="Versões ativas e aceite registrados no backend."
            isDarkMode={isDarkMode}
          >
            {privacySettings && (
              <div className="mb-4 grid gap-3 rounded-xl border border-current/5 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold">Controles de dados</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                      Sem histórico anterior à conexão. A retenção e o uso da IA ficam limitados ao
                      workspace ativo.
                    </p>
                  </div>
                  <Button
                    onClick={() => void persistPrivacy()}
                    disabled={busy || !canManageWorkspace}
                  >
                    Salvar política
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold text-zinc-500">
                    Importação de histórico
                    <ThemedSelect
                      value={privacySettings.import_history_policy}
                      disabled={!canManageWorkspace || busy}
                      onValueChange={(importHistoryPolicy) =>
                        setPrivacySettings((current) =>
                          current
                            ? {
                                ...current,
                                import_history_policy:
                                  importHistoryPolicy as PrivacySettingsDto["import_history_policy"],
                              }
                            : current,
                        )
                      }
                      ariaLabel="Importação de histórico"
                    >
                      <SelectItem value="from_connection_time">A partir da conexão</SelectItem>
                      <SelectItem value="none">Não importar histórico</SelectItem>
                    </ThemedSelect>
                  </label>
                  <Field
                    label="Retenção de mensagens (dias)"
                    type="number"
                    value={String(privacySettings.message_retention_days)}
                    disabled={!canManageWorkspace || busy}
                    onChange={(value) =>
                      setPrivacySettings((current) =>
                        current
                          ? {
                              ...current,
                              message_retention_days: Math.max(
                                1,
                                Math.min(3650, Number(value) || 1),
                              ),
                            }
                          : current,
                      )
                    }
                  />
                  <Field
                    label="Retenção de mídia (dias)"
                    type="number"
                    value={String(privacySettings.media_retention_days)}
                    disabled={!canManageWorkspace || busy}
                    onChange={(value) =>
                      setPrivacySettings((current) =>
                        current
                          ? {
                              ...current,
                              media_retention_days: Math.max(1, Math.min(3650, Number(value) || 1)),
                            }
                          : current,
                      )
                    }
                  />
                  <label className="grid gap-1.5 text-xs font-semibold text-zinc-500">
                    Ao desconectar o WhatsApp
                    <ThemedSelect
                      value={privacySettings.disconnect_cleanup_policy}
                      disabled={!canManageWorkspace || busy}
                      onValueChange={(disconnectCleanupPolicy) =>
                        setPrivacySettings((current) =>
                          current
                            ? {
                                ...current,
                                disconnect_cleanup_policy:
                                  disconnectCleanupPolicy as PrivacySettingsDto["disconnect_cleanup_policy"],
                              }
                            : current,
                        )
                      }
                      ariaLabel="Ação ao desconectar o WhatsApp"
                    >
                      <SelectItem value="purge">Apagar dados operacionais</SelectItem>
                      <SelectItem value="retain">Manter dados e marcar desconectado</SelectItem>
                    </ThemedSelect>
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-xl border border-current/10 px-3 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={privacySettings.ai_enabled}
                      disabled={!canManageWorkspace || busy}
                      onChange={(event) =>
                        setPrivacySettings((current) =>
                          current ? { ...current, ai_enabled: event.target.checked } : current,
                        )
                      }
                    />
                    Permitir IA neste workspace
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-xl border border-current/10 px-3 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={privacySettings.pii_redaction_enabled}
                      disabled={!canManageWorkspace || busy}
                      onChange={(event) =>
                        setPrivacySettings((current) =>
                          current
                            ? { ...current, pii_redaction_enabled: event.target.checked }
                            : current,
                        )
                      }
                    />
                    Redigir PII antes da IA
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void requestPrivacyAction("export")}
                    disabled={busy || !canManageWorkspace}
                  >
                    Solicitar exportação
                  </Button>
                  <Button
                    danger
                    onClick={() => void requestPrivacyAction("delete")}
                    disabled={busy || !canManageWorkspace}
                  >
                    Solicitar exclusão
                  </Button>
                  <Button
                    onClick={() => void requestPrivacyAction("correct")}
                    disabled={busy || !canManageWorkspace}
                  >
                    Solicitar correção
                  </Button>
                </div>
                {privacyRequests.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                    Última solicitação: {privacyRequests[0]?.request_type} ·{" "}
                    {privacyRequests[0]?.status === "manual_review"
                      ? "em revisão manual"
                      : privacyRequests[0]?.status}
                    {privacyRequests[0]?.request_type === "export" &&
                      privacyRequests[0]?.status === "completed" && (
                        <Button
                          onClick={() => void downloadPrivacyExport(privacyRequests[0]!.id)}
                          disabled={busy || !canManageWorkspace}
                        >
                          Baixar exportação
                        </Button>
                      )}
                  </div>
                )}
                {privacyAudit.length > 0 && (
                  <details className="rounded-xl border border-current/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Atividade de privacidade ({privacyAudit.length})
                    </summary>
                    <div className="mt-3 grid gap-2">
                      {privacyAudit.slice(0, 20).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/5 px-3 py-2 text-[10px] text-zinc-500"
                        >
                          <span className="min-w-0 truncate">{entry.action}</span>
                          <span>{formatDate(entry.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            {consentHistory.length > 0 && (
              <details className="mb-4 rounded-xl border border-current/5 p-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  Histórico de consentimentos ({consentHistory.length})
                </summary>
                <div className="mt-3 grid gap-2">
                  {consentHistory.slice(0, 20).map((consent) => (
                    <div
                      key={consent.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/5 px-3 py-2 text-[10px] text-zinc-500"
                    >
                      <span>{consent.document?.title ?? "Documento legal"}</span>
                      <span>
                        v{consent.document?.version ?? "—"} · {formatDate(consent.accepted_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="grid gap-2">
              {legalDocs.map((doc) => {
                const route =
                  doc.slug === "terms-of-use"
                    ? "/legal/terms"
                    : doc.slug === "privacy-policy"
                      ? "/legal/privacy"
                      : doc.slug === "cookies-policy"
                        ? "/legal/cookies"
                        : doc.slug === "payments-cancellation"
                          ? "/legal/payments"
                          : "/legal/acceptable-use";
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-2 rounded-xl border border-current/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-xs font-semibold">{doc.title}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        v{doc.version} ·{" "}
                        {doc.acceptedAt
                          ? `aceito em ${formatDate(doc.acceptedAt)}`
                          : "ainda não aceito nesta versão"}
                      </p>
                    </div>
                    <a
                      href={route}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-current/10 px-3 text-[10px] font-bold hover:bg-current/[0.04]"
                    >
                      Abrir
                    </a>
                  </div>
                );
              })}
              {!legalDocs.length && (
                <p className="text-[10px] text-zinc-500">Nenhum documento ativo encontrado.</p>
              )}
            </div>
          </Section>

          {billingUiEnabled && (
            <div className="lg:col-span-2">
              <Section
                icon={<CreditCard size={18} />}
                eyebrow="Plano"
                title="Cobrança"
                description="Estado de assinatura persistido no backend. A cobrança só será iniciada quando um provedor comercial for configurado."
                isDarkMode={isDarkMode}
              >
                <div className="grid gap-3 rounded-xl border border-current/5 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500">Status</p>
                    <p className="mt-1 text-xs font-semibold">
                      {billing?.status ?? "indisponível"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500">Plano</p>
                    <p className="mt-1 text-xs font-semibold">
                      {billing?.plan_key ?? "não configurado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500">Provedor</p>
                    <p className="mt-1 text-xs font-semibold">
                      {billing?.provider ?? "não configurado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500">Período atual</p>
                    <p className="mt-1 text-xs font-semibold">
                      {billing?.current_period_end ? formatDate(billing.current_period_end) : "—"}
                    </p>
                  </div>
                </div>
                {!billing?.provider && (
                  <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
                    Nenhum checkout ou cobrança fictícia foi criado. O backend já mantém o contrato
                    de billing, mas a ativação financeira exige a definição do provedor, planos e
                    regras comerciais.
                  </p>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
      {isSessionsModalOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSessionsModalOpen(false);
          }}
        >
          <section
            ref={sessionsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-sessions-title"
            className={`flex max-h-[min(760px,calc(100dvh-24px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDarkMode
                ? "border-white/[0.1] bg-[#111113] text-zinc-100 shadow-black/60"
                : "border-black/[0.08] bg-white text-zinc-900 shadow-black/15"
            }`}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-current/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                  Segurança da conta
                </p>
                <h2
                  id="security-sessions-title"
                  className="mt-1 text-base font-semibold tracking-[-0.02em]"
                >
                  Todas as conexões e sessões
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Cada dispositivo aparece uma única vez. As sessões adicionais ficam agrupadas
                  dentro da conexão.
                </p>
              </div>
              <button
                ref={sessionsCloseRef}
                type="button"
                onClick={() => setIsSessionsModalOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-current/10 transition hover:bg-current/[0.05]"
                aria-label="Fechar sessões e dispositivos"
              >
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {securityConnections.length > 0 ? (
                securityConnections.map((connection, index) => (
                  <SecurityConnectionCard
                    key={connection.key}
                    connection={connection}
                    index={index}
                    currentSessionId={currentSessionId}
                    currentDeviceId={currentDeviceId}
                    isDarkMode={isDarkMode}
                    busy={busy}
                    showSessions
                    onRevokeSession={handleRevokeSession}
                    onUntrustDevice={handleUntrustDevice}
                    onRevokeDevice={handleRevokeDevice}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-current/10 px-4 py-8 text-center text-xs text-zinc-500">
                  Nenhuma sessão ativa encontrada.
                </div>
              )}
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-current/10 px-4 py-3 sm:px-5">
              <span className="text-[10px] text-zinc-500">
                {securityConnections.length} conexão{securityConnections.length === 1 ? "" : "ões"}{" "}
                agrupada{securityConnections.length === 1 ? "" : "s"}
              </span>
              <Button onClick={() => setIsSessionsModalOpen(false)}>Concluir</Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
