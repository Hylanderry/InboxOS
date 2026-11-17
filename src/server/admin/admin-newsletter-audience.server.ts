import { fetchCredentialed } from "../security/credentialed-fetch";
import { z } from "zod";
import { adminJson, auditAction, requireSystemAdmin } from "./admin-auth.server";
import { resolveManagedIntegration } from "./integration-vault.server";
async function resend(path: string, method: "GET" | "POST", body?: unknown) {
  const c = await resolveManagedIntegration("resend");
  if (c.disabled) throw new Error("Resend desativado no ADM");
  const key = c.secrets["api_key"] || process.env["RESEND_API_KEY"];
  if (!key) throw new Error("Resend não configurado");
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
  };
  if (body) init.body = JSON.stringify(body);
  const res = await fetchCredentialed(`https://api.resend.com${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  return data;
}
export async function listAudience(request: Request) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  try {
    return adminJson({ segments: await resend("/segments", "GET") });
  } catch {
    return adminJson({ error: "Não foi possível consultar segmentos no Resend" }, 502);
  }
}
export async function addAudience(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "newsletter");
  if (a instanceof Response) return a;
  const schema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("create_segment"), name: z.string().trim().min(2).max(80) }),
    z.object({
      action: z.literal("add_contact"),
      email: z.string().email(),
      segmentId: z.string().min(1),
      consentConfirmed: z.literal(true),
      firstName: z.string().max(80).optional(),
    }),
  ]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return adminJson({ error: "Dados inválidos ou consentimento não confirmado" }, 400);
  try {
    const v = parsed.data;
    const result =
      v.action === "create_segment"
        ? await resend("/segments", "POST", { name: v.name })
        : await resend("/contacts", "POST", {
            email: v.email,
            first_name: v.firstName,
            segments: [{ id: v.segmentId }],
          });
    await auditAction(a, request, `newsletter.${v.action}`, "newsletter_audience", null, {
      action: v.action,
      ...(v.action === "create_segment" ? { name: v.name } : { segmentId: v.segmentId }),
    });
    return adminJson({ success: true, result }, 201);
  } catch {
    return adminJson({ error: "Não foi possível alterar audiência no Resend" }, 502);
  }
}
