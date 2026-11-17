import { createFileRoute, Link } from "@tanstack/react-router";
import { CaretDown, Check, GlobeHemisphereWest } from "@phosphor-icons/react";
import * as Flags from "country-flag-icons/react/3x2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthField, AuthShell, PasswordMeter } from "@/features/auth/components/AuthShell";
import { LegalConsentDialog } from "@/features/legal/components/LegalConsentDialog";
import {
  AUTH_COUNTRIES,
  evaluatePassword,
  isValidCnpj,
  normalizePhoneE164,
  type SupportedCountryCode,
} from "@/features/auth/auth-validation";
import {
  clearRegistrationLegalConsentCookie,
  createRegistrationLegalConsentCookie,
  getRegistrationLegalConsentExpiry,
  hasRegistrationLegalConsentCookie,
  REGISTRATION_LEGAL_CONSENT_TTL_MS,
} from "@/features/legal/legal-consent";
import { browserDeviceToken } from "@/lib/device-token";

const COUNTRY_PLACEHOLDERS: Record<string, string> = {
  BR: "(11) 9 9999-9999",
  US: "(555) 000-0000",
  CA: "(555) 000-0000",
  AR: "(11) 1234-5678",
  CO: "300 123 4567",
  CL: "9 1234 5678",
  MX: "55 1234 5678",
  AU: "0412 345 678",
  PT: "912 345 678",
  ES: "612 345 678",
  FR: "06 12 34 56 78",
  DE: "0151 1234567",
  IT: "312 345 6789",
  GB: "07911 123456",
  NL: "06 12345678",
  IE: "085 123 4567",
};

export const Route = createFileRoute("/auth/register")({ component: Register });

function Register() {
  const invitation = useMemo(() => {
    if (typeof window === "undefined")
      return { invitationId: null as string | null, invitationToken: null as string | null };
    const q = new URLSearchParams(window.location.search);
    return { invitationId: q.get("invitationId"), invitationToken: q.get("invitationToken") };
  }, []);
  const [kind, setKind] = useState<"person" | "company">("person");
  const [country, setCountry] = useState<SupportedCountryCode>("BR");
  const [phone, setPhone] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDialogOpen, setLegalDialogOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legalAcceptedRef = useRef(false);
  const legalDialogInitialAcceptanceRef = useRef(false);
  const legalConsentExpiryTimerRef = useRef<number | null>(null);
  const countryMenuRef = useRef<HTMLDivElement>(null);

  const clearConsentExpiryTimer = useCallback(() => {
    if (legalConsentExpiryTimerRef.current === null || typeof window === "undefined") return;
    window.clearTimeout(legalConsentExpiryTimerRef.current);
    legalConsentExpiryTimerRef.current = null;
  }, []);

  const clearRegistrationLegalConsent = useCallback(() => {
    clearConsentExpiryTimer();
    if (typeof document !== "undefined") {
      document.cookie = clearRegistrationLegalConsentCookie();
    }
    legalAcceptedRef.current = false;
    setAcceptedTerms(false);
  }, [clearConsentExpiryTimer]);

  const scheduleRegistrationLegalConsentExpiry = useCallback(
    (expiresAt: number) => {
      clearConsentExpiryTimer();
      if (typeof window === "undefined") return;
      const delay = Math.max(0, expiresAt - Date.now());
      legalConsentExpiryTimerRef.current = window.setTimeout(() => {
        if (typeof document !== "undefined") {
          document.cookie = clearRegistrationLegalConsentCookie();
        }
        legalConsentExpiryTimerRef.current = null;
        legalAcceptedRef.current = false;
        setAcceptedTerms(false);
      }, delay);
    },
    [clearConsentExpiryTimer],
  );

  const openLegalDialog = useCallback(() => {
    legalDialogInitialAcceptanceRef.current = acceptedTerms;
    legalAcceptedRef.current = false;
    setLegalDialogOpen(true);
  }, [acceptedTerms]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const cookie = document.cookie;
    const expiresAt = getRegistrationLegalConsentExpiry(cookie);
    if (expiresAt !== null && hasRegistrationLegalConsentCookie(cookie)) {
      setAcceptedTerms(true);
      scheduleRegistrationLegalConsentExpiry(expiresAt);
    } else {
      document.cookie = clearRegistrationLegalConsentCookie();
      setAcceptedTerms(false);
    }

    const clearOnPageLeave = () => {
      clearConsentExpiryTimer();
      document.cookie = clearRegistrationLegalConsentCookie();
    };
    window.addEventListener("pagehide", clearOnPageLeave);
    return () => {
      window.removeEventListener("pagehide", clearOnPageLeave);
      clearOnPageLeave();
    };
  }, [clearConsentExpiryTimer, scheduleRegistrationLegalConsentExpiry]);

  useEffect(() => {
    function dismissCountryMenu(event: PointerEvent) {
      if (!countryMenuRef.current?.contains(event.target as Node)) setCountryOpen(false);
    }
    document.addEventListener("pointerdown", dismissCountryMenu);
    return () => document.removeEventListener("pointerdown", dismissCountryMenu);
  }, []);

  useEffect(() => {
    if (!countryOpen) return;
    const closeOnScroll = () => setCountryOpen(false);
    document.addEventListener("scroll", closeOnScroll, true);
    return () => document.removeEventListener("scroll", closeOnScroll, true);
  }, [countryOpen]);

  const selectedCountry = useMemo(
    () => AUTH_COUNTRIES.find((x) => x.code === country) ?? AUTH_COUNTRIES[0]!,
    [country],
  );
  const SelectedFlag = Flags[selectedCountry.code as keyof typeof Flags];
  const phoneE164 = normalizePhoneE164(country, phone);
  const pw = evaluatePassword(password);
  const companyValid = kind === "person" || isValidCnpj(cnpj);
  const can = Boolean(
    acceptedTerms &&
    phoneE164 &&
    pw.valid &&
    password === confirmPassword &&
    companyValid &&
    !submitting,
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!can) return;
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const payload = {
        accountKind: kind,
        firstName: kind === "person" ? String(fd.get("firstName") ?? "") : undefined,
        lastName: kind === "person" ? String(fd.get("lastName") ?? "") : undefined,
        companyName: kind === "company" ? String(fd.get("companyName") ?? "") : undefined,
        taxId: kind === "company" ? cnpj : undefined,
        email: String(fd.get("email") ?? ""),
        countryCode: country,
        phone,
        password,
        acceptedTerms: true,
        acceptedPrivacy: true,
        invitationId: invitation.invitationId,
        invitationToken: invitation.invitationToken,
      };
      const r = await fetch("/api/auth/register/start", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-device-token": browserDeviceToken(),
        },
        body: JSON.stringify(payload),
      });
      const data = (await r.json().catch(() => ({}))) as {
        challengeId?: string;
        error?: string;
      };
      if (!r.ok || !data.challengeId)
        throw new Error(data.error || "Não foi possível iniciar o cadastro");
      sessionStorage.setItem("inboxos.registration_challenge_id", data.challengeId);
      window.location.assign(`/auth/verify?challengeId=${encodeURIComponent(data.challengeId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o cadastro");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Novo workspace"
      title="Crie sua conta"
      description="Seus dados serão usados para preparar seu perfil e workspace."
      footer={
        <p>
          Já possui conta? <Link to="/auth/login">Entrar</Link>
        </p>
      }
    >
      <div className="auth-segment">
        <button type="button" data-active={kind === "person"} onClick={() => setKind("person")}>
          Pessoa física
        </button>
        <button type="button" data-active={kind === "company"} onClick={() => setKind("company")}>
          Empresa
        </button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {kind === "person" ? (
          <div className="auth-grid">
            <AuthField label="Nome" name="firstName" placeholder="Ex.: Ana" required />
            <AuthField label="Sobrenome" name="lastName" placeholder="Ex.: Souza" required />
          </div>
        ) : (
          <>
            <AuthField
              label="Nome da empresa"
              name="companyName"
              placeholder="Nome da empresa"
              required
            />
            <AuthField
              label="CNPJ"
              name="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              required
            />
          </>
        )}
        <AuthField
          label="E-mail"
          name="email"
          type="email"
          placeholder="voce@empresa.com"
          required
        />
        <div className="auth-phone">
          <div className="auth-country-field" ref={countryMenuRef}>
            <span>País</span>
            <div className="auth-country-select">
              <button
                type="button"
                className="auth-country-trigger"
                aria-haspopup="listbox"
                aria-expanded={countryOpen}
                aria-label={`País selecionado: ${selectedCountry.label}`}
                onClick={() => setCountryOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCountryOpen(false);
                }}
              >
                {SelectedFlag ? (
                  <SelectedFlag className="auth-country-flag" title={selectedCountry.label} />
                ) : (
                  <GlobeHemisphereWest size={17} weight="duotone" aria-hidden="true" />
                )}
                <CaretDown
                  size={14}
                  weight="bold"
                  className={`auth-country-caret ${countryOpen ? "is-open" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {countryOpen && (
                <div className="auth-country-menu" role="listbox" aria-label="Selecionar país">
                  {AUTH_COUNTRIES.map((x) => {
                    const OptionFlag = Flags[x.code as keyof typeof Flags];
                    return (
                      <button
                        key={x.code}
                        type="button"
                        role="option"
                        aria-selected={country === x.code}
                        className="auth-country-option"
                        onClick={() => {
                          setCountry(x.code);
                          setCountryOpen(false);
                        }}
                      >
                        {OptionFlag ? (
                          <OptionFlag className="auth-country-flag" title={x.label} />
                        ) : null}
                        <span className="auth-country-option-code">{x.code}</span>
                        <span className="auth-country-option-label">{x.label}</span>
                        <span className="auth-country-option-dial">{x.dialCode}</span>
                        {country === x.code && <Check size={15} weight="bold" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <AuthField
            label="Telefone"
            name="phone"
            type="tel"
            placeholder={COUNTRY_PLACEHOLDERS[country] ?? `${selectedCountry.dialCode} número`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        {phoneE164 && (
          <p className="auth-inline-status is-valid">Será armazenado como {phoneE164}</p>
        )}
        <AuthField
          label="Senha"
          name="password"
          type="password"
          placeholder="Crie uma senha forte"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <AuthField
          label="Confirmar senha"
          name="confirmPassword"
          type="password"
          placeholder="Repita sua senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
        <PasswordMeter password={password} />
        <div
          className="auth-legal-row"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, input")) return;
            if (acceptedTerms) clearRegistrationLegalConsent();
            else openLegalDialog();
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (acceptedTerms) clearRegistrationLegalConsent();
              else openLegalDialog();
            }
          }}
          role="group"
          tabIndex={0}
        >
          <span className="auth-check-wrap">
            <input
              id="legal-consent"
              className="auth-legal-check"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => {
                e.stopPropagation();
                if (acceptedTerms) clearRegistrationLegalConsent();
                else openLegalDialog();
              }}
              aria-describedby="legal-consent-copy"
              aria-label="Li e concordo com os Termos de uso e Termos de Privacidade"
            />
            <span className="auth-check-box" aria-hidden="true">
              <Check size={13} weight="bold" />
            </span>
          </span>
          <span id="legal-consent-copy" className="auth-legal-copy">
            Li e concordo com os{" "}
            <Link
              to="/legal/terms"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openLegalDialog();
              }}
            >
              Termos de uso
            </Link>{" "}
            e os{" "}
            <Link
              to="/legal/privacy"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openLegalDialog();
              }}
            >
              Termos de Privacidade
            </Link>
            .
          </span>
        </div>
        {error && (
          <p className="auth-inline-status is-invalid" role="alert">
            {error}
          </p>
        )}
        <button className="auth-primary" type="submit" disabled={!can}>
          {submitting ? "Enviando código…" : "Criar conta"}
        </button>
      </form>
      <LegalConsentDialog
        open={legalDialogOpen}
        onClose={() => {
          setLegalDialogOpen(false);
          if (!legalAcceptedRef.current && !legalDialogInitialAcceptanceRef.current) {
            clearRegistrationLegalConsent();
          }
          legalAcceptedRef.current = false;
          legalDialogInitialAcceptanceRef.current = false;
        }}
        onAccept={() => {
          const now = Date.now();
          if (typeof document !== "undefined") {
            document.cookie = createRegistrationLegalConsentCookie(now);
          }
          scheduleRegistrationLegalConsentExpiry(now + REGISTRATION_LEGAL_CONSENT_TTL_MS);
          legalAcceptedRef.current = true;
          setAcceptedTerms(true);
        }}
      />
    </AuthShell>
  );
}
