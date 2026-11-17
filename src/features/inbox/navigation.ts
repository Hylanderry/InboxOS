export type AppView =
  | "dashboard"
  | "crm"
  | "clientes"
  | "calendario"
  | "inbox"
  | "follow-up"
  | "conexoes"
  | "agentes"
  | "configuracoes"
  | "admin";

export interface AppViewMeta {
  id: AppView;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  implemented: boolean;
}

export const appNavigationGroups = [
  {
    label: "HOME",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "crm", label: "CRM" },
      { id: "clientes", label: "Clientes" },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { id: "inbox", label: "Inbox" },
      { id: "follow-up", label: "Follow-up" },
      { id: "calendario", label: "Calendário" },
      { id: "conexoes", label: "Conexões" },
    ],
  },
  {
    label: "AUTOMAÇÕES",
    items: [{ id: "agentes", label: "Agentes" }],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ id: AppView; label: string }>;
}>;

const APP_VIEW_META: Record<AppView, AppViewMeta> = {
  admin: {
    id: "admin",
    label: "ADM Global",
    eyebrow: "SISTEMA",
    title: "Administração global",
    description: "Usuários, workspaces, integrações e newsletter.",
    implemented: true,
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    eyebrow: "HOME",
    title: "Dashboard",
    description: "Indicadores operacionais e comerciais do workspace ativo.",
    implemented: true,
  },
  crm: {
    id: "crm",
    label: "CRM",
    eyebrow: "HOME",
    title: "CRM",
    description: "Pipeline comercial persistente e isolado por workspace.",
    implemented: true,
  },
  clientes: {
    id: "clientes",
    label: "Clientes",
    eyebrow: "HOME",
    title: "Clientes",
    description: "Contatos importados, tags e seleção em massa.",
    implemented: true,
  },
  calendario: {
    id: "calendario",
    label: "Calendário",
    eyebrow: "GESTÃO",
    title: "Calendário",
    description: "Agendamentos, capacidade e disponibilidade por agente.",
    implemented: true,
  },
  inbox: {
    id: "inbox",
    label: "Inbox",
    eyebrow: "GESTÃO",
    title: "Inbox",
    description: "Atendimento multicanal centralizado.",
    implemented: true,
  },
  "follow-up": {
    id: "follow-up",
    label: "Follow-up",
    eyebrow: "GESTÃO",
    title: "Follow-up",
    description: "Acompanhamentos comerciais com prazo, prioridade e conclusão.",
    implemented: true,
  },
  conexoes: {
    id: "conexoes",
    label: "Conexões",
    eyebrow: "GESTÃO",
    title: "Conexões",
    description: "Gerencie os canais conectados ao workspace.",
    implemented: true,
  },
  agentes: {
    id: "agentes",
    label: "Agentes",
    eyebrow: "AUTOMAÇÕES",
    title: "Agentes",
    description: "Agentes inteligentes com teste manual e resposta automática opt-in.",
    implemented: true,
  },
  configuracoes: {
    id: "configuracoes",
    label: "Configurações",
    eyebrow: "WORKSPACE",
    title: "Configurações",
    description: "Perfil, segurança, dispositivos e administração do workspace.",
    implemented: true,
  },
};

export function getAppViewMeta(view: AppView): AppViewMeta {
  return APP_VIEW_META[view];
}

const workspaceViews = new Set<Exclude<AppView, "admin">>([
  "dashboard",
  "crm",
  "clientes",
  "calendario",
  "inbox",
  "follow-up",
  "conexoes",
  "agentes",
  "configuracoes",
]);

export function isWorkspaceView(value: unknown): value is Exclude<AppView, "admin"> {
  return typeof value === "string" && workspaceViews.has(value as Exclude<AppView, "admin">);
}
