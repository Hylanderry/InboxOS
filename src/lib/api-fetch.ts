export function buildApiHeaders(
  initial: HeadersInit | undefined,
  accessToken?: string | null,
  workspaceId?: string | null,
) {
  const h = new Headers(initial);
  if (accessToken) h.set("Authorization", `Bearer ${accessToken}`);
  if (workspaceId) h.set("x-workspace-id", workspaceId);
  return h;
}
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { workspace?: boolean } = {},
) {
  const { supabase } = await import("../integrations/supabase/client.ts");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  let workspace: string | null = null;
  if (token && options.workspace !== false) {
    const { currentWorkspaceId } = await import("./current-workspace.ts");
    workspace = await currentWorkspaceId();
  }
  const response = await fetch(input, {
    ...init,
    headers: buildApiHeaders(init.headers, token, workspace),
  });
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("inboxos:session-revoked"));
  return response;
}
