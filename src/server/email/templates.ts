export type VerificationPurpose =
  | "register"
  | "login_device"
  | "password_reset"
  | "email_change_old"
  | "email_change_new"
  | "phone_change";

export type EmailBranding = {
  brandName?: string | null | undefined;
  senderName?: string | null | undefined;
  supportEmail?: string | null | undefined;
};

function esc(v: string) {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const cleaned = value
    ? Array.from(value)
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code >= 32 && code !== 127;
        })
        .join("")
        .trim()
        .slice(0, 80)
    : "";
  return cleaned || fallback;
}

function resolveBranding(input?: EmailBranding) {
  const fallback = cleanLabel(process.env["PLATFORM_BRAND_NAME"], "InboxOS");
  const brandName = cleanLabel(input?.brandName, fallback);
  const senderName = cleanLabel(input?.senderName, brandName);
  const supportEmail = input?.supportEmail?.trim().toLowerCase();
  return {
    brandName,
    senderName,
    supportEmail:
      supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) ? supportEmail : null,
  };
}

function shell(branding?: EmailBranding) {
  const resolved = resolveBranding(branding);
  const year = new Date().getFullYear();
  const support = resolved.supportEmail ? ` · Suporte: ${esc(resolved.supportEmail)}` : "";
  const header = `<div style="background:#111113;border-bottom:1px solid #27272a;padding:24px 32px"><span style="color:#fafafa;font-size:16px;font-weight:600;letter-spacing:-0.2px">${esc(resolved.brandName)}</span></div>`;
  const footer = `<div style="padding:16px 32px;border-top:1px solid #f4f4f5"><p style="color:#a1a1aa;font-size:11px;margin:0">© ${year} ${esc(resolved.brandName)}${support} · Todos os direitos reservados</p></div>`;
  return {
    branding: resolved,
    open: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f6f6f4;padding:32px;margin:0"><main style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">${header}<div style="padding:32px">`,
    close: `</div>${footer}</main></body></html>`,
  };
}

export function verificationCodeEmail({
  code,
  purpose,
  expiresInMinutes = 10,
  branding,
}: {
  code: string;
  purpose: VerificationPurpose;
  expiresInMinutes?: number;
  branding?: EmailBranding;
}) {
  const shellView = shell(branding);
  const action =
    purpose === "register"
      ? `concluir seu cadastro no ${shellView.branding.brandName}`
      : "confirmar esta ação";
  const subject = `Seu código de verificação — ${shellView.branding.brandName}`;
  const text = `Use o código ${code} para ${action}. Ele expira em ${expiresInMinutes} minutos. Se você não iniciou esta ação, ignore esta mensagem.`;
  const c = esc(code);
  const body = `<h1 style="font-size:18px;font-weight:600;color:#09090b;margin:0 0 8px">Código de verificação</h1><p style="color:#52525b;font-size:14px;margin:0 0 24px;line-height:1.5">Use este código para ${esc(action)}:</p><div style="background:#f4f4f5;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px"><span aria-label="Código de verificação" style="font-size:32px;font-weight:700;letter-spacing:6px;color:#09090b;font-variant-numeric:tabular-nums">${c}</span></div><p style="color:#71717a;font-size:13px;margin:0 0 6px">Expira em <strong>${expiresInMinutes} minutos</strong>.</p><p style="color:#71717a;font-size:13px;margin:0">Se você não iniciou esta ação, ignore esta mensagem.</p>`;
  return { subject, text, html: `${shellView.open}${body}${shellView.close}` };
}

export function securityAlertEmail(input: {
  title: string;
  message: string;
  branding?: EmailBranding;
}) {
  const shellView = shell(input.branding);
  const subject = `${shellView.branding.brandName} — ${input.title}`;
  const text = `${input.title}\n\n${input.message}\n\nSe você não reconhece esta ação, encerre suas sessões e contate o suporte.`;
  const body = `<h1 style="font-size:18px;font-weight:600;color:#09090b;margin:0 0 8px">${esc(input.title)}</h1><p style="color:#52525b;font-size:14px;line-height:1.5;margin:0 0 16px">${esc(input.message)}</p><p style="color:#71717a;font-size:13px;margin:0">Se você não reconhece esta ação, encerre suas sessões e contate o suporte.</p>`;
  return { subject, text, html: `${shellView.open}${body}${shellView.close}` };
}

export function workspaceInviteEmail(input: {
  workspaceName: string;
  inviteUrl: string;
  role: string;
  branding?: EmailBranding;
}) {
  const shellView = shell(input.branding);
  const subject = `Convite para ${input.workspaceName} — ${shellView.branding.brandName}`;
  const text = `Você foi convidado para ${input.workspaceName} como ${input.role}. Acesse: ${input.inviteUrl}`;
  const body = `<h1 style="font-size:18px;font-weight:600;color:#09090b;margin:0 0 8px">Convite para workspace</h1><p style="color:#52525b;font-size:14px;margin:0 0 16px;line-height:1.5">Você foi convidado para <strong>${esc(input.workspaceName)}</strong> como ${esc(input.role)}.</p><a href="${esc(input.inviteUrl)}" style="display:inline-block;background:#18181b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Aceitar convite</a>`;
  return { subject, text, html: `${shellView.open}${body}${shellView.close}` };
}
