import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "inboxos.active_workspace_id";
let cache: string | null = null;
let inflight: Promise<string | null> | null = null;

function stored() {
  return typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY)?.trim() || null;
}

function persist(value: string | null) {
  if (typeof window === "undefined") return;
  if (value) localStorage.setItem(STORAGE_KEY, value);
  else localStorage.removeItem(STORAGE_KEY);
}

supabase.auth.onAuthStateChange(() => {
  cache = null;
  inflight = null;
});

async function resolveCurrentWorkspace(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    persist(null);
    return null;
  }

  const response = await fetch("/api/workspaces/", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    activeWorkspaceId?: string | null;
    workspaces?: Array<{ id: string }>;
  };
  const preferred = stored();
  const validPreferred = payload.workspaces?.some((workspace) => workspace.id === preferred)
    ? preferred
    : null;
  const next = validPreferred ?? payload.activeWorkspaceId ?? payload.workspaces?.[0]?.id ?? null;
  cache = next;
  persist(next);
  return next;
}

export async function currentWorkspaceId(): Promise<string | null> {
  if (cache) return cache;
  if (!inflight) inflight = resolveCurrentWorkspace().finally(() => (inflight = null));
  return inflight;
}

export function setCurrentWorkspaceId(value: string | null) {
  cache = value?.trim() || null;
  persist(cache);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("inboxos:workspace-change", { detail: { workspaceId: cache } }),
    );
  }
}

export function clearCurrentWorkspaceCache() {
  cache = null;
  inflight = null;
  persist(null);
}
