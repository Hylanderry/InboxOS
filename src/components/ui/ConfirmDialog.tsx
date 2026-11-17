import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { WarningCircle, X } from "@phosphor-icons/react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  dark?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmações no padrão visual do produto, com foco restaurado e sem alertas do navegador. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  busy = false,
  dark = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
    requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [busy, onCancel, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] grid min-h-[100dvh] place-items-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
          dark
            ? "border-white/10 bg-[#121215] text-white"
            : "border-neutral-200 bg-white text-neutral-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
              destructive
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                : "bg-neutral-900/5 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
            }`}
            aria-hidden="true"
          >
            <WarningCircle size={21} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-bold tracking-tight">
              {title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="mt-1.5 text-sm leading-6 text-neutral-500 dark:text-neutral-400"
            >
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-500/10 hover:text-current disabled:cursor-wait disabled:opacity-50"
            aria-label="Fechar confirmação"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${
              dark
                ? "border-white/10 text-neutral-200 hover:bg-white/[0.06]"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-xl px-4 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
              destructive
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            }`}
          >
            {busy ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
