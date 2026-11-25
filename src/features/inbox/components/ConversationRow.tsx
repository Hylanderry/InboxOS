import { useEffect, useState } from "react";
import { PushPin, Microphone, Users, User, WarningCircle } from "@phosphor-icons/react";
import type { Conversation } from "../types";
import { MediaTypeIcon } from "./MediaTypeIcon";
import { usePresenceState } from "../hooks/usePresence";
import { sanitizeChatName, sanitizeMessagePreview } from "@/lib/emoji";
import { formatPhoneLabel } from "../mappers/chatMapper";

interface ConversationRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isDarkMode?: boolean;
}

export function ConversationRow({
  conversation,
  isSelected,
  onSelect,
  isDarkMode = true,
}: ConversationRowProps) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [conversation.avatar]);
  const presence = usePresenceState(
    conversation.phone,
    conversation.instanceName,
    conversation.instanceId,
  );
  const typing = presence === "composing";
  const recording = presence === "recording";

  const formattedPhone = formatPhoneLabel(conversation.phone);
  const cleanName = sanitizeChatName(conversation.name, conversation.isGroup, formattedPhone);
  const cleanMessage = sanitizeMessagePreview(
    conversation.lastMessage,
    conversation.lastMessageType,
  );

  const isPhoneName = Boolean(cleanName && /^[+\d\s()-]+$/.test(cleanName.trim()));

  const words = String(cleanName || "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const initials = isPhoneName
    ? ""
    : words.length === 1
      ? words[0]!.length <= 3
        ? words[0]!.toUpperCase()
        : words[0]![0]!.toUpperCase()
      : words
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={isSelected ? "true" : undefined}
      className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none text-left transition-colors duration-150 border-b relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500 ${
        isDarkMode ? "border-white/[0.045]" : "border-neutral-100"
      } ${
        isSelected
          ? isDarkMode
            ? "bg-white/[0.07] border-l-2 border-l-[#00a884]"
            : "bg-black/[0.035] border-l-2 border-l-[#00a884]"
          : isDarkMode
            ? "hover:bg-[#14141a]"
            : "hover:bg-neutral-50"
      }`}
    >
      {/* Avatar do Contato ou Grupo com Foto Real ou Fallback Elegante */}
      <div className="relative w-11 h-11 rounded-full shrink-0 border border-neutral-700/30 overflow-hidden shadow-sm">
        {conversation.avatar && !imgFailed ? (
          <img
            src={conversation.avatar}
            alt={cleanName}
            className="w-full h-full object-cover"
            onError={() => {
              setImgFailed(true);
              window.dispatchEvent(
                new CustomEvent("inboxos:avatar-error", {
                  detail: { phone: conversation.phone, instanceName: conversation.instanceName },
                }),
              );
            }}
          />
        ) : conversation.isGroup ? (
          <div
            className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${isDarkMode ? "bg-zinc-800 text-[var(--whatsapp)]" : "bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)] text-[var(--whatsapp)]"}`}
          >
            <Users size={22} weight="bold" />
          </div>
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${isDarkMode ? "bg-zinc-800 text-[var(--whatsapp)]" : "bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)] text-[var(--whatsapp)]"}`}
          >
            {initials || <User size={20} weight="bold" />}
          </div>
        )}
      </div>

      {/* Conteúdo Principal da Linha */}
      <div className="flex-1 min-w-0">
        {/* Linha Superior: Nome + Badges + Horário */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {conversation.pinned && (
              <span title="Conversa Fixada" className="shrink-0 flex items-center">
                <PushPin size={12} weight="fill" className="text-amber-400" />
              </span>
            )}

            <h4
              title={cleanName}
              className={`text-xs font-bold tracking-tight truncate ${
                isDarkMode ? (isSelected ? "text-white" : "text-neutral-200") : "text-neutral-950"
              }`}
            >
              {cleanName}
            </h4>

            {conversation.instanceName && (
              <span
                title={`Conta WhatsApp: ${conversation.instanceName}`}
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 max-w-[80px] truncate border ${
                  isDarkMode
                    ? "bg-[color-mix(in_srgb,var(--whatsapp)_10%,transparent)] text-[var(--whatsapp)] border-[color-mix(in_srgb,var(--whatsapp)_20%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)] text-[var(--whatsapp)] border-[color-mix(in_srgb,var(--whatsapp)_20%,transparent)]"
                }`}
              >
                {conversation.instanceName}
              </span>
            )}
          </div>

          {/* Horário: sempre visível, verde quando há mensagens não lidas */}
          <span
            className={`text-[11px] font-medium shrink-0 ml-1 ${
              conversation.unread > 0
                ? isDarkMode
                  ? "text-[#00a884] font-semibold"
                  : "text-[var(--whatsapp)] font-semibold"
                : isDarkMode
                  ? "text-neutral-400"
                  : "text-neutral-500"
            }`}
          >
            {conversation.time}
          </span>
        </div>

        {/* Linha Inferior: Última Mensagem + Badge de Não Lidas */}
        <div className="flex items-center justify-between gap-2">
          <div
            className={`flex items-center gap-1.5 min-w-0 flex-1 text-xs ${
              conversation.unread > 0
                ? isDarkMode
                  ? "text-neutral-100 font-medium"
                  : "text-neutral-900 font-medium"
                : isDarkMode
                  ? "text-neutral-400"
                  : "text-neutral-500"
            }`}
          >
            {typing ? (
              <span className="truncate text-[#00a884] font-semibold animate-pulse">
                digitando...
              </span>
            ) : recording ? (
              <span className="truncate text-[#00a884] font-semibold flex items-center gap-1 animate-pulse">
                <Microphone size={13} weight="fill" /> gravando áudio...
              </span>
            ) : (
              <>
                {conversation.lastMessageType !== "text" &&
                  conversation.lastMessageType !== "deleted" && (
                    <MediaTypeIcon
                      type={conversation.lastMessageType}
                      size={14}
                      className="media-type-icon shrink-0"
                    />
                  )}
                <span title={cleanMessage} className="truncate">
                  {cleanMessage}
                </span>
              </>
            )}
          </div>

          {/* Badge de Mensagens Não Lidas (Estilo WhatsApp) */}
          {(conversation.unread > 0 || conversation.humanHandoff) && (
            <span
              title={
                conversation.humanHandoff
                  ? conversation.handoverSla === "overdue"
                    ? "Atendimento humano atrasado há mais de 15 minutos"
                    : conversation.handoverSla === "attention"
                      ? "Atendimento humano aguardando resposta há mais de 5 minutos"
                      : "Atendimento humano aguardando resposta"
                  : `${conversation.unread} mensagem(ns) não lida(s)`
              }
              className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold flex items-center gap-1 justify-center shrink-0 animate-scale-in ${
                conversation.humanHandoff
                  ? conversation.handoverSla === "overdue"
                    ? "bg-red-500 text-white"
                    : conversation.handoverSla === "attention"
                      ? "bg-amber-400 text-amber-950"
                      : "bg-amber-300 text-amber-950"
                  : isDarkMode
                    ? "bg-[#00a884] text-[#06251d]"
                    : "bg-[var(--whatsapp)] text-white"
              }`}
            >
              {conversation.humanHandoff && <WarningCircle size={11} weight="fill" />}
              {conversation.unread > 99 ? "99+" : conversation.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
