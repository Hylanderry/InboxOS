import type { InputHTMLAttributes, ReactNode } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { PasswordInput } from "@/components/ui/password-input";
import { useTheme } from "@/components/theme-context";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";
import { evaluatePassword } from "../auth-validation";
import { AsciiBackdrop } from "./AsciiBackdrop";
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { isDarkMode, toggleTheme } = useTheme();
  return (
    <main className="auth-page">
      <AsciiBackdrop />
      <button
        type="button"
        className="auth-theme-toggle"
        onClick={toggleTheme}
        aria-label={isDarkMode ? "Ativar tema claro" : "Ativar tema escuro"}
        aria-pressed={isDarkMode}
      >
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="auth-brand-mark overflow-hidden p-1">
            <img
              src={isDarkMode ? "/logo-dark-mode.png" : "/logo-light-mode.png"}
              alt={PLATFORM_BRAND_NAME}
              className="h-full w-full object-contain select-none"
            />
          </div>
          <div>
            <strong>{PLATFORM_BRAND_NAME}</strong>
          </div>
        </div>
        <div className="auth-heading">
          {eyebrow && <div className="auth-eyebrow">{eyebrow}</div>}
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </section>
    </main>
  );
}
type P = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { label: string };
export function AuthField({ label, ...props }: P) {
  const { type = "text", name, placeholder, ...inputProps } = props;
  const resolvedPlaceholder =
    placeholder ??
    (type === "email"
      ? "voce@empresa.com"
      : type === "password"
        ? label.toLowerCase().includes("confirm")
          ? "Repita sua senha"
          : "Digite sua senha"
        : name === "firstName"
          ? "Ex.: Ana"
          : name === "lastName"
            ? "Ex.: Souza"
            : name === "companyName"
              ? "Nome da empresa"
              : name === "cnpj"
                ? "00.000.000/0000-00"
                : name === "phone"
                  ? "+55 telefone"
                  : `Digite ${label.toLowerCase()}`);
  return (
    <label className="auth-field">
      <span>{label}</span>
      {type === "password" ? (
        <PasswordInput
          {...inputProps}
          name={name}
          placeholder={resolvedPlaceholder}
          type="password"
        />
      ) : (
        <input {...inputProps} name={name} placeholder={resolvedPlaceholder} type={type} />
      )}
    </label>
  );
}
export function PasswordMeter({ password = "" }: { password?: string }) {
  const e = evaluatePassword(password);
  return (
    <div
      className={`password-meter is-score-${e.score}`}
      aria-live="polite"
      aria-label={`Força da senha: ${e.label}`}
    >
      <div className="password-meter-track">
        <i style={{ width: `${e.score * 25}%` }} />
      </div>
      <div className="password-rules">
        <span>8+ caracteres</span>
        <span>{e.label}</span>
      </div>
    </div>
  );
}
