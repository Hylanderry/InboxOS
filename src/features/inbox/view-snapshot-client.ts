import { supabase } from "@/integrations/supabase/client";
import { createViewSnapshots } from "./view-snapshot";
import {
  loadAgents,
  loadCalendar,
  loadClients,
  loadCrm,
  loadDashboard,
  loadFollowUps,
  loadKnowledgeDocuments,
} from "./workspace-product-api";

export const viewSnapshots = createViewSnapshots();

if (typeof window !== "undefined") {
  // Só limpa quando o workspace muda de fato (Configurações reemite o mesmo id ao abrir).
  let workspaceId = window.localStorage.getItem("inboxos.active_workspace_id");
  window.addEventListener("inboxos:workspace-change", (event) => {
    const next =
      (event as CustomEvent<{ workspaceId?: string | null }>).detail?.workspaceId ?? null;
    if (next !== workspaceId) viewSnapshots.clear();
    workspaceId = next;
  });
  // Outra aba trocou de workspace.
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === "inboxos.active_workspace_id") viewSnapshots.clear();
  });
  let userId: string | null | undefined;
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    if (userId !== undefined && next !== userId) viewSnapshots.clear();
    userId = next;
  });
}

/** Um carregador por tela, usado pela própria tela e pelo pré-carregamento. */
export const viewLoaders = {
  dashboard: () => loadDashboard("30d"),
  crm: () => loadCrm(),
  followUps: () => Promise.all([loadFollowUps(), loadClients("", { sync: false })]),
  agents: () =>
    Promise.all([
      loadAgents(),
      loadCalendar().catch(() => ({ calendars: [], appointments: [], canManage: false })),
      loadKnowledgeDocuments().catch(() => ({ documents: [] })),
    ]),
  calendar: (syncClients: boolean) =>
    Promise.all([
      loadCalendar(),
      loadAgents(),
      loadClients("", { sync: syncClients }).catch(() => ({
        clients: [],
        tags: [],
        canManage: false,
      })),
    ]),
  clients: () => loadClients("", { sync: false }),
};

export type ViewData<K extends keyof typeof viewLoaders> = Awaited<
  ReturnType<(typeof viewLoaders)[K]>
>;

const PREFETCH: Array<[string, () => Promise<unknown>]> = [
  ["followUps", viewLoaders.followUps],
  ["clients", viewLoaders.clients],
  ["calendar", () => viewLoaders.calendar(false)],
  ["agents", viewLoaders.agents],
  ["dashboard:30d", viewLoaders.dashboard],
];

/**
 * Aquece telas ainda não visitadas, uma por vez, pouco depois da abertura.
 * O CRM fica de fora: a leitura dele sincroniza contatos e grava no banco.
 */
export function prefetchViews() {
  let cancelled = false;
  const run = async () => {
    for (const [key, load] of PREFETCH) {
      if (cancelled) return;
      if (viewSnapshots.read(key) !== undefined) continue;
      const remember = viewSnapshots.writer<unknown>(key);
      try {
        remember(await load());
      } catch {
        // Sem permissão ou offline: a própria tela mostra o erro quando for aberta.
      }
    }
  };
  const timer = window.setTimeout(() => void run(), 1500);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
