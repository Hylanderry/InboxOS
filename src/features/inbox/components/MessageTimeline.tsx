import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowsClockwise,
  ChatCircleText,
  Microphone,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { usePresence } from "../hooks/usePresence";
import { stripEmojis } from "@/lib/emoji";

interface MessageTimelineProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasMore: boolean;
  onLoadPrevious: () => void;
  onPreviewMedia: (media: {
    type: "image" | "video" | "document";
    url: string;
    name?: string | null | undefined;
  }) => void;
  onReply?: (message: ChatMessage) => void;
  onReact?: (message: ChatMessage, emoji: string) => void;
  isDarkMode?: boolean | undefined;
  isGroup?: boolean | undefined;
  activePhone?: string | null | undefined;
  activeInstanceName?: string | null | undefined;
  activeInstanceId?: string | null | undefined;
  activeAvatar?: string | null | undefined;
  activeName?: string | null | undefined;
}

function getDayKey(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } catch {
    return "";
  }
}

function formatTimelineDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isToday) return "HOJE";
    if (isYesterday) return "ONTEM";

    return date
      .toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      })
      .toUpperCase();
  } catch {
    return "";
  }
}

export function MessageTimeline({
  messages,
  isLoading,
  error = null,
  onRetry,
  hasMore,
  onLoadPrevious,
  onPreviewMedia,
  onReply,
  onReact,
  isDarkMode = true,
  isGroup = false,
  activePhone,
  activeInstanceName,
  activeInstanceId,
  activeAvatar,
  activeName,
}: MessageTimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isLoadingPreviousRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const { isTyping, isRecording } = usePresence();
  const typing = isTyping(activePhone, activeInstanceName, activeInstanceId);
  const recording = isRecording(activePhone, activeInstanceName, activeInstanceId);

  const handleLoadPrevious = () => {
    if (containerRef.current) {
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
      isLoadingPreviousRef.current = true;
    }
    onLoadPrevious();
  };

  // Restaura posição relativa de rolagem ao carregar mensagens anteriores no topo
  useEffect(() => {
    if (isLoadingPreviousRef.current && containerRef.current) {
      const newHeight = containerRef.current.scrollHeight;
      const heightDiff = newHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        containerRef.current.scrollTop += heightDiff;
      }
      isLoadingPreviousRef.current = false;
    }
  }, [messages]);

  // Acompanha novas mensagens somente quando o operador já está no rodapé.
  // Se estiver lendo o histórico, preserva a posição e exibe o botão de retorno.
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?.id || null;
    const isNewAtBottom = lastMsgId !== null && lastMsgId !== prevLastMsgIdRef.current;
    const isInitialChatLoad = prevLastMsgIdRef.current === null && messages.length > 0;

    if (isInitialChatLoad || (isNewAtBottom && isNearBottomRef.current)) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialChatLoad ? "auto" : "smooth" });
    }

    prevLastMsgIdRef.current = lastMsgId;
  }, [messages]);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <div
      ref={containerRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        isNearBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 140;
        setShowScrollToBottom(!isNearBottomRef.current && messages.length > 0);
      }}
      className={`flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 space-y-1.5 smooth-scroll relative ${
        isDarkMode ? "bg-[#0a0a0b]" : "bg-[#f2f2ef]"
      }`}
    >
      <div className="mx-auto w-full max-w-[1080px]">
        {error && (
          <div role="alert" className="inbox-feedback inbox-feedback-error mx-auto mb-3 max-w-xl">
            <WarningCircle size={17} weight="duotone" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="inbox-feedback-title">Mensagens indisponíveis</p>
              <p className="inbox-feedback-description">
                Não foi possível atualizar esta conversa. Verifique a conexão e tente novamente.
              </p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isLoading}
                className="min-h-10 rounded-lg border border-current/25 px-3 font-semibold hover:bg-current/10 disabled:opacity-50"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {/* Botão de carregar mensagens mais antigas */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={handleLoadPrevious}
              disabled={isLoading}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                isDarkMode
                  ? "bg-[#18181c] border-[#2a2a32] text-neutral-300 hover:text-white hover:border-[#383842]"
                  : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50 shadow-xs"
              }`}
            >
              {isLoading && <ArrowsClockwise size={13} className="animate-spin text-neutral-400" />}
              <span>Carregar mensagens anteriores</span>
            </button>
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center text-neutral-500 animate-smooth-in">
            <ArrowsClockwise size={32} className="animate-spin text-neutral-400 mb-3 opacity-80" />
            <p className="text-xs font-semibold text-neutral-400">Carregando conversa...</p>
          </div>
        ) : !error && messages.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center text-neutral-500 animate-smooth-in">
            <ChatCircleText size={44} className="mb-2.5 opacity-30" />
            <p className="text-sm font-medium">Nenhuma mensagem nesta conversa ainda</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Envie uma mensagem abaixo para iniciar o contato.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const currentDay = getDayKey(msg.createdAt);
            const prevDay = prevMsg ? getDayKey(prevMsg.createdAt) : null;
            const showDateSeparator = Boolean(currentDay && currentDay !== prevDay);

            // Agrupa mensagens consecutivas do mesmo remetente no mesmo dia
            const isConsecutive = Boolean(
              !showDateSeparator &&
              prevMsg &&
              prevMsg.sender === msg.sender &&
              (msg.sender === "agent" ||
                (msg.senderPhone && prevMsg.senderPhone === msg.senderPhone) ||
                (msg.senderName && prevMsg.senderName === msg.senderName)),
            );

            return (
              <div key={msg.id} className="contents">
                {showDateSeparator && (
                  <div className="flex justify-center my-4 select-none">
                    <span
                      className={`px-3 py-1 rounded-lg text-[10.5px] font-bold tracking-wider shadow-xs uppercase ${
                        isDarkMode
                          ? "bg-[#182229] text-[#8696a0] border border-[#26353d]/50"
                          : "bg-white text-neutral-600 border border-neutral-200/80 shadow-xs"
                      }`}
                    >
                      {formatTimelineDate(msg.createdAt)}
                    </span>
                  </div>
                )}

                <MessageBubble
                  message={msg}
                  onPreviewMedia={onPreviewMedia}
                  onReply={onReply}
                  onReact={onReact}
                  isDarkMode={isDarkMode}
                  isGroup={isGroup}
                  isConsecutive={isConsecutive}
                  activeInstanceName={activeInstanceName}
                />
              </div>
            );
          })
        )}

        {/* Indicador de Digitação / Gravação de Áudio Flutuante (Estilo WhatsApp Web) */}
        {(typing || recording) && (
          <div className="flex items-end gap-2.5 my-2 animate-smooth-in">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#17171a] flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
              {activeAvatar ? (
                <img src={activeAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-[#24b47e]">
                  {(stripEmojis(activeName) || "?")
                    .replace(/[^\p{L}\p{N}]/gu, "")
                    .slice(0, 1)
                    .toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div
              className={`px-4 py-3 rounded-2xl rounded-bl-xs flex items-center gap-1.5 border shadow-sm ${
                isDarkMode
                  ? "bg-[#111113] border-white/[0.065] text-[#24b47e]"
                  : "bg-white border-black/[0.07] text-[#1f9d6a]"
              }`}
            >
              {recording ? (
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Microphone size={14} weight="fill" className="animate-pulse text-[#24b47e]" />
                  <span className="animate-pulse">gravando áudio...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 py-0.5">
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
      {showScrollToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Ir para as mensagens mais recentes"
          className={`absolute bottom-4 right-5 z-10 inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold shadow-lg transition-all hover:-translate-y-0.5 ${
            isDarkMode
              ? "border-white/10 bg-[#1b1b20] text-white hover:bg-[#24242b]"
              : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          <ArrowDown size={15} weight="bold" aria-hidden="true" />
          <span>Ir para as mensagens mais recentes</span>
        </button>
      )}
    </div>
  );
}
