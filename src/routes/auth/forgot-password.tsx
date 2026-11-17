import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthField, AuthShell, PasswordMeter } from "@/features/auth/components/AuthShell";
import { evaluatePassword, normalizeOtp } from "@/features/auth/auth-validation";

export const Route = createFileRoute("/auth/forgot-password")({ component: Forgot });

function Forgot() {
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [grant, setGrant] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/start", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        challengeId?: string | null;
        message?: string;
      };
      if (data.challengeId) setChallengeId(data.challengeId);
      setMessage(
        data.message || "Se o e-mail estiver cadastrado, enviaremos um código de seis dígitos.",
      );
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a recuperação");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/verify", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        challengeId?: string;
        grantToken?: string;
      };
      if (!response.ok || !data.challengeId || !data.grantToken) {
        throw new Error(data.error || "Código inválido");
      }
      setChallengeId(data.challengeId);
      setGrant(data.grantToken);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challengeId) return;
    setResendBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/resend", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(
        data.message || "Se o e-mail estiver cadastrado, enviaremos um código de seis dígitos.",
      );
    } catch {
      setMessage("Se o e-mail estiver cadastrado, enviaremos um código de seis dígitos.");
    } finally {
      setResendBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (!evaluatePassword(password).valid || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          grantToken: grant,
          newPassword: password,
          revokeOtherSessions: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a senha");
      window.location.replace("/auth/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Recuperação"
      title={
        step === "email"
          ? "Recupere seu acesso"
          : step === "code"
            ? "Confirme o código"
            : "Defina uma nova senha"
      }
      description="A resposta inicial nunca revela se uma conta existe."
      footer={<Link to="/auth/login">Voltar para o login</Link>}
    >
      {step === "email" ? (
        <form className="auth-form" onSubmit={start}>
          <AuthField
            label="E-mail"
            type="email"
            placeholder="voce@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="auth-primary" disabled={busy}>
            {busy ? "Enviando…" : "Enviar código"}
          </button>
          {message && <p className="auth-hint">{message}</p>}
        </form>
      ) : step === "code" ? (
        <form className="auth-form" onSubmit={verify}>
          <label className="auth-field">
            <span>Código</span>
            <input
              className="auth-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(normalizeOtp(e.target.value))}
            />
          </label>
          {message && <p className="auth-hint">{message}</p>}
          {error && <p className="auth-inline-status is-invalid">{error}</p>}
          <button className="auth-primary" disabled={busy || code.length !== 6 || !challengeId}>
            {busy ? "Confirmando…" : "Confirmar"}
          </button>
          <button
            className="auth-secondary"
            type="button"
            onClick={resend}
            disabled={busy || resendBusy || !challengeId}
          >
            {resendBusy ? "Reenviando…" : "Reenviar código"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={reset}>
          <AuthField
            label="Nova senha"
            type="password"
            placeholder="Crie uma senha forte"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <AuthField
            label="Confirmar senha"
            type="password"
            placeholder="Repita sua senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <PasswordMeter password={password} />
          {error && <p className="auth-inline-status is-invalid">{error}</p>}
          <button
            className="auth-primary"
            disabled={busy || password !== confirm || !evaluatePassword(password).valid}
          >
            {busy ? "Alterando…" : "Alterar senha"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
