import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth";
import type { LiveAuthDatabase } from "./live-auth-database";
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
}
export async function listSecuritySessions(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const d = await db();
  const [{ data: devices, error: de }, { data: sessions, error: se }] = await Promise.all([
    d
      .from("user_devices")
      .select(
        "id,display_name,device_family,browser,browser_version,os,os_version,first_seen_at,last_seen_at,trusted_until,revoked_at,revoke_reason",
      )
      .eq("user_id", auth.user.id)
      .order("last_seen_at", { ascending: false }),
    d
      .from("user_sessions")
      .select(
        "id,device_id,created_at,expires_at,last_seen_at,last_ip,user_agent,last_workspace_id,revoked_at,revoke_reason",
      )
      .eq("user_id", auth.user.id)
      .order("last_seen_at", { ascending: false }),
  ]);
  if (de || se) return json({ error: "Não foi possível carregar sessões" }, 500);
  return json({
    currentSessionId: auth.session.id,
    currentDeviceId: auth.session.deviceId,
    devices: devices ?? [],
    sessions: sessions ?? [],
  });
}
export async function mutateSecuritySession(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Ação inválida" }, 400);
  const v = payload as { action?: unknown; targetId?: unknown },
    action = typeof v.action === "string" ? v.action : "",
    targetId = typeof v.targetId === "string" ? v.targetId : "",
    now = new Date().toISOString(),
    d = await db();
  if (action === "revoke_current") {
    if (!auth.session.id) return json({ error: "Sessão atual não encontrada" }, 404);
    const { data, error } = await d
      .from("user_sessions")
      .update({ revoked_at: now, revoke_reason: "logout" })
      .eq("id", auth.session.id)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();
    if (error) return json({ error: "Falha ao encerrar sessão" }, 500);
    return data ? json({ success: true }) : json({ error: "Sessão atual não encontrada" }, 404);
  }
  if (action === "revoke_others") {
    const { error } = await d
      .from("user_sessions")
      .update({ revoked_at: now, revoke_reason: "revoke_others" })
      .eq("user_id", auth.user.id)
      .neq("id", auth.session.id ?? "")
      .is("revoked_at", null);
    return error ? json({ error: "Falha ao revogar sessões" }, 500) : json({ success: true });
  }
  if (action === "revoke_session" && targetId) {
    const { data, error } = await d
      .from("user_sessions")
      .update({ revoked_at: now, revoke_reason: "manual" })
      .eq("id", targetId)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();
    if (error) return json({ error: "Falha ao revogar sessão" }, 500);
    return data ? json({ success: true }) : json({ error: "Sessão não encontrada" }, 404);
  }
  if ((action === "untrust_device" || action === "revoke_device") && targetId) {
    const patch =
      action === "untrust_device"
        ? { trusted_until: null }
        : { trusted_until: null, revoked_at: now, revoke_reason: "manual" };
    const { data, error } = await d
      .from("user_devices")
      .update(patch)
      .eq("id", targetId)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();
    if (error) return json({ error: "Falha ao atualizar dispositivo" }, 500);
    if (!data) return json({ error: "Dispositivo não encontrado" }, 404);
    if (action === "revoke_device")
      await d
        .from("user_sessions")
        .update({ revoked_at: now, revoke_reason: "device_revoked" })
        .eq("user_id", auth.user.id)
        .eq("device_id", targetId)
        .is("revoked_at", null);
    return json({ success: true });
  }
  return json({ error: "Ação inválida" }, 400);
}
