import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "../middleware/auth";
import type { LiveAuthDatabase } from "./live-auth-database";
import {
  getLegalDocument,
  LEGAL_DOCUMENTS,
  renderLegalMarkdown,
  type LegalDocumentDefinition,
} from "@/features/legal/legal-documents";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function getLegalStatus(request: Request) {
  const context = await requirePermission(request, "workspace.read");
  if (context instanceof Response) return context;
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
  const [{ data: docs, error: docsError }, { data: accepts, error: acceptsError }] =
    await Promise.all([
      db
        .from("legal_documents")
        .select("id,workspace_id,slug,version,title,required,active,published_at")
        .eq("active", true)
        .or(`workspace_id.is.null,workspace_id.eq.${context.workspace.id}`)
        .order("published_at", { ascending: false }),
      db
        .from("legal_acceptances")
        .select("document_id,accepted_at")
        .eq("user_id", context.user.id)
        .or(`workspace_id.is.null,workspace_id.eq.${context.workspace.id}`),
    ]);
  if (docsError || acceptsError) return json({ error: "Falha ao carregar documentos legais" }, 500);
  const accepted = new Map((accepts ?? []).map((row) => [row.document_id, row.accepted_at]));
  const bySlug = new Map<string, NonNullable<typeof docs>[number]>();
  for (const doc of docs ?? []) {
    const current = bySlug.get(doc.slug);
    if (!current || (doc.workspace_id === context.workspace.id && current.workspace_id === null))
      bySlug.set(doc.slug, doc);
  }
  return json({
    documents: [...bySlug.values()].map((doc) => ({
      ...doc,
      acceptedAt: accepted.get(doc.id) ?? null,
    })),
  });
}

export async function getWorkspaceLegalDocuments(request: Request) {
  const { requirePermission } = await import("../middleware/auth");
  const workspace = await requirePermission(request, "workspace.read");
  if (workspace instanceof Response) return workspace;
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
  const [{ data: company, error }, { data: stored, error: storedError }] = await Promise.all([
    db
      .from("workspace_company_profiles")
      .select("legal_name,brand_name,support_email")
      .eq("workspace_id", workspace.workspace.id)
      .maybeSingle(),
    db
      .from("legal_documents")
      .select("workspace_id,slug,version,title,body_markdown,required,active,published_at")
      .eq("active", true)
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.workspace.id}`)
      .order("published_at", { ascending: false }),
  ]);
  if (error || storedError) return json({ error: "Falha ao carregar documentos legais" }, 500);
  const branding = {
    legalName: company?.legal_name,
    brandName: company?.brand_name,
    supportEmail: company?.support_email,
  };
  const known = new Map(LEGAL_DOCUMENTS.map((document) => [document.slug, document]));
  const selected = new Map<string, NonNullable<typeof stored>[number]>();
  for (const document of stored ?? []) {
    if (!known.has(document.slug as LegalDocumentDefinition["slug"])) continue;
    const current = selected.get(document.slug);
    if (
      !current ||
      (document.workspace_id === workspace.workspace.id && current.workspace_id === null)
    )
      selected.set(document.slug, document);
  }
  const documents = [...known.entries()].map(([slug, fallback]) => {
    const current = selected.get(slug);
    const rendered = current
      ? renderLegalMarkdown(current.body_markdown, branding)
      : (getLegalDocument(slug as LegalDocumentDefinition["slug"], branding)?.bodyMarkdown ?? "");
    return {
      slug,
      route: fallback.route,
      version: current?.version ?? fallback.version,
      title: current?.title ?? fallback.title,
      required: current?.required ?? fallback.required,
      bodyMarkdown: rendered,
    };
  });
  return json({ documents });
}
