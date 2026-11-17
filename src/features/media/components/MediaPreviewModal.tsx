import { useEffect, useRef } from "react";
import { X, DownloadSimple } from "@phosphor-icons/react";

interface MediaPreviewModalProps {
  media: {
    type: "image" | "video" | "document";
    url: string;
    name?: string | null | undefined;
  } | null;
  onClose: () => void;
}

export function MediaPreviewModal({ media, onClose }: MediaPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!media) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), video[controls], iframe",
        ) || [],
      );
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (
        e.shiftKey &&
        (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [media]);

  if (!media) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={media.name ? `Pré-visualização de ${media.name}` : "Pré-visualização de mídia"}
    >
      {/* Barra de Ações Superior */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={media.url}
          download={media.name || "arquivo"}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm shadow-md"
          title="Baixar arquivo"
          aria-label={media.name ? `Baixar ${media.name}` : "Baixar arquivo"}
        >
          <DownloadSimple size={18} weight="bold" />
        </a>

        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Fechar pré-visualização"
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm shadow-md"
          title="Fechar visualização (Esc)"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {/* Conteúdo Central */}
      <div
        className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {media.type === "image" && (
          <img
            src={media.url}
            alt={media.name || "Imagem"}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        )}

        {media.type === "video" && (
          <video
            src={media.url}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
          />
        )}

        {media.type === "document" && (
          <iframe
            src={media.url}
            title={media.name || "Documento"}
            className="w-full h-[80vh] rounded-xl bg-white shadow-2xl border border-neutral-800"
          />
        )}
      </div>

      {media.name && (
        <p className="text-xs text-neutral-400 mt-3 text-center max-w-lg truncate">{media.name}</p>
      )}
    </div>
  );
}
