import { fetchCredentialed } from "../security/credentialed-fetch";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminDb, adminJson, auditAction, requireSystemAdmin } from "./admin-auth.server";
import { resolveManagedIntegration } from "./integration-vault.server";
import { renderNewsletter } from "./newsletter-render";
import { isNewsletterMediaSignatureValid } from "./media-signatures";
import { logServerError } from "../logging.ts";
import {
  isAllowedNewsletterMedia,
  MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES,
} from "@/lib/newsletter-upload-policy";

const url = z
  .string()
  .url()
  .refine((v) => new URL(v).protocol === "https:", "URL https obrigatória");
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().max(250) }),
  z.object({ type: z.literal("paragraph"), text: z.string().max(4000) }),
  z.object({ type: z.literal("image"), src: url, alt: z.string().max(240) }),
  z.object({ type: z.literal("video"), href: url, thumbnail: url, title: z.string().max(240) }),
  z.object({ type: z.literal("button"), href: url, label: z.string().max(100) }),
  z.object({ type: z.literal("divider") }),
]);
const campaign = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(200),
  previewText: z.string().max(250).optional(),
  fromEmail: z.string().email(),
  fromName: z
    .string()
    .max(100)
    .regex(/^[^<>\r\n]*$/)
    .optional(),
  segmentId: z.string().min(1).max(160),
  content: z.array(block).min(1).max(60),
});
async function resendConfig() {
  const managed = await resolveManagedIntegration("resend");
  if (managed.disabled) throw new Error("Integração desativada no ADM");
  const key = managed.secrets["api_key"] || process.env["RESEND_API_KEY"];
  if (!key) throw new Error("Chave Resend não configurada");
  return { key, base: "https://api.resend.com" };
}
async function resendRequest(path: string, body: unknown) {
  const cfg = await resendConfig();
  const r = await fetchCredentialed(cfg.base + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}`);
  return payload;
}
export async function listCampaigns(request: Request) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  const d = await adminDb(),
    { data, error } = await d
      .from("newsletter_campaigns")
      .select(
        "id,name,subject,preview_text,from_name,from_email,segment_id,status,content,resend_broadcast_id,scheduled_at,sent_at,created_at,updated_at,last_error",
      )
      .order("created_at", { ascending: false })
      .limit(100);
  return error
    ? adminJson({ error: "Falha ao listar campanhas" }, 500)
    : adminJson({ campaigns: data ?? [] });
}
export async function upsertCampaign(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  const parsed = campaign.safeParse(raw);
  if (!parsed.success)
    return adminJson(
      { error: "Campanha inválida", details: parsed.error.issues.map((x) => x.path.join(".")) },
      400,
    );
  const v = parsed.data,
    d = await adminDb();
  const input = {
    name: v.name,
    subject: v.subject,
    preview_text: v.previewText ?? null,
    from_email: v.fromEmail,
    from_name: v.fromName ?? null,
    segment_id: v.segmentId,
    content: v.content,
    updated_by: a.user.id,
  };
  if (v.id) {
    const { data, error } = await d
      .from("newsletter_campaigns")
      .update(input)
      .eq("id", v.id)
      .eq("status", "draft")
      .select("id,status")
      .maybeSingle();
    if (error) return adminJson({ error: "Falha ao salvar campanha" }, 500);
    if (!data) return adminJson({ error: "Somente rascunhos podem ser editados" }, 409);
    await auditAction(a, request, "newsletter.update", "newsletter", v.id, { subject: v.subject });
    return adminJson({ campaign: data });
  }
  const { data, error } = await d
    .from("newsletter_campaigns")
    .insert({ ...input, created_by: a.user.id, status: "draft" })
    .select("id,status")
    .single();
  if (error) return adminJson({ error: "Falha ao criar campanha" }, 500);
  await auditAction(a, request, "newsletter.create", "newsletter", data.id, { subject: v.subject });
  return adminJson({ campaign: data }, 201);
}
export async function publishCampaign(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  const parsed = z
    .object({ id: z.string().uuid(), confirmation: z.literal("ENVIAR NEWSLETTER") })
    .safeParse(raw);
  if (!parsed.success) return adminJson({ error: "Confirmação explícita obrigatória" }, 400);
  const d = await adminDb();
  const { data: c, error: ce } = await d
    .from("newsletter_campaigns")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (ce || !c) return adminJson({ error: "Campanha não encontrada" }, 404);
  if (c.status !== "draft")
    return adminJson({ error: "Somente rascunhos podem ser enviados" }, 409);
  const parsedContent = z.array(block).safeParse(c.content);
  if (!parsedContent.success || !c.segment_id || !c.from_email)
    return adminJson({ error: "Conteúdo/audiência/remetente incompleto" }, 422);
  // State transition before external side-effects prevents concurrent sends. Ambiguous external failures stay queued for manual reconciliation.
  const locked = await d
    .from("newsletter_campaigns")
    .update({ status: "queued", last_error: null })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (locked.error || !locked.data)
    return adminJson({ error: "Campanha alterada por outro administrador" }, 409);
  try {
    const created = await resendRequest("/broadcasts", {
      name: c.name,
      segment_id: c.segment_id,
      subject: c.subject,
      from: c.from_name ? `${c.from_name} <${c.from_email}>` : c.from_email,
      html: renderNewsletter(parsedContent.data),
      text: parsedContent.data
        .map((b) => ("text" in b ? b.text : "label" in b ? b.label : ""))
        .join("\n"),
      preview_text: c.preview_text ?? undefined,
    });
    if (typeof created.id !== "string") throw new Error("Resend não retornou ID");
    const stored = await d
      .from("newsletter_campaigns")
      .update({ resend_broadcast_id: created.id })
      .eq("id", c.id);
    if (stored.error) throw stored.error;
    await resendRequest(`/broadcasts/${encodeURIComponent(created.id)}/send`, {});
    await d
      .from("newsletter_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", c.id);
    await auditAction(a, request, "newsletter.send", "newsletter", c.id, {
      resendBroadcastId: created.id,
    });
    return adminJson({ success: true, broadcastId: created.id });
  } catch (e) {
    logServerError("[newsletter] provider outcome uncertain, manual reconciliation required", e);
    await d
      .from("newsletter_campaigns")
      .update({ last_error: "Verificar status no Resend antes de reenviar" })
      .eq("id", c.id);
    return adminJson(
      {
        error:
          "Entrega ainda não confirmada. Verifique no Resend antes de reenviar; campanha bloqueada contra duplicidade.",
      },
      502,
    );
  }
}
export async function uploadNewsletterAsset(request: Request) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return adminJson({ error: "Arquivo ausente" }, 400);
  if (!isAllowedNewsletterMedia(file.type, file.size))
    return adminJson(
      {
        error: `Tipo de mídia não permitido ou arquivo acima de ${MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES / (1024 * 1024)} MB. O limite protege o upload pela Function da Vercel.`,
      },
      415,
    );
  // File.type comes from the browser and can be spoofed. Inspect the content
  // before writing any bytes to the public newsletter-media bucket.
  let signature: Uint8Array;
  try {
    signature = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  } catch {
    return adminJson({ error: "Não foi possível validar o arquivo" }, 400);
  }
  if (!isNewsletterMediaSignatureValid(file.type, signature)) {
    return adminJson({ error: "O conteúdo não corresponde ao formato de mídia informado" }, 415);
  }
  const ext = (
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm",
    } as Record<string, string>
  )[file.type];
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const d = await adminDb(),
    { error } = await d.storage
      .from("newsletter-media")
      .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return adminJson({ error: "Falha no upload" }, 500);
  const { data } = d.storage.from("newsletter-media").getPublicUrl(path);
  const recorded = await d.from("newsletter_media_assets").insert({
    kind: file.type.startsWith("image/") ? "image" : "video",
    storage_path: path,
    public_url: data.publicUrl,
    mime_type: file.type,
    file_name: file.name.slice(0, 200),
    size_bytes: file.size,
    created_by: a.user.id,
  });
  if (recorded.error) {
    await d.storage.from("newsletter-media").remove([path]);
    return adminJson({ error: "Falha ao registrar mídia" }, 500);
  }
  await auditAction(a, request, "newsletter.media.upload", "newsletter_media", path, {
    mime: file.type,
    size: file.size,
  });
  return adminJson(
    { url: data.publicUrl, kind: file.type.startsWith("image/") ? "image" : "video" },
    201,
  );
}
