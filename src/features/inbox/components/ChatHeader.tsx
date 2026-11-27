import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  PushPin,
  Archive,
  DotsThreeVertical,
  CheckCircle,
  WhatsappLogo,
  Info,
  Microphone,
  DownloadSimple,
  LockKey,
  User,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Conversation } from "../types";
import { formatPhoneLabel } from "../mappers/chatMapper";
import { usePresence } from "../hooks/usePresence";
import { sanitizeChatName } from "@/lib/emoji";
import { BusinessProfileModal } from "./BusinessProfileModal";

interface ChatHeaderProps {
  conversation: Conversation;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onOpenExport?: () => void;
  onBack?: () => void;
  isDarkMode?: boolean;
  layout?: "desktop" | "mobile";
  onCreateLead?: () => void | Promise<void>;
  onToggleAi?: (paused: boolean) => void | Promise<void>;
  onHandoverAction?: (action: "accept" | "resolve" | "cancel") => void | Promise<void>;
}

export function ChatHeader({
  conversation,
  onTogglePin,
  onToggleArchive,
  onOpenExport,
  onBack,
  isDarkMode = true,
  layout = "desktop",
  onCreateLead,
  onToggleAi,
  onHandoverAction,
}: ChatHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Estado de erro de imagem precisa acompanhar mudanças de foto no mesmo chat.
  useEffect(() => setImgFailed(false), [conversation.avatar]);
  // Focus trap + navegação por setas no menu dropdown (B6 — Sprint 1).
  // Tab/Shift+Tab circulam entre os itens; ArrowUp/ArrowDown movem foco;
  // Escape fecha e retorna foco ao trigger; clique fora fecha.
  useEffect(() => {
    if (!isMenuOpen) return;
    const menuItems =
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']");
    menuItems?.[0]?.focus();

    const dismissOutside = (event: PointerEvent) => {
      if (
        menuRef.current?.contains(event.target as Node) ||
        menuTriggerRef.current?.contains(event.target as Node)
      )
        return;
      setIsMenuOpen(false);
    };

    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsMenuOpen(false);
      menuTriggerRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!menuItems || menuItems.length === 0) return;
      const items = Array.from(menuItems);
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex]?.focus();
      } else if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prevIndex]?.focus();
        } else {
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[nextIndex]?.focus();
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    menuRef.current?.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
      menuRef.current?.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const { isTyping, isRecording } = usePresence();
  const typing = isTyping(conversation.phone, conversation.instanceName, conversation.instanceId);
  const recording = isRecording(
    conversation.phone,
    conversation.instanceName,
    conversation.instanceId,
  );

  const cleanName = sanitizeChatName(conversation.name, conversation.isGroup, conversation.phone);

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
    <>
      <div
        className={`${layout === "mobile" ? "min-h-14 px-3" : "h-[60px] px-5"} border-b flex items-center justify-between shrink-0 transition-colors z-10 ${
          isDarkMode
            ? "bg-[#111115]/95 backdrop-blur-md border-[#1e1e26] text-white"
            : "bg-white border-[#e2e4e9] text-neutral-900 shadow-xs"
        }`}
      >
        {/* Informações do Contato / Grupo */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={`${layout === "mobile" ? "flex" : "hidden"} rounded-lg p-2 text-slate-500 hover:bg-slate-100`}
              title="Voltar para conversas"
              aria-label="Voltar para conversas"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none group text-left"
            title="Clique para ver detalhes do contato / perfil comercial"
          >
            {/* Foto de perfil real ou avatar elegante */}
            <div className="relative w-10 h-10 rounded-full shrink-0 border border-neutral-700/30 overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
              {conversation.avatar && !imgFailed ? (
                <img
                  src={conversation.avatar}
                  alt={cleanName}
                  className="w-full h-full object-cover"
                  onError={() => {
                    setImgFailed(true);
                    window.dispatchEvent(
                      new CustomEvent("inboxos:avatar-error", {
                        detail: {
                          phone: conversation.phone,
                          instanceName: conversation.instanceName,
                        },
                      }),
                    );
                  }}
                />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${isDarkMode ? "bg-zinc-800 text-[var(--whatsapp)]" : "bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)] text-[var(--whatsapp)]"}`}
                >
                  {initials || <User size={20} weight="bold" />}
                </div>
              )}
              {/* Indicador WhatsApp */}
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00a884] ring-2 ring-[#111115]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3
                  title={cleanName}
                  className={`text-sm font-bold tracking-tight truncate group-hover:text-zinc-300 transition-colors ${
                    isDarkMode ? "text-white" : "text-neutral-950"
                  }`}
                >
                  {cleanName}
                </h3>

                {conversation.pinned && (
                  <span title="Fixada" className="shrink-0 flex items-center">
                    <PushPin size={13} weight="fill" className="text-amber-400" />
                  </span>
                )}

                {conversation.archived && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/[0.055] text-zinc-400 border border-white/[0.07]">
                    Arquivada
                  </span>
                )}

                {conversation.humanHandoff && (
                  <span
                    title="Aguardando atendimento humano"
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                      conversation.handoverSla === "overdue"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : conversation.handoverSla === "attention"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-amber-400/25 bg-amber-400/10 text-amber-300"
                    }`}
                  >
                    <WarningCircle size={11} weight="fill" />
                    Humano
                  </span>
                )}

                {conversation.isGroup &&
                  (conversation.isAnnouncement || conversation.canSend === false) && (
                    <span
                      title="Apenas administradores podem enviar mensagens neste grupo"
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center gap-1 shrink-0"
                    >
                      <LockKey size={11} weight="fill" />
                      Apenas Admins
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-2 text-[11px] truncate mt-0.5">
                {typing ? (
                  <span className="text-[#00a884] font-semibold animate-pulse">digitando...</span>
                ) : recording ? (
                  <span className="text-[#00a884] font-semibold flex items-center gap-1 animate-pulse">
                    <Microphone size={12} weight="fill" /> gravando áudio...
                  </span>
                ) : (
                  <>
                    <span className={isDarkMode ? "text-neutral-400" : "text-neutral-500"}>
                      {formatPhoneLabel(conversation.phone)}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    <span className="flex items-center gap-1 text-[#00a884] font-medium">
                      <WhatsappLogo size={12} weight="fill" />
                      {conversation.instanceName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Ações Rápidas da Conversa */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!conversation.isGroup && !conversation.leadId && onCreateLead && (
            <button
              type="button"
              onClick={() => void onCreateLead()}
              className={`chat-header-action inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                isDarkMode
                  ? "text-[var(--whatsapp)] hover:bg-[color-mix(in_srgb,var(--whatsapp)_10%,transparent)]"
                  : "text-[var(--whatsapp)] hover:bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)]"
              }`}
              title="Registrar cliente no CRM"
              aria-label="Registrar cliente no CRM"
            >
              <UserPlus size={17} weight="bold" />
              <span className="hidden xl:inline">CRM</span>
            </button>
          )}
          {onToggleAi && (
            <button
              type="button"
              onClick={() => void onToggleAi(!conversation.aiPaused)}
              className={`hidden md:inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                conversation.aiPaused
                  ? isDarkMode
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : isDarkMode
                    ? "border-[color-mix(in_srgb,var(--whatsapp)_30%,transparent)] bg-[color-mix(in_srgb,var(--whatsapp)_10%,transparent)] text-[var(--whatsapp)] hover:bg-[color-mix(in_srgb,var(--whatsapp)_15%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--whatsapp)_30%,transparent)] bg-[color-mix(in_srgb,var(--whatsapp)_8%,transparent)] text-[var(--whatsapp)] hover:bg-[color-mix(in_srgb,var(--whatsapp)_12%,transparent)]"
              }`}
              title={
                conversation.aiPaused ? "Retomar IA nesta conversa" : "Pausar IA nesta conversa"
              }
              aria-label={
                conversation.aiPaused ? "Retomar IA nesta conversa" : "Pausar IA nesta conversa"
              }
              aria-pressed={conversation.aiPaused}
            >
              {conversation.aiPaused ? "IA pausada" : "IA ativa"}
            </button>
          )}
          {/* Perfil Comercial / Detalhes */}
          <button
            type="button"
            onClick={() => setIsProfileOpen(true)}
            className={`chat-header-action p-2 rounded-lg transition-colors ${
              isDarkMode
                ? "text-neutral-500 hover:text-white hover:bg-white/[0.05]"
                : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
            }`}
            title="Ver perfil comercial e dados do contato"
            aria-label="Ver perfil comercial e dados do contato"
          >
            <Info size={17} weight="bold" />
          </button>
          {/* Fixar conversa */}
          <button
            type="button"
            onClick={onTogglePin}
            className={`chat-header-action p-2 rounded-lg transition-colors ${
              conversation.pinned
                ? "text-amber-400 bg-amber-400/10"
                : isDarkMode
                  ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                  : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
            title={conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}
            aria-label={conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}
            aria-pressed={conversation.pinned}
          >
            <PushPin size={17} weight={conversation.pinned ? "fill" : "regular"} />
          </button>

          {/* Arquivar conversa */}
          <button
            type="button"
            onClick={onToggleArchive}
            className={`chat-header-action p-2 rounded-lg transition-colors ${
              conversation.archived
                ? isDarkMode
                  ? "text-zinc-200 bg-white/[0.06]"
                  : "text-neutral-800 bg-black/[0.04]"
                : isDarkMode
                  ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                  : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
            }`}
            title={conversation.archived ? "Desarquivar conversa" : "Arquivar conversa"}
            aria-label={conversation.archived ? "Desarquivar conversa" : "Arquivar conversa"}
            aria-pressed={conversation.archived}
          >
            <Archive size={17} weight={conversation.archived ? "fill" : "regular"} />
          </button>

          {/* Menu Dropdown de Mais Opções */}
          <div className="relative">
            <button
              type="button"
              ref={menuTriggerRef}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-controls="chat-header-action-panel"
              aria-haspopup="true"
              className={`chat-header-action p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                  : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
              }`}
              title="Mais opções"
              aria-label="Mais opções"
              aria-expanded={isMenuOpen}
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>

            {isMenuOpen && (
              <div
                id="chat-header-action-panel"
                ref={menuRef}
                role="menu"
                aria-label="Ações adicionais da conversa"
                className={`absolute right-0 top-full mt-2 w-48 p-1.5 rounded-2xl border shadow-2xl z-50 animate-smooth-in ${
                  isDarkMode
                    ? "bg-[#181820] border-[#2a2a36] text-white shadow-black/80"
                    : "bg-white border-neutral-200 text-neutral-900"
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onTogglePin();
                    setIsMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-2.5 transition-colors ${
                    isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                  }`}
                >
                  <PushPin size={15} />
                  <span>{conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-2.5 transition-colors ${
                    isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                  }`}
                >
                  <Info size={15} />
                  <span>Dados do contato</span>
                </button>

                {onOpenExport && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenExport();
                      setIsMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-2.5 transition-colors ${
                      isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                    }`}
                  >
                    <DownloadSimple size={15} />
                    <span>Exportar conversa</span>
                  </button>
                )}

                {onToggleAi && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void onToggleAi(!conversation.aiPaused);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-2.5 transition-colors ${
                      isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                    }`}
                  >
                    <CheckCircle size={15} />
                    <span>{conversation.aiPaused ? "Retomar IA" : "Pausar IA"}</span>
                  </button>
                )}

                {conversation.humanHandoff && onHandoverAction && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void onHandoverAction(
                        conversation.handoverStatus === "in_progress" ? "resolve" : "accept",
                      );
                      setIsMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-2.5 transition-colors ${
                      isDarkMode ? "hover:bg-[#22222e]" : "hover:bg-neutral-100"
                    }`}
                  >
                    <WarningCircle size={15} />
                    <span>
                      {conversation.handoverStatus === "in_progress"
                        ? "Encerrar atendimento"
                        : "Assumir atendimento"}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isProfileOpen && (
        <BusinessProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          chatId={conversation.id}
          contactName={conversation.name}
          contactPhone={conversation.phone}
          contactAvatar={conversation.avatar}
          isDarkMode={isDarkMode}
        />
      )}
    </>
  );
}
