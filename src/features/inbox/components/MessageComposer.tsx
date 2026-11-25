import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Paperclip,
  Microphone,
  PaperPlaneRight,
  Image as ImageIcon,
  FileText,
  ArrowBendUpLeft,
  X,
  LockKey,
  Lightbulb,
} from "@phosphor-icons/react";
import type { ChatMessage } from "../types";
import { useAudioRecorder } from "@/features/media/hooks/useAudioRecorder";
import { AudioRecorderBar } from "@/features/media/components/AudioRecorder";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { sanitizeSenderName } from "@/lib/emoji";

// Draft cache em memória para preservar rascunhos entre trocas de conversa.
// Evita dependência de key prop no pai e sobrevive a remounts acidentais.
const draftCache = new Map<string, string>();

interface MessageComposerProps {
  chatId: string;
  onSendMessage: (payload: {
    text?: string | undefined;
    media?: string | undefined;
    mediaFile?: Blob | undefined;
    mimetype?: string | undefined;
    fileName?: string | undefined;
    duration?: number | undefined;
    type?: "text" | "image" | "video" | "audio" | "document" | "sticker" | undefined;
    quotedMessageId?: string | undefined;
    quotedMessage?:
      | {
          senderName?: string | null | undefined;
          senderPhone?: string | null | undefined;
          text?: string | null | undefined;
          type?: string | null | undefined;
        }
      | undefined;
  }) => Promise<boolean>;
  replyingTo?: ChatMessage | null | undefined;
  onCancelReply?: (() => void) | undefined;
  isDarkMode?: boolean | undefined;
  isGroup?: boolean | undefined;
  canSend?: boolean | undefined;
  isAnnouncement?: boolean | undefined;
  isAdmin?: boolean | undefined;
  onPresence?: ((presence: "composing" | "recording" | "paused") => void) | undefined;
}

export function MessageComposer({
  chatId,
  onSendMessage,
  onPresence,
  replyingTo,
  onCancelReply,
  isDarkMode = true,
  isGroup = false,
  canSend = true,
  isAnnouncement = false,
  isAdmin = false,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // D1: Sugestões automáticas de follow-up baseadas em palavras-chave da conversa
  const followUpSuggestions = useMemo(() => {
    if (replyingTo?.text) {
      const lower = replyingTo.text.toLowerCase();
      const suggestions: string[] = [];
      if (lower.includes("preço") || lower.includes("valor") || lower.includes("quanto custa")) {
        suggestions.push("Posso te enviar uma proposta detalhada!");
        suggestions.push("Temos condições especiais esta semana.");
      }
      if (lower.includes("prazo") || lower.includes("quando") || lower.includes("demora")) {
        suggestions.push("O prazo estimado é de 3 a 5 dias úteis.");
        suggestions.push("Consigo agilizar para entrega amanhã.");
      }
      if (lower.includes("obrigad") || lower.includes("valeu") || lower.includes("thanks")) {
        suggestions.push("Fico à disposição se precisar de mais algo! 😊");
        suggestions.push("Qualquer dúvida, é só chamar.");
      }
      if (lower.includes("agendar") || lower.includes("reunião") || lower.includes("visita")) {
        suggestions.push("Que tal agendarmos para esta semana?");
        suggestions.push("Tenho horários disponíveis amanhã às 14h.");
      }
      return suggestions.slice(0, 3); // Máximo de 3 sugestões
    }
    return [];
  }, [replyingTo]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const attachTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // O ref impede envios simultâneos até antes da próxima renderização do React.
  const sendInFlightRef = useRef(false);
  const audioStopInFlightRef = useRef(false);
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasRecordingRef = useRef(false);

  const { isRecording, recordingTimer, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder();

  // Persistir e restaurar rascunho por chatId ao trocar de conversa.
  // Salva o texto atual antes de restaurar o draft do novo chat para não perder
  // rascunhos não enviados ao navegar entre conversas.
  useEffect(() => {
    setText((prev) => {
      // Salvar draft do chat anterior (se houver texto não vazio)
      // O chatId anterior não está disponível aqui diretamente, então salvamos
      // sempre que text muda via onChange e restauramos quando chatId muda.
      return prev;
    });
  }, []);

  // Restaurar draft quando chatId mudar
  useEffect(() => {
    const savedDraft = draftCache.get(chatId) ?? "";
    setText(savedDraft);
  }, [chatId]);

  // Salvar draft no cache sempre que o texto mudar
  useEffect(() => {
    if (text.trim()) {
      draftCache.set(chatId, text);
    } else {
      draftCache.delete(chatId);
    }
  }, [text, chatId]);

  useEffect(() => {
    if (!onPresence) return;
    if (isRecording) {
      wasRecordingRef.current = true;
      onPresence("recording");
    } else if (wasRecordingRef.current) {
      wasRecordingRef.current = false;
      onPresence("paused");
    }
  }, [isRecording, onPresence]);

  const clearPresenceTimer = () => {
    if (presenceTimerRef.current) {
      clearTimeout(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
  };

  const schedulePresencePaused = () => {
    clearPresenceTimer();
    if (!onPresence) return;
    presenceTimerRef.current = setTimeout(() => {
      presenceTimerRef.current = null;
      onPresence("paused");
    }, 2500);
  };

  useEffect(() => () => clearPresenceTimer(), []);

  // Foco automático no input ao selecionar uma mensagem para responder
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // O menu também fecha via Escape, sem afetar o editor ou as mensagens.
  useEffect(() => {
    if (!isAttachOpen) return;
    attachMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsAttachOpen(false);
        attachTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isAttachOpen]);

  // Fecha menu de anexos se clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = text.trim();
    if (!clean || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setIsSending(true);
    const quotedPayload = replyingTo
      ? {
          quotedMessageId: replyingTo.externalId || undefined,
          quotedMessage: {
            senderName: replyingTo.senderName || null,
            senderPhone: replyingTo.senderPhone || null,
            text:
              replyingTo.text ||
              (replyingTo.type === "image"
                ? "Foto"
                : replyingTo.type === "audio"
                  ? "Áudio"
                  : replyingTo.type === "sticker"
                    ? "Figurinha"
                    : "Mídia"),
            type: replyingTo.type,
          },
        }
      : {};

    try {
      const ok = await onSendMessage({ text: clean, type: "text", ...quotedPayload });
      if (ok) {
        // Não apagar um novo rascunho digitado enquanto o request estava pendente.
        setText((current) => (current.trim() === clean ? "" : current));
        if (inputRef.current?.value.trim() === clean) inputRef.current.style.height = "auto";
        if (onCancelReply) onCancelReply();
        clearPresenceTimer();
        onPresence?.("paused");
      }
    } catch {
      WhatsAppToast.networkError("Não foi possível enviar a mensagem. Tente novamente.");
    } finally {
      // Mesmo em falha de rede o usuário pode corrigir o texto e tentar de novo.
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
    if (val.trim() && onPresence) {
      onPresence("composing");
      schedulePresencePaused();
    } else {
      clearPresenceTimer();
      onPresence?.("paused");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFileUpload(file, "image");
          return;
        }
      }
    }
  };

  // Uma única operação de envio por vez, inclusive anexos e gravações.
  // onSendMessage já mostra toast quando retorna false; só mostramos toast em throws.
  const sendMedia = async (payload: Parameters<typeof onSendMessage>[0]) => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setIsSending(true);
    try {
      const ok = await onSendMessage(payload);
      if (ok) onCancelReply?.();
    } catch {
      WhatsAppToast.networkError("Não foi possível enviar a mídia. Tente novamente.");
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    if (sendInFlightRef.current) return;
    try {
      const started = await startRecording();
      if (!started)
        WhatsAppToast.networkError(
          "Não foi possível acessar o microfone. Confira a permissão do navegador.",
        );
    } catch {
      WhatsAppToast.networkError("Falha ao iniciar gravação de áudio.");
    }
  };

  const handleAudioSend = async () => {
    if (sendInFlightRef.current || audioStopInFlightRef.current) return;
    audioStopInFlightRef.current = true;
    try {
      const res = await stopRecording();
      if (!res) return;

      const quotedPayload = replyingTo
        ? {
            quotedMessageId: replyingTo.externalId || undefined,
            quotedMessage: {
              senderName: replyingTo.senderName || null,
              senderPhone: replyingTo.senderPhone || null,
              text: replyingTo.text || "Mensagem",
              type: replyingTo.type,
            },
          }
        : {};
      const extension = res.blob.type.includes("ogg")
        ? "ogg"
        : res.blob.type.includes("mp4")
          ? "m4a"
          : "webm";
      await sendMedia({
        media: URL.createObjectURL(res.blob),
        mediaFile: res.blob,
        fileName: `audio-${Date.now()}.${extension}`,
        mimetype: res.blob.type || "audio/webm",
        duration: res.durationSec,
        type: "audio",
        ...quotedPayload,
      });
    } catch {
      WhatsAppToast.networkError("Não foi possível finalizar a gravação.");
    } finally {
      audioStopInFlightRef.current = false;
    }
  };

  const handleFileUpload = async (
    file: File,
    type: "image" | "video" | "audio" | "document" | "sticker",
  ) => {
    setIsAttachOpen(false);
    if (!file || sendInFlightRef.current) return;
    if (file.size === 0) {
      WhatsAppToast.networkError("Este arquivo está vazio. Escolha outro arquivo.");
      return;
    }
    // Preserva o limite anterior de 45 MB; backend precisa validar novamente.
    if (file.size > 45 * 1024 * 1024) {
      WhatsAppToast.fileTooLarge(45);
      return;
    }
    const quotedPayload = replyingTo
      ? {
          quotedMessageId: replyingTo.externalId || undefined,
          quotedMessage: {
            senderName: replyingTo.senderName || null,
            senderPhone: replyingTo.senderPhone || null,
            text: replyingTo.text || "Mensagem",
            type: replyingTo.type,
          },
        }
      : {};

    await sendMedia({
      media: URL.createObjectURL(file),
      mediaFile: file,
      fileName: file.name,
      mimetype: file.type || "application/octet-stream",
      type,
      ...quotedPayload,
    });
  };

  const mediaTypeForFile = (file: File): "image" | "video" | "audio" | "document" => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  return (
    <div className="message-composer flex flex-col shrink-0" aria-busy={isSending}>
      {/* Barra Flutuante de Resposta / Citação (Quote Bar) */}
      {replyingTo &&
        (() => {
          const cleanReplyingSender = sanitizeSenderName(
            replyingTo.senderName,
            replyingTo.senderPhone,
          );
          return (
            <div
              className={`px-4 py-2 border-t flex items-center justify-between text-xs select-none transition-all animate-smooth-in ${
                isDarkMode ? "bg-[#14141a] border-[#22222d]" : "bg-neutral-100 border-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 pl-2 border-l-2 border-zinc-500">
                <ArrowBendUpLeft size={15} className="text-zinc-400 shrink-0" weight="bold" />
                <div className="min-w-0">
                  <span
                    className={`font-semibold text-[12px] block truncate ${isDarkMode ? "text-zinc-200" : "text-neutral-800"}`}
                  >
                    Respondendo a ~ {cleanReplyingSender || "Você"}
                  </span>
                  <span className="text-neutral-400 text-[11px] block truncate">
                    {replyingTo.text ||
                      (replyingTo.type === "image"
                        ? "Foto"
                        : replyingTo.type === "audio"
                          ? "Áudio"
                          : replyingTo.type === "sticker"
                            ? "Figurinha"
                            : "Mídia")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onCancelReply}
                className={`min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-colors ml-2 shrink-0 ${isDarkMode ? "text-neutral-400 hover:text-white hover:bg-white/10" : "text-neutral-600 hover:text-neutral-950 hover:bg-black/5"}`}
                title="Cancelar resposta"
                aria-label="Cancelar resposta"
              >
                <X size={15} weight="bold" />
              </button>
            </div>
          );
        })()}

      {/* Barra Oficial WhatsApp: Grupo Travado Para Apenas Administradores */}
      {isGroup && canSend === false ? (
        <div
          className={`py-4 px-6 border-t flex items-center justify-center gap-2.5 text-xs select-none transition-colors ${
            isDarkMode
              ? "bg-[#111116] border-[#1e1e26] text-neutral-400"
              : "bg-neutral-100 border-neutral-200 text-neutral-600"
          }`}
        >
          <LockKey size={17} weight="fill" className="text-amber-400 shrink-0" />
          <span className="font-medium">
            Apenas administradores podem enviar mensagens neste grupo.
          </span>
        </div>
      ) : (
        /* Linha Principal de Envio */
        <div
          className={`px-3 py-3 sm:px-4 border-t relative flex items-center gap-2 transition-colors ${
            isDarkMode ? "bg-[#111116] border-[#1e1e26]" : "bg-white border-[#e2e4e9]"
          }`}
        >
          {/* Menu de Anexos Dropdown */}
          {isAttachOpen && (
            <div
              ref={attachMenuRef}
              id="message-attachments-menu"
              role="menu"
              aria-label="Opções de anexos"
              className={`absolute bottom-full mb-3 left-4 p-2 rounded-xl border shadow-2xl z-20 flex flex-col gap-1 w-52 animate-smooth-in ${
                isDarkMode
                  ? "bg-[#181822] border-[#2a2a36] text-white shadow-black/80"
                  : "bg-white border-neutral-200 text-neutral-900"
              }`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-11 px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2.5 transition-colors ${
                  isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                }`}
              >
                <ImageIcon
                  size={18}
                  className={isDarkMode ? "text-zinc-400" : "text-neutral-600"}
                />
                <span>Foto ou Vídeo</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => docInputRef.current?.click()}
                className={`min-h-11 px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2.5 transition-colors ${
                  isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                }`}
              >
                <FileText size={18} className={isDarkMode ? "text-zinc-400" : "text-neutral-600"} />
                <span>Arquivo ou documento</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => stickerInputRef.current?.click()}
                className={`min-h-11 px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2.5 transition-colors ${
                  isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                }`}
              >
                <ImageIcon
                  size={18}
                  className={isDarkMode ? "text-zinc-400" : "text-neutral-600"}
                />
                <span>Figurinha</span>
              </button>
            </div>
          )}

          {/* Inputs Ocultos de Arquivo */}
          <input
            ref={fileInputRef}
            type="file"
            disabled={isSending}
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const isVid = file.type.startsWith("video/");
                handleFileUpload(file, isVid ? "video" : "image");
              }
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={docInputRef}
            type="file"
            disabled={isSending}
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, mediaTypeForFile(file));
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={stickerInputRef}
            type="file"
            disabled={isSending}
            accept=".webp,.png,.gif,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, "sticker");
              e.currentTarget.value = "";
            }}
          />

          {isRecording ? (
            <AudioRecorderBar
              recordingTimer={recordingTimer}
              onCancel={cancelRecording}
              onSend={handleAudioSend}
              isDarkMode={isDarkMode}
            />
          ) : (
            <form onSubmit={handleSendText} className="flex-1 flex items-center gap-2.5">
              {/* Botão de Anexo */}
              <button
                type="button"
                ref={attachTriggerRef}
                onClick={() => setIsAttachOpen(!isAttachOpen)}
                disabled={isSending}
                className={`min-h-11 min-w-11 p-2.5 rounded-full transition-colors ${
                  isAttachOpen
                    ? isDarkMode
                      ? "bg-white/[0.07] text-white"
                      : "bg-black/[0.05] text-neutral-900"
                    : isDarkMode
                      ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                }`}
                title="Anexar qualquer arquivo ou documento"
                aria-label="Anexar qualquer arquivo ou documento"
                aria-expanded={isAttachOpen}
                aria-controls="message-attachments-menu"
              >
                <Paperclip size={19} weight="bold" />
              </button>

              {/* D1: Sugestões automáticas de follow-up baseadas em contexto */}
              {!isRecording && !replyingTo && text.length === 0 && followUpSuggestions.length > 0 && (
                <div className="absolute bottom-full left-3 right-3 mb-2 flex flex-wrap gap-1.5 animate-smooth-in">
                  {followUpSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setText(suggestion)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all border ${
                        isDarkMode
                          ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20"
                          : "bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100"
                      }`}
                    >
                      <Lightbulb size={12} weight="fill" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* Campo de Texto Multilinha Estilo WhatsApp Web */}
              <textarea
                ref={inputRef}
                rows={1}
                aria-label="Escrever mensagem"
                placeholder={
                  replyingTo
                    ? `Respondendo a ${sanitizeSenderName(replyingTo.senderName, replyingTo.senderPhone)}...`
                    : "Digite uma mensagem..."
                }
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className={`flex-1 min-h-11 px-4 py-2.5 rounded-2xl text-xs resize-none transition-colors border focus:outline-none max-h-28 overflow-y-auto ${
                  isDarkMode
                    ? "bg-white/[0.045] border-white/[0.075] text-white placeholder-neutral-600 focus:border-white/[0.16]"
                    : "bg-neutral-50 border-neutral-200 text-neutral-950 placeholder-neutral-400 focus:border-neutral-400"
                }`}
              />

              <span className="sr-only" role="status" aria-live="polite">
                {isSending ? "Enviando mensagem..." : ""}
              </span>

              {/* Botão de Gravar Áudio ou Enviar Texto */}
              {text.trim() ? (
                <button
                  type="submit"
                  disabled={isSending}
                  className="min-h-11 min-w-11 rounded-full bg-white p-2.5 text-black transition-colors hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
                  title="Enviar mensagem"
                  aria-label="Enviar mensagem"
                >
                  <PaperPlaneRight size={19} weight="fill" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartRecording()}
                  disabled={isSending}
                  className={`min-h-11 min-w-11 p-2.5 rounded-full transition-colors ${
                    isDarkMode
                      ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                  }`}
                  title="Gravar mensagem de voz"
                  aria-label="Gravar mensagem de voz"
                >
                  <Microphone size={19} weight="bold" />
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
