import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveAuthDatabase } from "@/server/auth/live-auth-database";
import { z } from "zod";
import { requirePermission } from "@/server/middleware/auth";
import { safePublicError } from "@/server/public-error";

type KnowledgeDb = SupabaseClient<LiveAuthDatabase>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function db(): Promise<KnowledgeDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as KnowledgeDb;
}

const documentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(20_000),
  active: z.boolean().optional(),
});

async function audit(
  client: KnowledgeDb,
  workspaceId: string,
  userId: string,
  action: string,
  id?: string,
) {
  // Auditing is best effort so a legacy database missing the audit table does
  // not turn a successful knowledge-base mutation into a false 500.
  try {
    await client.from("workspace_audit_log").insert({
      workspace_id: workspaceId,
      actor_user_id: userId,
      action,
      target_type: "knowledge_document",
      target_id: id ?? null,
      metadata: {},
    });
  } catch {
    // Best effort until the workspace audit migration is present.
  }
}

export async function listKnowledgeDocuments(request: Request) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  const client = await db();
  const { data, error } = await client
    .from("workspace_knowledge_documents")
    .select("id,title,content,active,created_at,updated_at")
    .eq("workspace_id", auth.workspace.id)
    .order("updated_at", { ascending: false });
  if (error)
    return json({ error: safePublicError(error, "Falha ao carregar base de conhecimento") }, 500);
  return json({ documents: data ?? [] });
}

export async function createKnowledgeDocument(request: Request, body: unknown) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = documentSchema.omit({ id: true }).parse(body);
    const client = await db();
    const { data, error } = await client
      .from("workspace_knowledge_documents")
      .insert({
        workspace_id: auth.workspace.id,
        title: payload.title,
        content: payload.content,
        active: payload.active !== false,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("id,title,content,active,created_at,updated_at")
      .single();
    if (error) throw error;
    await audit(client, auth.workspace.id, auth.user.id, "knowledge_document.created", data.id);
    return json({ document: data }, 201);
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Documento inválido"
            : safePublicError(error, "Falha ao criar documento"),
      },
      400,
    );
  }
}

export async function updateKnowledgeDocument(request: Request, body: unknown) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  try {
    const payload = documentSchema.extend({ id: z.string().uuid() }).parse(body);
    const client = await db();
    const { data, error } = await client
      .from("workspace_knowledge_documents")
      .update({
        title: payload.title,
        content: payload.content,
        ...(payload.active === undefined ? {} : { active: payload.active }),
        updated_by: auth.user.id,
      })
      .eq("workspace_id", auth.workspace.id)
      .eq("id", payload.id)
      .select("id,title,content,active,created_at,updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Documento não encontrado" }, 404);
    await audit(client, auth.workspace.id, auth.user.id, "knowledge_document.updated", data.id);
    return json({ document: data });
  } catch (error: unknown) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Documento inválido"
            : safePublicError(error, "Falha ao atualizar documento"),
      },
      400,
    );
  }
}

export async function deleteKnowledgeDocument(request: Request) {
  const auth = await requirePermission(request, "agents.manage");
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "id inválido" }, 400);
  const client = await db();
  const { data, error } = await client
    .from("workspace_knowledge_documents")
    .delete()
    .eq("workspace_id", auth.workspace.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: safePublicError(error, "Falha ao excluir documento") }, 400);
  if (!data) return json({ error: "Documento não encontrado" }, 404);
  await audit(client, auth.workspace.id, auth.user.id, "knowledge_document.deleted", data.id);
  return json({ success: true });
}
