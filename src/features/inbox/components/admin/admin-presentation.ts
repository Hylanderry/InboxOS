const metricLabels: Record<string, string> = {
  workspaces: "Workspaces",
  users: "Usuários",
  crmLeads: "Leads no CRM",
  messages24h: "Mensagens nas últimas 24h",
  failedEvents: "Eventos com falha",
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  disabled: "Desativado",
  pending: "Pendente",
};

export function formatAdminMetricLabel(metric: string): string {
  return metricLabels[metric] ?? metric;
}

export function formatAdminStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
