import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isValidCnpj,
  normalizePhoneE164,
  type SupportedCountryCode,
} from "../../features/auth/auth-validation";
import { requireAuth, requirePermission, requireWorkspace } from "../middleware/auth";
import type { LiveAuthDatabase } from "./live-auth-database";

type ProfilePayload = {
  phone?: unknown;
  countryCode?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  legalName?: unknown;
  tradeName?: unknown;
  taxId?: unknown;
  brandName?: unknown;
  supportEmail?: unknown;
  senderName?: unknown;
  accentToken?: unknown;
  whiteLabelEnabled?: unknown;
  customDomain?: unknown;
};
type ProfileUpdate = {
  updated_at?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_e164?: string | null;
  country_code?: string | null;
};
type CompanyUpdate = {
  updated_at?: string;
  legal_name?: string;
  trade_name?: string | null;
  tax_country?: string;
  tax_id_type?: string;
  tax_id?: string;
  tax_id_normalized?: string;
  tax_status?: string;
  tax_verified_at?: string | null;
  phone_e164?: string | null;
  country_code?: string | null;
  brand_name?: string | null;
  support_email?: string | null;
  sender_name?: string | null;
  accent_token?: string;
  white_label_enabled?: boolean;
  custom_domain?: string | null;
  custom_domain_status?: string;
};
const IMMUTABLE = new Set(["user_id", "userId", "workspace_id", "workspaceId", "role"]),
  MIMES = new Set(["image/jpeg", "image/png", "image/webp"]),
  MAX = 4 * 1024 * 1024;
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });
}
async function clients() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return { admin: supabaseAdmin, db: supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase> };
}
function object(x: unknown) {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as ProfilePayload) : null;
}
function immutable(v: ProfilePayload) {
  return Object.keys(v).some((k) => IMMUTABLE.has(k));
}
function phone(v: ProfilePayload) {
  if (v.phone === undefined) return { ok: true as const, value: undefined };
  if (typeof v.phone !== "string" || typeof v.countryCode !== "string")
    return { ok: false as const };
  if (!v.phone.trim()) return { ok: true as const, value: null };
  const n = normalizePhoneE164(v.countryCode as SupportedCountryCode, v.phone);
  return n ? { ok: true as const, value: n } : { ok: false as const };
}
function optionalText(value: unknown, max: number) {
  if (value === undefined) return { ok: true as const, value: undefined };
  if (typeof value !== "string" || value.length > max) return { ok: false as const };
  return { ok: true as const, value: value.trim() || null };
}
function domain(value: unknown) {
  if (value === undefined) return { ok: true as const, value: undefined };
  if (typeof value !== "string" || !value.trim()) return { ok: true as const, value: null };
  const candidate = value.trim().toLowerCase();
  try {
    const parsed = new URL(`https://${candidate}`);
    if (!parsed.hostname.includes(".") || parsed.hostname !== candidate || parsed.pathname !== "/")
      return { ok: false as const };
    return { ok: true as const, value: parsed.hostname };
  } catch {
    return { ok: false as const };
  }
}
export async function getProfile(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { db } = await clients();
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return json({ error: "Falha ao carregar perfil" }, 500);
  return json({ profile: data });
}
export async function updateProfile(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const v = object(payload);
  if (!v || immutable(v)) return json({ error: "Payload inválido" }, 400);
  const p = phone(v);
  if (!p.ok) return json({ error: "Telefone inválido" }, 400);
  const patch: ProfileUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (typeof v.firstName === "string") patch.first_name = v.firstName.trim() || null;
  if (typeof v.lastName === "string") patch.last_name = v.lastName.trim() || null;
  if (p.value !== undefined) {
    patch.phone_e164 = p.value;
    patch.country_code = typeof v.countryCode === "string" ? v.countryCode : null;
  }
  const { db } = await clients();
  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();
  return error ? json({ error: "Falha ao atualizar perfil" }, 500) : json({ profile: data });
}
export async function getCompanyProfile(request: Request) {
  // Legal/tax identity belongs to workspace managers. Branding itself has a
  // separate minimal projection so normal agents can render the shell without
  // receiving the company's CNPJ or private contact fields.
  const ctx = await requirePermission(request, "workspace.manage");
  if (ctx instanceof Response) return ctx;
  const { db } = await clients();
  const { data, error } = await db
    .from("workspace_company_profiles")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  return error ? json({ error: "Falha ao carregar empresa" }, 500) : json({ company: data });
}

/**
 * Public workspace surfaces only need the branding projection.  Keep tax and
 * identity fields behind the company settings endpoint so a regular member
 * cannot enumerate the workspace's legal profile just to render a logo.
 */
export async function getWorkspaceBranding(request: Request) {
  const ctx = await requirePermission(request, "workspace.read");
  if (ctx instanceof Response) return ctx;
  const { db } = await clients();
  const { data, error } = await db
    .from("workspace_company_profiles")
    .select(
      "workspace_id,brand_name,trade_name,logo_path,logo_light_path,logo_dark_path,favicon_path,support_email,sender_name,accent_token,white_label_enabled,custom_domain,custom_domain_status",
    )
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  return error ? json({ error: "Falha ao carregar marca" }, 500) : json({ branding: data });
}

/** Domain management has its own minimal projection for routing/verification. */
export async function getWorkspaceDomain(request: Request) {
  const ctx = await requirePermission(request, "workspace.read");
  if (ctx instanceof Response) return ctx;
  const { db } = await clients();
  const { data, error } = await db
    .from("workspace_company_profiles")
    .select("custom_domain,custom_domain_status")
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  return error ? json({ error: "Falha ao carregar domínio" }, 500) : json({ domain: data });
}
export async function updateCompanyProfile(request: Request, payload: unknown) {
  const ctx = await requirePermission(request, "workspace.manage");
  if (ctx instanceof Response) return ctx;
  const v = object(payload);
  if (!v || immutable(v)) return json({ error: "Payload inválido" }, 400);
  const p = phone(v);
  if (!p.ok) return json({ error: "Telefone inválido" }, 400);
  const brandName = optionalText(v.brandName, 120),
    supportEmail = optionalText(v.supportEmail, 254),
    senderName = optionalText(v.senderName, 120),
    customDomain = domain(v.customDomain);
  if (!brandName.ok || !supportEmail.ok || !senderName.ok || !customDomain.ok)
    return json({ error: "Configuração de marca inválida" }, 400);
  if (supportEmail.value && !/^\S+@\S+\.\S+$/.test(supportEmail.value))
    return json({ error: "E-mail de suporte inválido" }, 400);
  if (
    v.accentToken !== undefined &&
    !["neutral", "teal", "indigo", "amber"].includes(String(v.accentToken))
  )
    return json({ error: "Token de cor inválido" }, 400);
  if (v.whiteLabelEnabled !== undefined && typeof v.whiteLabelEnabled !== "boolean")
    return json({ error: "Configuração white-label inválida" }, 400);
  const patch: CompanyUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (typeof v.legalName === "string" && v.legalName.trim()) patch.legal_name = v.legalName.trim();
  if (typeof v.tradeName === "string") patch.trade_name = v.tradeName.trim() || null;
  if (v.taxId !== undefined) {
    if (typeof v.taxId !== "string" || !isValidCnpj(v.taxId))
      return json({ error: "CNPJ inválido" }, 400);
    patch.tax_country = "BR";
    patch.tax_id_type = "CNPJ";
    patch.tax_id = v.taxId.trim();
    patch.tax_id_normalized = v.taxId.replace(/\D/g, "");
    patch.tax_status = "unverified";
    patch.tax_verified_at = null;
  }
  if (p.value !== undefined) {
    patch.phone_e164 = p.value;
    patch.country_code = typeof v.countryCode === "string" ? v.countryCode : null;
  }
  if (brandName.value !== undefined) patch.brand_name = brandName.value;
  if (supportEmail.value !== undefined) patch.support_email = supportEmail.value;
  if (senderName.value !== undefined) patch.sender_name = senderName.value;
  if (v.accentToken !== undefined) patch.accent_token = String(v.accentToken);
  if (v.whiteLabelEnabled !== undefined) patch.white_label_enabled = v.whiteLabelEnabled as boolean;
  if (customDomain.value !== undefined) {
    patch.custom_domain = customDomain.value;
    patch.custom_domain_status = customDomain.value ? "pending" : "not_configured";
  }
  const { db } = await clients();
  const { data: existing, error: existingError } = await db
    .from("workspace_company_profiles")
    .select("workspace_id")
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (existingError) return json({ error: "Falha ao carregar empresa" }, 500);
  if (existing) {
    const { data, error } = await db
      .from("workspace_company_profiles")
      .update(patch)
      .eq("workspace_id", ctx.workspace.id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return json({ error: "Domínio já está em uso" }, 409);
      return json({ error: "Falha ao atualizar empresa" }, 500);
    }
    return json({ company: data });
  }
  const legalName = typeof v.legalName === "string" ? v.legalName.trim() : "",
    taxId = typeof v.taxId === "string" ? v.taxId.trim() : "";
  if (!legalName || !isValidCnpj(taxId))
    return json(
      { error: "Razão social e CNPJ válidos são obrigatórios no primeiro cadastro da empresa" },
      400,
    );
  const insert = {
    workspace_id: ctx.workspace.id,
    legal_name: legalName,
    trade_name: typeof v.tradeName === "string" ? v.tradeName.trim() || null : null,
    tax_country: "BR",
    tax_id_type: "CNPJ",
    tax_id: taxId,
    tax_id_normalized: taxId.replace(/\D/g, ""),
    tax_status: "unverified",
    tax_verified_at: null,
    phone_e164: p.value ?? null,
    country_code: p.value !== undefined ? String(v.countryCode) : null,
    logo_path: null,
    brand_name: brandName.value ?? null,
    logo_light_path: null,
    logo_dark_path: null,
    favicon_path: null,
    support_email: supportEmail.value ?? null,
    sender_name: senderName.value ?? null,
    accent_token: v.accentToken === undefined ? "neutral" : String(v.accentToken),
    white_label_enabled: v.whiteLabelEnabled === true,
    custom_domain: customDomain.value ?? null,
    custom_domain_status: customDomain.value ? "pending" : "not_configured",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("workspace_company_profiles")
    .insert(insert)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return json({ error: "Domínio já está em uso" }, 409);
    return json({ error: "Falha ao criar perfil da empresa" }, 500);
  }
  return json({ company: data });
}
async function upload(file: File, path: string) {
  if (!MIMES.has(file.type) || file.size <= 0 || file.size > MAX) throw new Error("INVALID_MEDIA");
  const { admin } = await clients();
  const bytes = await file.arrayBuffer();
  const { error } = await admin.storage
    .from("profile-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
export async function uploadAvatar(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Arquivo inválido" }, 400);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg",
      path = `users/${auth.user.id}/avatar-${randomUUID()}.${ext}`,
      stored = await upload(file, path),
      { db } = await clients();
    const { error } = await db
      .from("profiles")
      .update({ avatar_path: stored, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id);
    if (error) throw error;
    return json({ path: stored });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && e.message === "INVALID_MEDIA"
            ? "Imagem inválida"
            : "Falha no upload",
      },
      400,
    );
  }
}
export async function uploadCompanyLogo(request: Request) {
  const ctx = await requirePermission(request, "workspace.manage");
  if (ctx instanceof Response) return ctx;
  try {
    const form = await request.formData(),
      file = form.get("file"),
      rawVariant = form.get("variant"),
      variant = rawVariant === "dark" ? "dark" : rawVariant === "light" ? "light" : "default";
    if (!(file instanceof File)) return json({ error: "Arquivo inválido" }, 400);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg",
      path = `workspaces/${ctx.workspace.id}/logo-${variant}-${randomUUID()}.${ext}`,
      stored = await upload(file, path),
      { db } = await clients();
    const { error } = await db
      .from("workspace_company_profiles")
      .update({
        ...(variant === "light"
          ? { logo_light_path: stored }
          : variant === "dark"
            ? { logo_dark_path: stored }
            : { logo_path: stored }),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", ctx.workspace.id);
    if (error) throw error;
    return json({ path: stored });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && e.message === "INVALID_MEDIA"
            ? "Imagem inválida"
            : "Falha no upload",
      },
      400,
    );
  }
}

export async function uploadCompanyFavicon(request: Request) {
  const ctx = await requirePermission(request, "workspace.manage");
  if (ctx instanceof Response) return ctx;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Arquivo inválido" }, 400);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `workspaces/${ctx.workspace.id}/favicon-${randomUUID()}.${ext}`;
    const stored = await upload(file, path);
    const { db } = await clients();
    const { error } = await db
      .from("workspace_company_profiles")
      .update({ favicon_path: stored, updated_at: new Date().toISOString() })
      .eq("workspace_id", ctx.workspace.id);
    if (error) throw error;
    return json({ path: stored });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && e.message === "INVALID_MEDIA"
            ? "Imagem inválida"
            : "Falha no upload",
      },
      400,
    );
  }
}
