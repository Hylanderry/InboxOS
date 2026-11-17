import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useId, useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>;

export function PasswordInput({ className = "", type = "password", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const label = visible ? "Ocultar senha" : "Mostrar senha";

  return (
    <span className="password-input-wrap">
      <input
        {...props}
        id={props.id ?? inputId}
        type={visible ? "text" : type}
        className={`password-input-control ${className}`.trim()}
      />
      <button
        type="button"
        className="password-input-toggle"
        aria-label={label}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeSlash size={18} weight="regular" /> : <Eye size={18} weight="regular" />}
      </button>
    </span>
  );
}
