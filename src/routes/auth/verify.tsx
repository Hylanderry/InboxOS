import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { normalizeOtp } from "@/features/auth/auth-validation";
import { browserDeviceToken } from "@/lib/device-token";
export const Route = createFileRoute("/auth/verify")({ component: Verify });
function Verify() {
  const initial = useMemo(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("challengeId") ||
      sessionStorage.getItem("inboxos.registration_challenge_id") ||
      ""
    );
  }, []);
  const [challengeId] = useState(initial),
    [code, setCode] = useState(""),
    [cooldown, setCooldown] = useState(60),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/register/verify", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": browserDeviceToken(),
        },
        body: JSON.stringify({ challengeId, code }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Código inválido");
      sessionStorage.removeItem("inboxos.registration_challenge_id");
      window.location.assign("/auth/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o código");
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!challengeId || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/register/resend", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": browserDeviceToken(),
        },
        body: JSON.stringify({ challengeId }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        error?: string;
        resendAfterSeconds?: number;
      };
      if (!r.ok) throw new Error(d.error || "Não foi possível reenviar");
      setCooldown(d.resendAfterSeconds ?? 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reenviar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      eyebrow="Verificação"
      title="Digite o código"
      description="Enviamos um código de seis dígitos para confirmar esta ação."
    >
      <form className="auth-form" onSubmit={verify}>
        <label className="auth-field">
          <span>Código de segurança</span>
          <input
            className="auth-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(normalizeOtp(e.target.value))}
            placeholder="000000"
          />
        </label>
        {error && (
          <p className="auth-inline-status is-invalid" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-primary"
          type="submit"
          disabled={busy || code.length !== 6 || !challengeId}
        >
          {busy ? "Confirmando…" : "Confirmar código"}
        </button>
        <button
          className="auth-secondary"
          type="button"
          disabled={busy || cooldown > 0 || !challengeId}
          onClick={resend}
        >
          {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
        </button>
      </form>
    </AuthShell>
  );
}
