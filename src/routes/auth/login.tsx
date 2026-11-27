import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { AuthField, AuthShell } from "@/features/auth/components/AuthShell";
import { TurnstileWidget } from "@/features/auth/components/TurnstileWidget";
import { normalizeOtp } from "@/features/auth/auth-validation";
import { browserDeviceToken } from "@/lib/device-token";
import { supabase } from "@/integrations/supabase/client";

const TURNSTILE_SITE_KEY = import.meta.env["VITE_CLOUDFLARE_TURNSTILE_SITE_KEY"] as
  string | undefined;

export const Route = createFileRoute("/auth/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || !data.session) return;
        const next = new URLSearchParams(window.location.search).get("next");
        const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        window.location.replace(destination);
      })
      .catch(() => {
        // A stale/corrupt persisted session must not block a fresh login.
      });
    return () => {
      active = false;
    };
  }, []);

  async function acceptSession(data: { accessToken?: string; refreshToken?: string }) {
    if (!data.accessToken || !data.refreshToken) throw new Error("Sessão inválida");
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    if (sessionError) throw sessionError;
    // Preserve an explicit internal destination (notably /admin) after the
    // device challenge. Never accept an absolute or protocol-relative URL.
    const next = new URLSearchParams(window.location.search).get("next");
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    window.location.replace(destination);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const deviceToken = browserDeviceToken();
      const response = await fetch("/api/auth/login/start", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": deviceToken,
        },
        body: JSON.stringify({
          email,
          password,
          deviceToken,
          rememberDevice: remember,
          turnstileToken,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        requiresOtp?: boolean;
        challengeId?: string;
        accessToken?: string;
        refreshToken?: string;
      };
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar");
      if (data.requiresOtp && data.challengeId) {
        setChallengeId(data.challengeId);
        setStatus("Código enviado para o seu e-mail.");
        return;
      }
      await acceptSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const deviceToken = browserDeviceToken();
      const response = await fetch("/api/auth/login/verify", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": deviceToken,
        },
        body: JSON.stringify({
          email,
          password,
          deviceToken,
          rememberDevice: remember,
          challengeId,
          code,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        accessToken?: string;
        refreshToken?: string;
      };
      if (!response.ok) throw new Error(data.error || "Código inválido");
      await acceptSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o dispositivo");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challengeId) return;
    setResendBusy(true);
    setError(null);
    setStatus(null);
    try {
      const deviceToken = browserDeviceToken();
      const response = await fetch("/api/auth/login/resend", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": deviceToken,
        },
        body: JSON.stringify({
          email,
          password,
          deviceToken,
          rememberDevice: remember,
          challengeId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível reenviar o código");
      setStatus("Novo código enviado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reenviar o código");
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow=""
      title={challengeId ? "Confirme este dispositivo" : "Entre na sua conta"}
      description={
        challengeId
          ? "Digite o código enviado por e-mail para liberar este dispositivo."
          : "Acesse seu workspace e continue seus atendimentos."
      }
      footer={
        <p>
          Não possui conta? <Link to="/auth/register">Criar conta</Link>
        </p>
      }
    >
      {challengeId ? (
        <form className="auth-form" onSubmit={verify}>
          <label className="auth-field">
            <span>Código de segurança</span>
            <input
              className="auth-otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              aria-label="Código de segurança de seis dígitos"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(normalizeOtp(e.target.value))}
            />
          </label>
          {status && (
            <p className="auth-hint" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="auth-inline-status is-invalid" role="alert">
              {error}
            </p>
          )}
          <button className="auth-primary" disabled={busy || code.length !== 6}>
            {busy ? "Confirmando…" : "Confirmar dispositivo"}
          </button>
          <button
            className="auth-secondary"
            type="button"
            onClick={resend}
            disabled={busy || resendBusy}
          >
            {resendBusy ? "Reenviando…" : "Reenviar código"}
          </button>
          <button
            className="auth-secondary"
            type="button"
            onClick={() => {
              setChallengeId(null);
              setCode("");
              setStatus(null);
              setError(null);
            }}
            disabled={busy || resendBusy}
          >
            Voltar
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={start}>
          <AuthField
            label="E-mail"
            type="email"
            placeholder="voce@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <AuthField
            label="Senha"
            type="password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="auth-row">
            <label className="auth-check" htmlFor="remember-device">
              <span className="auth-check-wrap">
                <input
                  id="remember-device"
                  className="auth-check-input"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="auth-check-box" aria-hidden="true">
                  <Check size={13} weight="bold" />
                </span>
              </span>
              <span>Lembrar de mim</span>
            </label>
            <Link to="/auth/forgot-password" className="auth-link">
              Esqueci minha senha
            </Link>
          </div>
          {error && (
            <p className="auth-inline-status is-invalid" role="alert">
              {error}
            </p>
          )}
          {TURNSTILE_SITE_KEY && (
            <TurnstileWidget
              siteKey={TURNSTILE_SITE_KEY}
              onTokenChange={handleTurnstileToken}
              theme="auto"
            />
          )}
          <button
            className="auth-primary"
            disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
