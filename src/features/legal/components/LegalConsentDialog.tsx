import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, ShieldCheck, X } from "@phosphor-icons/react";
import { getLegalDocument } from "../legal-documents";
import { hasReachedLegalDocumentEnd } from "../legal-consent";

const termsDoc = getLegalDocument("terms-of-use")!;
const privacyDoc = getLegalDocument("privacy-policy")!;

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="legal-doc-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function LegalConsentDialog({
  open,
  onClose,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms");
  const [reachedEnd, setReachedEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const termsTabId = useId();
  const privacyTabId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveTab("terms");
    setReachedEnd(false);
    setAccepted(false);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  // Check scroll when changing tab
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      const el = scrollRef.current;
      if (el.scrollHeight <= el.clientHeight + 40) {
        setReachedEnd(true);
      }
    }
  }, [activeTab]);

  if (!open || !mounted) return null;

  const currentDoc = activeTab === "terms" ? termsDoc : privacyDoc;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (
      hasReachedLegalDocumentEnd(el) ||
      Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 48
    ) {
      setReachedEnd(true);
    }
  }

  function handleConfirm() {
    onAccept();
    onClose();
  }

  const dialog = (
    <div
      className="legal-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="legal-dialog-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header fixo com identidade Trax / InboxOS */}
        <header className="legal-dialog-header">
          <div className="legal-dialog-header-info">
            <div className="legal-dialog-kicker">
              <ShieldCheck
                size={14}
                weight="bold"
                className="legal-dialog-shield"
                aria-hidden="true"
              />
              <span>Termos & Privacidade</span>
              <span className="legal-dialog-badge">Operador configurado</span>
            </div>
            <h2 id={titleId} className="legal-dialog-title">
              {activeTab === "terms"
                ? "Termos de Uso da Plataforma"
                : "Política de Privacidade & LGPD"}
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar termos"
            className="legal-dialog-close"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {/* Abas de alternância de documento estilo segmented control */}
        <div className="legal-dialog-nav" role="tablist" aria-label="Documentos legais">
          <button
            id={termsTabId}
            type="button"
            role="tab"
            aria-selected={activeTab === "terms"}
            aria-controls="legal-document-content"
            className={`legal-dialog-tab ${activeTab === "terms" ? "is-active" : ""}`}
            onClick={() => setActiveTab("terms")}
          >
            <FileText
              size={15}
              weight={activeTab === "terms" ? "bold" : "regular"}
              aria-hidden="true"
            />
            <span>Termos de Uso</span>
          </button>
          <button
            id={privacyTabId}
            type="button"
            role="tab"
            aria-selected={activeTab === "privacy"}
            aria-controls="legal-document-content"
            className={`legal-dialog-tab ${activeTab === "privacy" ? "is-active" : ""}`}
            onClick={() => setActiveTab("privacy")}
          >
            <ShieldCheck
              size={15}
              weight={activeTab === "privacy" ? "bold" : "regular"}
              aria-hidden="true"
            />
            <span>Privacidade</span>
          </button>
        </div>

        {/* Corpo rolável com tipografia refinada e sem markdown cru */}
        <div
          ref={scrollRef}
          id="legal-document-content"
          className="legal-dialog-content"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={activeTab === "terms" ? termsTabId : privacyTabId}
          aria-label={`Conteúdo de ${activeTab === "terms" ? "Termos de Uso" : "Privacidade"}`}
          onScroll={handleScroll}
        >
          <div className="legal-doc-meta">
            <span className="legal-doc-version">Versão {currentDoc.version}</span>
            <span className="legal-doc-date">Última atualização: 15 de outubro de 2026</span>
          </div>

          <div className="legal-doc-prose">
            {currentDoc.bodyMarkdown.split("\n").map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={idx} className="legal-doc-gap" />;

              // Main heading already rendered in header
              if (trimmed.startsWith("# ")) return null;

              // Date already displayed in meta section
              if (trimmed.startsWith("Última atualização:")) return null;

              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={idx} className="legal-doc-h3">
                    {trimmed.slice(3)}
                  </h3>
                );
              }

              if (trimmed.startsWith("### ")) {
                return (
                  <h4 key={idx} className="legal-doc-h4">
                    {trimmed.slice(4)}
                  </h4>
                );
              }

              if (trimmed.startsWith("- ")) {
                return (
                  <li key={idx} className="legal-doc-li">
                    {parseInlineMarkdown(trimmed.slice(2))}
                  </li>
                );
              }

              return (
                <p key={idx} className="legal-doc-p">
                  {parseInlineMarkdown(trimmed)}
                </p>
              );
            })}
          </div>
        </div>

        {/* Rodapé com opção desinibida ao rolar e botões na paleta do produto */}
        <footer className="legal-dialog-footer">
          <label className={`legal-dialog-consent ${reachedEnd ? "is-ready" : "is-pending"}`}>
            <span className="legal-dialog-check-control">
              <input
                className="legal-dialog-native-check"
                type="checkbox"
                checked={accepted}
                disabled={!reachedEnd}
                onChange={(event) => setAccepted(event.target.checked)}
                aria-label="Li e concordo com os termos e a política de privacidade"
              />
              <span
                className={`legal-dialog-check-box ${accepted ? "is-checked" : ""}`}
                aria-hidden="true"
              >
                {accepted && <Check size={12} weight="bold" />}
              </span>
            </span>
            <span className="legal-dialog-consent-text">
              Declaro que li e concordo com os Termos e Políticas da{" "}
              <strong>o operador configurado</strong>.
            </span>
          </label>

          <div className="legal-dialog-actions">
            <button type="button" className="legal-dialog-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="legal-dialog-btn-primary"
              disabled={!accepted}
              onClick={handleConfirm}
            >
              <Check size={15} weight="bold" aria-hidden="true" />
              <span>Confirmar e aceitar</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
