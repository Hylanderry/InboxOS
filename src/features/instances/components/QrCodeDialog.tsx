import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ArrowsClockwise,
  CheckCircle,
  WhatsappLogo,
  WarningCircle,
  QrCode as QrCodeIcon,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api-fetch";

interface QrCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  instanceName?: string | null | undefined;
  onConnected?: (() => void | Promise<void>) | undefined;
  isDarkMode?: boolean | undefined;
}

export function QrCodeDialog({
  isOpen,
  onClose,
  instanceName: initialName,
  onConnected,
  isDarkMode = true,
}: QrCodeDialogProps) {
  const [instanceName, setInstanceName] = useState<string>(initialName?.trim() ?? "");
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "open" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef(status);
  const requestInFlightRef = useRef(false);
  const requestEpochRef = useRef(0);
  const initializedInstanceRef = useRef<string | null>(null);
  const onConnectedRef = useRef(onConnected);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  statusRef.current = status;
  onConnectedRef.current = onConnected;

  useEffect(() => {
    setInstanceName(initialName?.trim() ?? "");
  }, [initialName]);

  // Mantém a tabulação dentro do modal e devolve o foco ao disparador.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  const loadQrCode = useCallback(async (targetName: string) => {
    const validName = targetName.trim();
    if (!validName || requestInFlightRef.current) return;
    const requestEpoch = ++requestEpochRef.current;
    requestInFlightRef.current = true;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const initialize = initializedInstanceRef.current !== validName;
      const res = await apiFetch(`/api/instances/${encodeURIComponent(validName)}/qrcode`, {
        method: initialize ? "POST" : "GET",
      });
      const data = await res.json();
      if (requestEpoch !== requestEpochRef.current) return;
      if (res.ok) initializedInstanceRef.current = validName;

      if (data.state === "open") {
        setStatus("open");
        await onConnectedRef.current?.();
        return;
      }

      if (data.error && !data.base64 && !data.code && !data.qrcode) {
        setStatus("error");
        setErrorMessage(data.error);
        return;
      }

      const qr = data.base64 || data.qrcode?.base64 || data.qr_code || null;
      if (qr) {
        setQrCodeData(qr);
        setStatus("ready");
      } else {
        // Se ainda está gerando no backend, mantém o estado de loading amigável
        setStatus("loading");
      }
    } catch (err: unknown) {
      if (requestEpoch !== requestEpochRef.current) return;
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Falha na comunicação com o servidor");
    } finally {
      if (requestEpoch === requestEpochRef.current) requestInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!isOpen) {
      requestEpochRef.current += 1;
      requestInFlightRef.current = false;
      initializedInstanceRef.current = null;
      setQrCodeData(null);
      setStatus("idle");
      setErrorMessage(null);
    } else {
      const target = instanceName.trim();
      if (!target) {
        setStatus("error");
        setErrorMessage("Escolha um nome para a conexão antes de gerar o QR Code.");
        return;
      }
      loadQrCode(target);

      // Polling a cada 3.5 segundos enquanto não estiver conectado para feedback ágil do escaneamento
      interval = setInterval(() => {
        if (statusRef.current !== "open") {
          loadQrCode(target);
        }
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
      requestEpochRef.current += 1;
      requestInFlightRef.current = false;
    };
  }, [isOpen, instanceName, loadQrCode]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm transition-all duration-200 animate-fade-in overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`relative w-full max-w-md m-auto p-6 rounded-3xl border shadow-2xl transition-all overflow-hidden ${
          isDarkMode
            ? "bg-[#111216] border-white/[0.12] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
            : "bg-white border-neutral-200 text-neutral-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
        }`}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-dialog-title"
      >
        {/* Cabeçalho do Modal */}
        <div className="relative flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/25 shrink-0">
              <QrCodeIcon size={22} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="qr-dialog-title" className="text-base font-bold tracking-tight">
                  Conectar WhatsApp
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                  {instanceName}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Escaneie o QR Code com a câmera do celular
              </p>
            </div>
          </div>

          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar conexão WhatsApp"
            className={`p-2 rounded-xl transition-colors ${
              isDarkMode
                ? "text-neutral-400 hover:text-white hover:bg-white/10"
                : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo Central */}
        <div className="py-6 flex flex-col items-center justify-center">
          {status === "open" ? (
            <div className="text-center py-6 flex flex-col items-center gap-3 animate-smooth-in">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30">
                <CheckCircle size={44} weight="fill" />
              </div>
              <div>
                <p className="text-base font-bold text-[#00a884]">
                  WhatsApp Conectado com Sucesso!
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  A sessão foi sincronizada e está pronta para uso.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#008f70] text-white text-xs font-bold transition-all shadow-md active:scale-95"
              >
                Concluir
              </button>
            </div>
          ) : qrCodeData ? (
            <div className="flex flex-col items-center gap-4 animate-smooth-in">
              {/* Card Branco com QR Code de Alto Contraste */}
              <div className="p-4 bg-white rounded-2xl shadow-lg border border-neutral-200 flex items-center justify-center">
                <img
                  src={
                    qrCodeData.startsWith("data:")
                      ? qrCodeData
                      : `data:image/png;base64,${qrCodeData}`
                  }
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 object-contain rounded-lg"
                  style={{ filter: "grayscale(100%) contrast(300%)" }}
                />
              </div>

              {/* Botão de Atualização Manual */}
              <button
                type="button"
                onClick={() => loadQrCode(instanceName)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isDarkMode
                    ? "text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10"
                    : "text-neutral-600 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                <ArrowsClockwise
                  size={13}
                  className={status === "loading" ? "animate-spin text-[#00a884]" : ""}
                />
                <span>Atualizar QR Code</span>
              </button>

              {/* Instruções passo a passo */}
              <div
                className={`w-full p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                  isDarkMode
                    ? "bg-[#16171d] border-white/10 text-neutral-300"
                    : "bg-neutral-50 border-neutral-200 text-neutral-700"
                }`}
              >
                <p className="font-semibold text-xs flex items-center gap-1.5 text-[#00a884]">
                  <WhatsappLogo size={14} weight="fill" />
                  <span>Como conectar:</span>
                </p>
                <p className="text-[11.5px] leading-relaxed">
                  1. Abra o <strong>WhatsApp</strong> no seu celular
                </p>
                <p className="text-[11.5px] leading-relaxed">
                  2. Toque em <strong>Configurações &gt; Aparelhos Conectados</strong>
                </p>
                <p className="text-[11.5px] leading-relaxed">
                  3. Toque em <strong>Conectar um aparelho</strong> e aponte para o código acima
                </p>
              </div>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center gap-3 text-center animate-smooth-in">
              {status === "error" ? (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    <WarningCircle size={28} weight="bold" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-rose-400">Falha ao inicializar QR Code</p>
                    <p className="text-[11px] text-neutral-400 mt-1 max-w-xs">
                      {errorMessage || "Não foi possível comunicar com o WhatsApp."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadQrCode(instanceName)}
                    className="mt-2 px-4 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f70] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    <ArrowsClockwise size={14} />
                    <span>Tentar Novamente</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <ArrowsClockwise size={32} className="animate-spin text-[#00a884]" />
                  <p
                    className={`text-xs font-semibold ${isDarkMode ? "text-neutral-300" : "text-slate-700"}`}
                  >
                    {status === "loading"
                      ? "Gerando QR Code de pareamento..."
                      : "Aguardando inicialização..."}
                  </p>
                  <p className="text-[11px] text-neutral-500 max-w-xs">
                    Preparando a conexão. O código aparecerá em instantes.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
