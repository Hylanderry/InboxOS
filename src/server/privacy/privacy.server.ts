import { z } from "zod";
import { requirePermission } from "@/server/middleware/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveAuthDatabase } from "@/server/auth/live-auth-database";
import type { Json } from "@/integrations/supabase/types";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
}

function requestMeta(request: Request) {
  return {
    request_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
  };
}

async function audit(
  request: Request,
  workspaceId: string,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const client = await db();
  await client.from("workspace_audit_log").insert({
    workspace_id: workspaceId,
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata as Json,
    ...requestMeta(request),
  });
}

async function ensureSettings(workspaceId: string) {
  const client = await db();
  const { data, error } = await client
    .from("workspace_privacy_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: insertError } = await client
    .from("workspace_privacy_settings")
    .insert({ workspace_id: workspaceId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function getPrivacySummary(request: Request) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  try {
    const client = await db();
    const [settings, requests, auditLog] = await Promise.all([
      ensureSettings(context.workspace.id),
      client
        .from("workspace_data_requests")
        .select("id,request_type,status,created_at,updated_at")
        .eq("workspace_id", context.workspace.id)
        .order("created_at", { ascending: false })
        .limit(10),
      client
        .from("workspace_audit_log")
        .select("id,action,target_type,target_id,created_at,metadata")
        .eq("workspace_id", context.workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (requests.error || auditLog.error) throw requests.error || auditLog.error;
    return json({
      settings,
      requests: requests.data ?? [],
      audit: auditLog.data ?? [],
    });
  } catch {
    return json({ error: "Falha ao carregar controles de privacidade" }, 500);
  }
}

export async function updatePrivacySettings(request: Request, payload: unknown) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  const parsed = z
    .object({
      importHistoryPolicy: z.enum(["none", "from_connection_time"]).optional(),
      messageRetentionDays: z.number().int().min(1).max(3650).optional(),
      mediaRetentionDays: z.number().int().min(1).max(3650).optional(),
      disconnectCleanupPolicy: z.enum(["purge", "retain"]).optional(),
      aiEnabled: z.boolean().optional(),
      piiRedactionEnabled: z.boolean().optional(),
    })
    .safeParse(payload);
  if (!parsed.success) return json({ error: "Política de privacidade inválida" }, 400);
  try {
    const client = await db();
    const patch = {
      ...(parsed.data.importHistoryPolicy !== undefined
        ? { import_history_policy: parsed.data.importHistoryPolicy }
        : {}),
      ...(parsed.data.messageRetentionDays !== undefined
        ? { message_retention_days: parsed.data.messageRetentionDays }
        : {}),
      ...(parsed.data.mediaRetentionDays !== undefined
        ? { media_retention_days: parsed.data.mediaRetentionDays }
        : {}),
      ...(parsed.data.disconnectCleanupPolicy !== undefined
        ? { disconnect_cleanup_policy: parsed.data.disconnectCleanupPolicy }
        : {}),
      ...(parsed.data.aiEnabled !== undefined ? { ai_enabled: parsed.data.aiEnabled } : {}),
      ...(parsed.data.piiRedactionEnabled !== undefined
        ? { pii_redaction_enabled: parsed.data.piiRedactionEnabled }
        : {}),
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from("workspace_privacy_settings")
      .upsert({ workspace_id: context.workspace.id, ...patch }, { onConflict: "workspace_id" })
      .select("*")
      .single();
    if (error) throw error;
    await audit(
      request,
      context.workspace.id,
      context.user.id,
      "privacy.settings.update",
      "workspace",
      context.workspace.id,
      {
        fields: Object.keys(patch).filter(
          (field) => field !== "updated_by" && field !== "updated_at",
        ),
      },
    );
    return json({ settings: data });
  } catch {
    return json({ error: "Falha ao atualizar política de privacidade" }, 500);
  }
}

export async function listPrivacyRequests(request: Request) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  const client = await db();
  const { data, error } = await client
    .from("workspace_data_requests")
    .select(
      "id,request_type,status,reason,result_path,execute_after,error_message,completed_at,created_at,updated_at",
    )
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return error
    ? json({ error: "Falha ao listar solicitações" }, 500)
    : json({ requests: data ?? [] });
}

export async function createPrivacyRequest(request: Request, payload: unknown) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  const parsed = z
    .object({
      requestType: z.enum(["export", "delete", "correct"]),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse(payload);
  if (!parsed.success) return json({ error: "Solicitação de privacidade inválida" }, 400);
  try {
    const client = await db();
    const { data: existing } = await client
      .from("workspace_data_requests")
      .select("id,request_type,status,created_at,execute_after")
      .eq("workspace_id", context.workspace.id)
      .eq("request_type", parsed.data.requestType)
      .in("status", ["pending", "processing", "manual_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return json({ request: existing, deduplicated: true }, 200);
    const executeAfter =
      parsed.data.requestType === "delete"
        ? new Date(Date.now() + 7 * 86_400_000).toISOString()
        : new Date().toISOString();
    const { data, error } = await client
      .from("workspace_data_requests")
      .insert({
        workspace_id: context.workspace.id,
        requested_by: context.user.id,
        request_type: parsed.data.requestType,
        reason: parsed.data.reason ?? null,
        execute_after: executeAfter,
      })
      .select("id,request_type,status,execute_after,created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: concurrent } = await client
          .from("workspace_data_requests")
          .select("id,request_type,status,created_at,execute_after")
          .eq("workspace_id", context.workspace.id)
          .eq("request_type", parsed.data.requestType)
          .in("status", ["pending", "processing", "manual_review"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (concurrent) return json({ request: concurrent, deduplicated: true }, 200);
      }
      throw error;
    }
    await audit(
      request,
      context.workspace.id,
      context.user.id,
      `privacy.request.${parsed.data.requestType}`,
      "data_request",
      data.id,
    );
    return json({ request: data }, 202);
  } catch {
    return json({ error: "Falha ao registrar solicitação" }, 500);
  }
}

export async function listWorkspaceAudit(request: Request) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  const client = await db();
  const limit = Math.min(
    200,
    Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 50) || 50),
  );
  const { data, error } = await client
    .from("workspace_audit_log")
    .select("id,actor_user_id,action,target_type,target_id,metadata,created_at")
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? json({ error: "Falha ao carregar auditoria" }, 500) : json({ audit: data ?? [] });
}

export async function listConsentHistory(request: Request) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  const client = await db();
  const { data, error } = await client
    .from("legal_acceptances")
    .select("id,user_id,document_id,accepted_at,ip,user_agent,metadata")
    .eq("workspace_id", context.workspace.id)
    .order("accepted_at", { ascending: false })
    .limit(200);
  if (error) return json({ error: "Falha ao carregar histórico de consentimentos" }, 500);
  const documentIds = [...new Set((data ?? []).map((row) => row.document_id))];
  const documents = documentIds.length
    ? await client.from("legal_documents").select("id,slug,version,title").in("id", documentIds)
    : { data: [], error: null };
  if (documents.error) return json({ error: "Falha ao carregar documentos consentidos" }, 500);
  const byId = new Map((documents.data ?? []).map((document) => [document.id, document]));
  return json({
    consents: (data ?? []).map((row) => ({ ...row, document: byId.get(row.document_id) ?? null })),
  });
}

export async function getPrivacyExportDownload(request: Request, requestId: string) {
  const context = await requirePermission(request, "workspace.manage");
  if (context instanceof Response) return context;
  if (!/^[0-9a-f-]{20,}$/i.test(requestId)) return json({ error: "Exportação inválida" }, 400);
  try {
    const client = await db();
    const { data, error } = await client
      .from("workspace_data_requests")
      .select("id,status,result_path,result_expires_at")
      .eq("id", requestId)
      .eq("workspace_id", context.workspace.id)
      .eq("request_type", "export")
      .maybeSingle();
    if (error || !data?.result_path || data.status !== "completed") {
      return json({ error: "Exportação ainda não está disponível" }, 404);
    }
    if (!data.result_path.startsWith(`${context.workspace.id}/`)) {
      return json({ error: "Exportação inválida" }, 404);
    }
    if (data.result_expires_at && Date.parse(data.result_expires_at) <= Date.now()) {
      return json({ error: "Exportação expirada" }, 410);
    }
    const { data: signed, error: signedError } = await client.storage
      .from("privacy-exports")
      .createSignedUrl(data.result_path, 5 * 60);
    if (signedError || !signed?.signedUrl)
      return json({ error: "Falha ao preparar download" }, 502);
    await audit(
      request,
      context.workspace.id,
      context.user.id,
      "privacy.export.download",
      "data_request",
      requestId,
    );
    return json({ url: signed.signedUrl, expiresInSeconds: 5 * 60 });
  } catch {
    return json({ error: "Falha ao preparar download" }, 500);
  }
}
