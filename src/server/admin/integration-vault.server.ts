import { fetchCredentialed } from "../security/credentialed-fetch";
import { sealSecret, openSecret } from "./vault-crypto";
import { z } from "zod";
import { adminDb, adminJson, auditAction, requireSystemAdmin } from "./admin-auth.server";

const secretKeyPattern = /^[a-z][a-z0-9._-]{0,79}$/;
type IntegrationPatch = {
  key: string;
  name?: string;
  baseUrl?: string | null;
  enabled?: boolean;
  config?: Record<string, ConfigValue>;
};
const safeExternalHttps = (raw: string) => {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      host !== "localhost" &&
      !host.endsWith(".localhost") &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) &&
      !host.startsWith("[")
    );
  } catch {
    return false;
  }
};

// `allowed_models` (catálogo liberado do OpenRouter/Groq) é uma LISTA de ids; antes o schema só
// aceitava valores simples e a lista nunca podia ser salva pelo ADM.
const configValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().trim().min(1).max(200)).max(100),
]);
type ConfigValue = z.infer<typeof configValueSchema>;

const integrationSchema = z.object({
  key: z.string().regex(secretKeyPattern),
  name: z.string().trim().min(2).max(120),
  provider: z.enum(["evolution", "groq", "openrouter", "resend", "custom"]),
  baseUrl: z
    .string()
    .url()
    .refine(safeExternalHttps, "URL HTTPS pública obrigatória")
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), configValueSchema).optional(),
});
/** Secret remains on the server; never serialize plaintext to browser. */
export async function resolveManagedIntegration(
  provider: "evolution" | "groq" | "openrouter" | "resend",
) {
  const db = await adminDb();
  const { data: entry, error } = await db
    .from("system_integrations")
    .select("id,key,base_url,config,enabled")
    .eq("key", provider)
    .maybeSingle();
  if (error) throw error;
  if (!entry) return { configured: false, disabled: false, baseUrl: null, config: {}, secrets: {} };
  if (entry.enabled === false)
    return { configured: true, disabled: true, baseUrl: null, config: {}, secrets: {} };
  const { data: rows, error: secretError } = await db
    .from("system_integration_secrets")
    .select("secret_key,ciphertext,iv,auth_tag")
    .eq("integration_id", entry.id);
  if (secretError) throw secretError;
  const secrets: Record<string, string> = {};
  for (const row of rows ?? []) secrets[row.secret_key] = openSecret(row);
  return {
    configured: true,
    disabled: false,
    baseUrl: entry.base_url as string | null,
    config: entry.config as Record<string, unknown>,
    secrets,
  };
}
export async function listIntegrations(request: Request) {
  const a = await requireSystemAdmin(request, "integrations");
  if (a instanceof Response) return a;
  const db = await adminDb();
  const { data, error } = await db
    .from("system_integrations")
    .select(
      "id,key,name,provider,base_url,enabled,config,last_tested_at,last_test_status,updated_at",
    )
    .order("key");
  if (error) return adminJson({ error: "Falha ao listar integrações" }, 500);
  const ids = (data ?? []).map((r) => r.id);
  const { data: secrets, error: se } = ids.length
    ? await db
        .from("system_integration_secrets")
        .select("integration_id,secret_key,masked_hint,version,rotated_at")
        .in("integration_id", ids)
    : { data: [], error: null };
  if (se) return adminJson({ error: "Falha ao carregar metadados de segredos" }, 500);
  return adminJson({
    integrations: (data ?? []).map((r) => ({
      ...r,
      secrets: (secrets ?? [])
        .filter((s) => s.integration_id === r.id)
        .map((s) => ({
          key: s.secret_key,
          maskedHint: s.masked_hint,
          version: s.version,
          rotatedAt: s.rotated_at,
        })),
    })),
  });
}
export async function createIntegration(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "integrations");
  if (a instanceof Response) return a;
  const parsed = integrationSchema.safeParse(raw);
  if (!parsed.success) return adminJson({ error: "Configuração inválida" }, 400);
  // Core integrations have a canonical key/provider mapping and cannot be impersonated.
  const v = parsed.data;
  if (v.provider !== "custom" || ["evolution", "groq", "openrouter", "resend"].includes(v.key))
    return adminJson({ error: "Para editar integração core use PATCH" }, 400);
  const db = await adminDb();
  const { data, error } = await db
    .from("system_integrations")
    .insert({
      key: v.key,
      name: v.name,
      provider: v.provider,
      base_url: v.baseUrl ?? null,
      config: v.config ?? {},
      enabled: v.enabled ?? false,
      updated_by: a.user.id,
    })
    .select("id,key")
    .single();
  if (error)
    return adminJson(
      { error: error.code === "23505" ? "Identificador já em uso" : "Falha ao criar integração" },
      error.code === "23505" ? 409 : 500,
    );
  await auditAction(a, request, "integration.create", "integration", data.id, {
    key: v.key,
    provider: v.provider,
  });
  return adminJson({ integration: data }, 201);
}
export async function updateIntegration(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "integrations");
  if (a instanceof Response) return a;
  const parsed = z
    .object({
      key: z.string().regex(secretKeyPattern),
      name: z.string().trim().min(2).max(120).optional(),
      baseUrl: z.string().url().refine(safeExternalHttps).nullable().optional(),
      enabled: z.boolean().optional(),
      config: z.record(z.string(), configValueSchema).optional(),
    })
    .refine((x) => Object.keys(x).length > 1)
    .safeParse(raw);
  if (!parsed.success) return adminJson({ error: "Atualização inválida" }, 400);
  const v = parsed.data as IntegrationPatch,
    db = await adminDb();
  const patch: {
    updated_by: string;
    name?: string;
    base_url?: string | null;
    enabled?: boolean;
    config?: Record<string, ConfigValue>;
  } = { updated_by: a.user.id };
  if (v.name !== undefined) patch.name = v.name;
  if (v.baseUrl !== undefined) patch.base_url = v.baseUrl;
  if (v.enabled !== undefined) patch.enabled = v.enabled;
  if (v.config !== undefined) patch.config = v.config;
  const { data, error } = await db
    .from("system_integrations")
    .update(patch)
    .eq("key", v.key)
    .select("id,key,enabled,base_url")
    .maybeSingle();
  if (error) return adminJson({ error: "Falha ao atualizar integração" }, 500);
  if (!data) return adminJson({ error: "Integração não encontrada" }, 404);
  await auditAction(a, request, "integration.update", "integration", data.id, {
    key: v.key,
    fields: Object.keys(patch),
  });
  return adminJson({ integration: data });
}
export async function rotateSecret(request: Request, raw: unknown) {
  const a = await requireSystemAdmin(request, "integrations");
  if (a instanceof Response) return a;
  const parsed = z
    .object({
      integrationKey: z.string().regex(secretKeyPattern),
      secretKey: z.string().regex(secretKeyPattern),
      value: z.string().min(8).max(8192),
    })
    .safeParse(raw);
  if (!parsed.success) return adminJson({ error: "Segredo inválido" }, 400);
  const v = parsed.data,
    db = await adminDb();
  const { data: integration, error: ie } = await db
    .from("system_integrations")
    .select("id,key")
    .eq("key", v.integrationKey)
    .maybeSingle();
  if (ie) return adminJson({ error: "Erro ao consultar integração" }, 500);
  if (!integration) return adminJson({ error: "Integração não encontrada" }, 404);
  let sealed;
  try {
    sealed = sealSecret(v.value);
  } catch {
    return adminJson({ error: "Cofre indisponível: configure INTEGRATION_VAULT_KEY" }, 503);
  }
  // INSERT/UPSERT server only. Rotating a secret always replaces ciphertext with a new random IV.
  const { data: prior, error: pe } = await db
    .from("system_integration_secrets")
    .select("version")
    .eq("integration_id", integration.id)
    .eq("secret_key", v.secretKey)
    .maybeSingle();
  if (pe) return adminJson({ error: "Falha ao consultar versão" }, 500);
  const { error } = await db.from("system_integration_secrets").upsert(
    {
      integration_id: integration.id,
      secret_key: v.secretKey,
      ...sealed,
      masked_hint: `••••${v.value.slice(-4)}`,
      version: (prior?.version ?? 0) + 1,
      rotated_by: a.user.id,
      rotated_at: new Date().toISOString(),
    },
    { onConflict: "integration_id,secret_key" },
  );
  if (error) return adminJson({ error: "Falha ao salvar segredo" }, 500);
  await auditAction(a, request, "integration.secret.rotate", "integration", integration.id, {
    key: v.integrationKey,
    secretKey: v.secretKey,
    version: (prior?.version ?? 0) + 1,
  });
  return adminJson({ success: true, version: (prior?.version ?? 0) + 1 });
}

/** Tests a known provider with a read-only request. Custom URLs require a server allowlist. */
export async function testIntegration(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "integrations");
  if (actor instanceof Response) return actor;
  const v = z.object({ key: z.string().regex(secretKeyPattern) }).safeParse(raw);
  if (!v.success) return adminJson({ error: "Identificador inválido" }, 400);
  const db = await adminDb();
  const { data: entry, error: readError } = await db
    .from("system_integrations")
    .select("id,key,provider,base_url,enabled,config")
    .eq("key", v.data.key)
    .maybeSingle();
  if (readError) return adminJson({ error: "Falha ao consultar integração" }, 500);
  if (!entry) return adminJson({ error: "Integração não encontrada" }, 404);
  if (!entry.enabled) return adminJson({ error: "Integração desativada" }, 409);
  let destination = "",
    apiKey = "",
    authorization = "",
    header = "";
  try {
    if (entry.provider === "evolution") {
      const m = await resolveManagedIntegration("evolution");
      destination =
        String(m.baseUrl || process.env["EVOLUTION_API_URL"] || "").replace(/\/+$/, "") +
        "/instance/fetchInstances";
      apiKey = m.secrets["api_key"] || process.env["EVOLUTION_API_KEY"] || "";
      header = "apikey";
      authorization = apiKey;
    } else if (entry.provider === "groq") {
      const m = await resolveManagedIntegration("groq");
      destination = "https://api.groq.com/openai/v1/models";
      apiKey = m.secrets["api_key"] || process.env["GROQ_API_KEY"] || "";
      header = "Authorization";
      authorization = `Bearer ${apiKey}`;
    } else if (entry.provider === "openrouter") {
      const m = await resolveManagedIntegration("openrouter");
      destination = "https://openrouter.ai/api/v1/models";
      apiKey = m.secrets["api_key"] || process.env["OPENROUTER_API_KEY"] || "";
      header = "Authorization";
      authorization = `Bearer ${apiKey}`;
    } else if (entry.provider === "resend") {
      const m = await resolveManagedIntegration("resend");
      destination = "https://api.resend.com/domains";
      apiKey = m.secrets["api_key"] || process.env["RESEND_API_KEY"] || "";
      header = "Authorization";
      authorization = `Bearer ${apiKey}`;
    } else {
      const hosts = (process.env["INTEGRATION_TEST_ALLOWED_HOSTS"] || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const base = String(entry.base_url || "");
      if (!safeExternalHttps(base) || !hosts.includes(new URL(base).hostname.toLowerCase()))
        return adminJson(
          { error: "Teste de API custom exige host em INTEGRATION_TEST_ALLOWED_HOSTS" },
          422,
        );
      const cfg =
        entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)
          ? (entry.config as Record<string, unknown>)
          : {};
      const path = typeof cfg["test_path"] === "string" ? cfg["test_path"] : "/";
      if (!path.startsWith("/") || path.startsWith("//") || path.includes(".."))
        return adminJson({ error: "test_path inválido" }, 422);
      destination = base.replace(/\/+$/, "") + path;
      const { data: secretRows, error: se } = await db
        .from("system_integration_secrets")
        .select("secret_key,ciphertext,iv,auth_tag")
        .eq("integration_id", entry.id);
      if (se) throw se;
      const secretName = typeof cfg["secret_key"] === "string" ? cfg["secret_key"] : "api_key";
      const selected = (secretRows || []).find((r) => r.secret_key === secretName);
      apiKey = selected ? openSecret(selected) : "";
      header =
        typeof cfg["header"] === "string" && /^[A-Za-z0-9-]{1,80}$/.test(cfg["header"])
          ? cfg["header"]
          : "Authorization";
      authorization =
        typeof cfg["prefix"] === "string" ? `${cfg["prefix"]}${apiKey}` : `Bearer ${apiKey}`;
    }
    if (!destination || !apiKey || !safeExternalHttps(destination))
      return adminJson({ error: "URL HTTPS pública e API key válidas são obrigatórias" }, 422);
    const r = await fetchCredentialed(destination, {
      method: "GET",
      headers: { [header]: authorization },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const status = r.ok ? "ok" : "error";
    await db
      .from("system_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: status,
        last_test_error: r.ok ? null : `HTTP ${r.status}`,
        updated_by: actor.user.id,
      })
      .eq("id", entry.id);
    await auditAction(actor, request, "integration.test", "integration", entry.id, {
      status,
      httpStatus: r.status,
    });
    return adminJson({ ok: r.ok, httpStatus: r.status }, r.ok ? 200 : 502);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao testar integração";
    await db
      .from("system_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: "error",
        last_test_error: message.slice(0, 180),
        updated_by: actor.user.id,
      })
      .eq("id", entry.id);
    return adminJson({ error: "Teste de conectividade falhou" }, 502);
  }
}
