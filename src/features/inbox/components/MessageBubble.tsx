import { useEffect, useState } from "react";
import {
  Checks,
  Check,
  Clock,
  WarningCircle,
  FileText,
  Image as ImageIcon,
  Eye,
  DownloadSimple,
  ArrowBendUpLeft,
  Prohibit,
  Heart,
  ThumbsUp,
  Smiley,
  SmileyMeh,
  SmileySad,
  HandsPraying,
  Fire,
  HandsClapping,
  CheckCircle,
  Sparkle,
  PlusCircle,
  User,
} from "@phosphor-icons/react";
import type { ChatMessage } from "../types";
import { AudioPlayer } from "@/features/media/components/AudioPlayer";
import { sanitizeSenderName } from "@/lib/emoji";
import { MediaFallbackIcon } from "./MediaTypeIcon";

interface MessageBubbleProps {
  message: ChatMessage;
  onPreviewMedia: (media: {
    type: "image" | "video" | "document";
    url: string;
    name?: string | null | undefined;
  }) => void;
  onReply?: ((message: ChatMessage) => void) | undefined;
  onReact?: ((message: ChatMessage, emoji: string) => void) | undefined;
  isDarkMode?: boolean | undefined;
  isGroup?: boolean | undefined;
  isConsecutive?: boolean | undefined;
  activeInstanceName?: string | null | undefined;
}

const PARTICIPANT_COLORS = [
  "#06cf9c", // teal / emerald
  "#53bdeb", // sky blue
  "#a683f2", // purple
  "#f37373", // coral / red
  "#f59f00", // amber / orange
  "#ec4899", // pink
  "#3b82f6", // blue
  "#10b981", // green
  "#8b5cf6", // violet
];

function getParticipantColor(identifier?: string | null): string {
  if (!identifier) return "#06cf9c";
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PARTICIPANT_COLORS.length;
  return PARTICIPANT_COLORS[index] ?? "#06cf9c";
}

function formatPhoneNumber(phone?: string | null): string {
  if (typeof phone !== "string" || !phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : "";
}

interface SenderDisplayInfo {
  primary: string;
  secondary?: string | null;
  initials: string;
}

function getInitials(name?: string | null): string {
  if (!name) return "";
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!clean || /^\d+$/.test(clean)) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function resolveSenderDisplay(
  senderName?: string | null,
  senderPhone?: string | null,
): SenderDisplayInfo {
  const formattedPhone = formatPhoneNumber(senderPhone);
  const cleanName = sanitizeSenderName(senderName);

  // Se o cleanName for apenas o próprio telefone repetido, descarta
  const isPhoneAsName = Boolean(
    cleanName &&
    (cleanName === formattedPhone ||
      cleanName.replace(/\D/g, "") === (senderPhone || "").replace(/\D/g, "")),
  );
  const rawEffectiveName = isPhoneAsName ? "" : cleanName || "";
  // Remove til inicial caso exista no pushName para usar como nome limpo
  const effectiveName = rawEffectiveName.replace(/^~\s*/, "").trim();

  if (effectiveName && formattedPhone) {
    // Contato identificado: Nome é primário em destaque; telefone é secundário
    return {
      primary: effectiveName,
      secondary: formattedPhone,
      initials: getInitials(effectiveName),
    };
  }

  if (effectiveName && !formattedPhone) {
    return {
      primary: effectiveName,
      secondary: null,
      initials: getInitials(effectiveName),
    };
  }

  if (formattedPhone) {
    // Sem nome conhecido: exibe telefone como primário e initials vazias para cair no ícone de User
    return {
      primary: formattedPhone,
      secondary: null,
      initials: "",
    };
  }

  const fallback = senderPhone ? `+${senderPhone.replace(/\D/g, "")}` : "";
  return {
    primary: fallback || "",
    secondary: null,
    initials: "",
  };
}

/**
 * Renderiza reações do WhatsApp exclusivamente com ícones SVG Phosphor.
 * Elimina 100% dos emojis Unicode da interface respeitando o padrão visual limpo.
 */
function renderReactionIcon(rawEmoji?: string | null) {
  if (!rawEmoji) return <Sparkle size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (rawEmoji.includes("👍"))
    return <ThumbsUp size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (
    rawEmoji.includes("❤️") ||
    rawEmoji.includes("❤") ||
    rawEmoji.includes("💜") ||
    rawEmoji.includes("💚") ||
    rawEmoji.includes("💖") ||
    rawEmoji.includes("💕") ||
    rawEmoji.includes("💙")
  ) {
    return <Heart size={13} weight="fill" className="text-rose-500 shrink-0" />;
  }
  if (
    rawEmoji.includes("😂") ||
    rawEmoji.includes("🤣") ||
    rawEmoji.includes("😆") ||
    rawEmoji.includes("😹")
  ) {
    return <Smiley size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (rawEmoji.includes("😮") || rawEmoji.includes("😲") || rawEmoji.includes("🤯")) {
    return <SmileyMeh size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (rawEmoji.includes("😢") || rawEmoji.includes("😭") || rawEmoji.includes("🥺")) {
    return <SmileySad size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (rawEmoji.includes("🙏"))
    return <HandsPraying size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (rawEmoji.includes("🔥"))
    return <Fire size={13} weight="fill" className="text-orange-500 shrink-0" />;
  if (rawEmoji.includes("👏"))
    return <HandsClapping size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (rawEmoji.includes("✅") || rawEmoji.includes("✔") || rawEmoji.includes("👌")) {
    return <CheckCircle size={13} weight="fill" className="text-emerald-500 shrink-0" />;
  }
  return <Sparkle size={13} weight="fill" className="text-amber-400 shrink-0" />;
}

function renderReactionIconSafe(rawEmoji?: string | null) {
  const code = typeof rawEmoji === "string" ? rawEmoji.codePointAt(0) : undefined;
  if (code === 0x1f44d)
    return <ThumbsUp size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (code === 0x2764 || (code && code >= 0x1f48b && code <= 0x1f499)) {
    return <Heart size={13} weight="fill" className="text-rose-500 shrink-0" />;
  }
  if (code === 0x1f602 || code === 0x1f923 || code === 0x1f606 || code === 0x1f639) {
    return <Smiley size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (code === 0x1f62e || code === 0x1f632 || code === 0x1f92f) {
    return <SmileyMeh size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (code === 0x1f622 || code === 0x1f62d || code === 0x1f97a) {
    return <SmileySad size={13} weight="fill" className="text-amber-400 shrink-0" />;
  }
  if (code === 0x1f64f)
    return <HandsPraying size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (code === 0x1f525)
    return <Fire size={13} weight="fill" className="text-orange-500 shrink-0" />;
  if (code === 0x1f44f)
    return <HandsClapping size={13} weight="fill" className="text-amber-400 shrink-0" />;
  if (code === 0x2705 || code === 0x2714 || code === 0x1f44c) {
    return <CheckCircle size={13} weight="fill" className="text-emerald-500 shrink-0" />;
  }
  return <Sparkle size={13} weight="fill" className="text-amber-400 shrink-0" />;
}

function ReactionMenu({
  message,
  onReact,
  isDarkMode,
  open,
  onToggle,
  options,
}: {
  message: ChatMessage;
  onReact: (message: ChatMessage, emoji: string) => void;
  isDarkMode: boolean;
  open: boolean;
  onToggle: () => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`p-1.5 rounded-full opacity-70 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-hover/sticker-row:opacity-100 transition-opacity ${
          isDarkMode
            ? "bg-[#202c33] text-neutral-300 hover:text-white hover:bg-[#2a3942]"
            : "bg-white text-neutral-600 hover:text-neutral-900 shadow-xs"
        }`}
        title="Adicionar reação"
        aria-label="Adicionar reação"
        aria-expanded={open}
      >
        <PlusCircle size={14} weight="bold" />
      </button>
      {open && (
        <div
          className={`absolute bottom-full right-0 z-30 mb-2 flex items-center gap-1 rounded-2xl border p-1.5 shadow-xl ${
            isDarkMode ? "border-white/10 bg-[#202c33]" : "border-neutral-200 bg-white"
          }`}
        >
          {options.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggle();
                onReact(message, emoji);
              }}
              className="grid h-8 w-8 place-items-center rounded-xl text-lg transition-transform hover:scale-125 hover:bg-black/10"
              aria-label={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onToggle();
              onReact(message, "");
            }}
            className="grid h-8 w-8 place-items-center rounded-xl text-xs text-neutral-500 hover:bg-black/10"
            aria-label="Remover minha reação"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function ReactionSummary({
  reactions,
  isDarkMode,
}: {
  reactions: NonNullable<ChatMessage["reactions"]>;
  isDarkMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = reactions.slice(0, 4);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`px-2 py-0.5 rounded-full border shadow-sm flex items-center gap-1 text-[11px] select-none transition-colors ${
          isDarkMode
            ? "bg-[#202c33] border-[#2a3942] text-white hover:bg-[#2a3942]"
            : "bg-white border-neutral-200 text-neutral-900 hover:bg-neutral-50"
        }`}
        aria-label={`Ver ${reactions.length} reação${reactions.length === 1 ? "" : "ões"}`}
        aria-expanded={open}
      >
        {visible.map((reaction, index) => (
          <span key={`${reaction.emoji}-${index}`} className="flex items-center">
            {renderReactionIconSafe(reaction.emoji)}
          </span>
        ))}
        {reactions.length > 1 && (
          <span className="text-[10px] text-neutral-400 font-bold ml-0.5">{reactions.length}</span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Reações da mensagem"
          className={`absolute bottom-full left-0 z-40 mb-2 min-w-44 max-w-64 rounded-xl border p-2 shadow-xl ${
            isDarkMode ? "border-white/10 bg-[#202c33] text-white" : "border-neutral-200 bg-white"
          }`}
        >
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Reações
          </p>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {reactions.map((reaction, index) => (
              <div
                key={`${reaction.emoji}-${reaction.senderPhone || "unknown"}-${index}`}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs"
              >
                {renderReactionIconSafe(reaction.emoji)}
                <span className="min-w-0 flex-1 truncate">
                  {reaction.senderPhone ? formatPhoneNumber(reaction.senderPhone) : "Contato"}
                </span>
                {reaction.at && (
                  <time className="text-[10px] text-neutral-500" dateTime={reaction.at}>
                    {new Date(reaction.at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  onPreviewMedia,
  onReply,
  onReact,
  isDarkMode = true,
  isGroup = false,
  isConsecutive = false,
  activeInstanceName,
}: MessageBubbleProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const isMe = message.sender === "agent";
  const isFailed = message.status === "failed";
  const isDeleted = message.type === "deleted" || message.text === "Mensagem apagada";

  // Realtime first delivers the tenant-scoped storage path and the messages
  // reconciliation replaces it with a signed URL. Never keep a previous
  // image/video error state after that URL changes.
  useEffect(() => {
    setMediaFailed(false);
  }, [message.id, message.mediaUrl]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [message.id, message.senderAvatar]);

  const handleAvatarError = () => {
    setAvatarFailed(true);
    const phone = String(message.senderPhone ?? "").replace(/\D/g, "");
    const instanceName = String(activeInstanceName ?? "").trim();
    if (!phone || !instanceName) return;
    window.dispatchEvent(
      new CustomEvent("inboxos:avatar-error", {
        detail: { phone, instanceName },
      }),
    );
  };

  // Higieniza e resolve exibição do remetente sem "Participante" (padrão oficial WhatsApp)
  const senderInfo = resolveSenderDisplay(message.senderName, message.senderPhone);
  const participantColor = getParticipantColor(message.senderPhone || senderInfo.primary);
  const showGroupHeader = !isMe && !isConsecutive && (isGroup || Boolean(senderInfo.primary));

  const isSticker = message.type === "sticker";
  const stickerIsVideo = message.mimetype?.startsWith("video/") === true;
  const hasQuote = Boolean(message.quotedMessage);
  const isGif =
    Boolean(message.isGif) ||
    message.mimetype === "image/gif" ||
    (message.type === "video" && message.fileName?.toLowerCase().includes("gif"));
  const reactionOptions = [
    String.fromCodePoint(0x1f44d),
    String.fromCodePoint(0x2764, 0xfe0f),
    String.fromCodePoint(0x1f602),
    String.fromCodePoint(0x1f62e),
    String.fromCodePoint(0x1f622),
    String.fromCodePoint(0x1f64f),
    String.fromCodePoint(0x1f525),
    String.fromCodePoint(0x1f44f),
  ];

  // =========================================================================
  // 1. FIGURINHAS AVULSAS (SEM CITAÇÃO): Padrão WhatsApp Web
  // Imagem totalmente desobstruída (sem botões por cima), horário e ação na lateral
  // =========================================================================
  if (isSticker && !hasQuote && (message.mediaUrl || message.text)) {
    return (
      <div
        className={`flex group/sticker-row animate-smooth-in ${isMe ? "justify-end" : "justify-start items-start gap-2.5"} ${isConsecutive ? "my-0.5" : "my-1"} relative`}
      >
        {/* Avatar fora da figurinha em grupos */}
        {!isMe &&
          isGroup &&
          (isConsecutive ? (
            <div className="w-8 shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-[#2a3942] flex items-center justify-center text-[12px] font-bold text-neutral-300 select-none shadow-sm border border-white/10 mt-0.5">
              {message.senderAvatar && !avatarFailed ? (
                <img
                  src={message.senderAvatar}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={handleAvatarError}
                />
              ) : (
                <span style={{ color: participantColor }} className="text-[11px] font-bold">
                  {senderInfo.initials || <User size={15} weight="bold" />}
                </span>
              )}
            </div>
          ))}

        <div className="flex flex-col relative max-w-[280px]">
          {/* Nome do remetente em grupos */}
          {showGroupHeader && senderInfo.primary && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium mb-1 ml-1 select-none">
              <span
                className="font-semibold tracking-tight truncate max-w-[200px]"
                style={{ color: participantColor }}
              >
                {senderInfo.primary}
              </span>
              {senderInfo.secondary && (
                <span className="text-[11px] font-normal text-neutral-400 truncate max-w-[140px]">
                  {senderInfo.secondary}
                </span>
              )}
            </div>
          )}

          {/* Figurinha + Ação e Horário ao Lado (Estilo WhatsApp Web Oficial) */}
          <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
            <button
              type="button"
              disabled={!message.mediaUrl || mediaFailed}
              aria-label={stickerIsVideo ? "Ampliar figurinha em vídeo" : "Ampliar figurinha"}
              className="relative shrink-0 overflow-hidden rounded-2xl text-left drop-shadow-md transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60 focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:scale-100"
              onClick={() =>
                message.mediaUrl &&
                !mediaFailed &&
                onPreviewMedia({
                  type: stickerIsVideo ? "video" : "image",
                  url: message.mediaUrl,
                  name: stickerIsVideo ? "figurinha.mp4" : "figurinha.webp",
                })
              }
            >
              {mediaFailed ? (
                <div className="w-28 h-28 rounded-xl bg-black/20 border border-white/10 flex flex-col items-center justify-center text-neutral-400 text-xs gap-1.5 select-none">
                  <ImageIcon size={24} className="text-neutral-500" />
                  <span>Figurinha indisponível</span>
                </div>
              ) : stickerIsVideo ? (
                <video
                  src={message.mediaUrl || undefined}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => setMediaFailed(true)}
                  className="w-auto h-auto max-w-[170px] max-h-44 object-contain rounded-xl"
                />
              ) : (
                <img
                  src={message.mediaUrl || ""}
                  alt="Figurinha"
                  onError={() => setMediaFailed(true)}
                  className="w-auto h-auto max-w-[170px] max-h-44 object-contain rounded-xl"
                />
              )}
            </button>

            {/* Ações e Horário fora da imagem da figurinha */}
            <div className="flex flex-col items-center gap-1.5 pb-1 select-none shrink-0">
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply(message)}
                  className={`p-1.5 rounded-full opacity-0 group-hover/sticker-row:opacity-100 transition-opacity ${
                    isDarkMode
                      ? "bg-[#202c33] text-neutral-300 hover:text-white hover:bg-[#2a3942]"
                      : "bg-white text-neutral-600 hover:text-neutral-900 shadow-xs"
                  }`}
                  title="Responder figurinha"
                >
                  <ArrowBendUpLeft size={13} weight="bold" />
                </button>
              )}
              {onReact && (
                <ReactionMenu
                  message={message}
                  onReact={onReact}
                  isDarkMode={isDarkMode}
                  open={reactionMenuOpen}
                  onToggle={() => setReactionMenuOpen((open) => !open)}
                  options={reactionOptions}
                />
              )}

              <div
                className={`text-[11px] flex items-center gap-1 ${isDarkMode ? "text-neutral-400" : "text-neutral-500"}`}
              >
                <span>{message.time}</span>
                {isMe && (
                  <span className="flex items-center">
                    {message.status === "pending" && (
                      <Clock size={11} className="animate-spin text-neutral-400" />
                    )}
                    {message.status === "sent" && <Check size={12} className="text-neutral-400" />}
                    {message.status === "delivered" && (
                      <Checks size={13} className="text-neutral-400" />
                    )}
                    {message.status === "read" && (
                      <Checks size={13} weight="bold" className="text-[#53bdeb]" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pílula de Reações na figurinha */}
          {message.reactions && message.reactions.length > 0 && (
            <div className={`absolute -bottom-2 ${isMe ? "right-2" : "left-2"} z-10`}>
              <ReactionSummary reactions={message.reactions} isDarkMode={isDarkMode} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. BOLHA COMPLETA (TEXTO, ÁUDIO, GIF, FOTO, VÍDEO, DOCUMENTO OU FIGURINHA COM CITAÇÃO)
  // Botão de responder posicionado na calha externa (nunca sobrepõe texto ou remetente)
  // =========================================================================
  return (
    <div
      className={`flex group/row animate-smooth-in ${isMe ? "justify-end" : "justify-start items-start gap-2.5"} ${isConsecutive ? "my-0.5" : "my-1"} relative`}
    >
      {/* Avatar do Participante fora da bolha (apenas na 1ª mensagem do bloco como no WhatsApp Web) */}
      {!isMe &&
        isGroup &&
        (isConsecutive ? (
          <div className="w-8 shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-[#2a3942] flex items-center justify-center text-[12px] font-bold text-neutral-300 select-none shadow-sm border border-white/10 mt-0.5">
            {message.senderAvatar && !avatarFailed ? (
              <img
                src={message.senderAvatar}
                alt=""
                className="w-full h-full object-cover"
                onError={handleAvatarError}
              />
            ) : (
              <span style={{ color: participantColor }} className="text-[11px] font-bold">
                {senderInfo.initials || <User size={15} weight="bold" />}
              </span>
            )}
          </div>
        ))}

      {/* Conteiner da Bolha + Botão de Ação Externo */}
      <div
        className={`flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"} max-w-[88%] md:max-w-[76%] lg:max-w-[68%]`}
      >
        {/* Bolha de Mensagem */}
        <div
          className={`px-3 py-2.5 rounded-2xl text-[13px] leading-relaxed transition-all shadow-sm relative min-w-[95px] ${
            isMe
              ? isDarkMode
                ? "bg-[#1c1c1f] text-zinc-100 rounded-tr-sm border border-white/[0.075] shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                : "bg-[#e8e8e4] text-neutral-900 rounded-tr-sm border border-black/[0.06] shadow-xs"
              : isDarkMode
                ? "bg-[#111113] text-zinc-200 rounded-tl-sm border border-white/[0.065] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                : "bg-white text-neutral-900 rounded-tl-sm border border-black/[0.07] shadow-xs"
          }`}
        >
          {/* Cabeçalho do Grupo: Padrão oficial WhatsApp */}
          {showGroupHeader && senderInfo.primary && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium mb-1.5 pr-2 select-none">
              <span
                className="font-semibold tracking-tight truncate max-w-[200px]"
                style={{ color: participantColor }}
              >
                {senderInfo.primary}
              </span>
              {senderInfo.secondary && (
                <span className="text-[11px] font-normal text-neutral-400 truncate max-w-[140px]">
                  {senderInfo.secondary}
                </span>
              )}
            </div>
          )}

          {/* Mensagem Citada / Respondida (Quote Box) */}
          {message.quotedMessage && (
            <div
              className={`p-2 rounded-lg border-l-[3.5px] mb-2 text-xs select-none pr-3 ${
                isDarkMode ? "bg-[#111b21]/70" : "bg-neutral-100"
              }`}
              style={{ borderLeftColor: participantColor }}
            >
              {(() => {
                const quoteInfo = resolveSenderDisplay(
                  message.quotedMessage.senderName,
                  message.quotedMessage.senderPhone,
                );
                return (
                  <div
                    className="flex items-center justify-between gap-2 font-semibold text-[11px] mb-0.5"
                    style={{ color: participantColor }}
                  >
                    <div className="flex items-center gap-1 truncate">
                      <ArrowBendUpLeft size={12} weight="bold" className="shrink-0" />
                      <span className="truncate">
                        {quoteInfo.primary} {quoteInfo.secondary ? quoteInfo.secondary : ""}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <p className="text-neutral-300 text-[11.5px] truncate max-w-xs">
                {message.quotedMessage.text || "Mídia citada"}
              </p>
            </div>
          )}

          {/* Caso a mensagem tenha sido apagada (Padrão WhatsApp Web) */}
          {isDeleted ? (
            <div className="flex items-center gap-2 py-1 text-neutral-400 italic text-[13px] select-none">
              <Prohibit size={16} weight="bold" className="text-neutral-500 shrink-0" />
              <span>Mensagem apagada</span>
            </div>
          ) : (
            <>
              {/* A linha pode chegar antes do download privado terminar. Nunca
                  deixe um balão de mídia vazio: o reparo automático do chat
                  preencherá a URL e a mensagem será reconciliada em seguida. */}
              {message.type !== "text" &&
                message.type !== "deleted" &&
                !message.mediaUrl &&
                !message.audioUrl &&
                !message.fileUrl && (
                  <div
                    role="status"
                    className={`mb-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs ${
                      isDarkMode
                        ? "border-white/10 bg-white/[0.04] text-neutral-400"
                        : "border-neutral-200 bg-neutral-50 text-neutral-500"
                    }`}
                  >
                    <MediaFallbackIcon type={message.type} size={19} className="shrink-0" />
                    <span>Mídia sendo carregada…</span>
                  </div>
                )}

              {/* 1. Figurinha com Citação */}
              {isSticker && message.mediaUrl && (
                <div className="mb-1 flex justify-center">
                  {mediaFailed ? (
                    <div className="w-28 h-28 rounded-xl bg-black/20 border border-white/10 flex flex-col items-center justify-center text-neutral-400 text-xs gap-1.5 select-none">
                      <MediaFallbackIcon type="sticker" size={24} className="text-neutral-500" />
                      <span>Figurinha indisponível</span>
                    </div>
                  ) : stickerIsVideo ? (
                    <video
                      src={message.mediaUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      onError={() => setMediaFailed(true)}
                      className="max-w-[160px] max-h-44 object-contain rounded-xl drop-shadow-sm cursor-pointer hover:scale-105 transition-transform"
                      onClick={() =>
                        onPreviewMedia({
                          type: "video",
                          url: message.mediaUrl!,
                          name: "figurinha.mp4",
                        })
                      }
                    />
                  ) : (
                    <img
                      src={message.mediaUrl}
                      alt="Figurinha"
                      onError={() => setMediaFailed(true)}
                      className="max-w-[160px] max-h-44 object-contain rounded-xl drop-shadow-sm cursor-pointer hover:scale-105 transition-transform"
                      onClick={() =>
                        onPreviewMedia({
                          type: "image",
                          url: message.mediaUrl!,
                          name: "figurinha.webp",
                        })
                      }
                    />
                  )}
                </div>
              )}

              {/* 2. GIF ANIMADO */}
              {isGif &&
                message.mediaUrl &&
                (mediaFailed ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/20 border border-white/10 text-neutral-400 text-xs select-none mb-2">
                    <MediaFallbackIcon
                      type="image"
                      size={20}
                      className="text-neutral-500 shrink-0"
                    />
                    <span>GIF indisponível</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Ampliar GIF"
                    className="group relative mb-2 block overflow-hidden rounded-xl border border-white/5 bg-black/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60 focus-visible:ring-offset-2"
                    onClick={() =>
                      onPreviewMedia({
                        type: message.mimetype?.startsWith("video/") ? "video" : "image",
                        url: message.mediaUrl!,
                        name: "GIF",
                      })
                    }
                  >
                    {message.mimetype?.startsWith("video/") ? (
                      <video
                        src={message.mediaUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        onError={() => setMediaFailed(true)}
                        className="max-h-80 w-auto max-w-full object-contain rounded-xl mx-auto block"
                      />
                    ) : (
                      <img
                        src={message.mediaUrl}
                        alt="GIF"
                        onError={() => setMediaFailed(true)}
                        className="max-h-80 w-auto max-w-full object-contain rounded-xl mx-auto block"
                      />
                    )}
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[10px] font-bold tracking-wider text-white select-none">
                      GIF
                    </div>
                  </button>
                ))}

              {/* 3. Imagem / Foto comum (object-contain evita cortes indesejados da foto) */}
              {!isSticker &&
                !isGif &&
                message.type === "image" &&
                message.mediaUrl &&
                (mediaFailed ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/20 border border-white/10 text-neutral-400 text-xs select-none mb-2">
                    <MediaFallbackIcon
                      type="image"
                      size={20}
                      className="text-neutral-500 shrink-0"
                    />
                    <span>Imagem indisponível</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Ampliar imagem"
                    className="group relative mb-2 block overflow-hidden rounded-xl bg-black/10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60 focus-visible:ring-offset-2"
                    onClick={() =>
                      onPreviewMedia({
                        type: "image",
                        url: message.mediaUrl!,
                        name: message.fileName,
                      })
                    }
                  >
                    <img
                      src={message.mediaUrl}
                      alt="Imagem"
                      onError={() => setMediaFailed(true)}
                      className="max-h-80 w-auto max-w-full object-contain rounded-xl transition-transform duration-200 group-hover:scale-[1.01] mx-auto block"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-semibold gap-1.5 backdrop-blur-[2px]">
                      <ImageIcon size={18} />
                      <span>Ampliar Imagem</span>
                    </div>
                  </button>
                ))}

              {/* 4. Vídeo comum */}
              {!isSticker &&
                !isGif &&
                message.type === "video" &&
                message.mediaUrl &&
                (mediaFailed ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/20 border border-white/10 text-neutral-400 text-xs select-none mb-2">
                    <MediaFallbackIcon
                      type="video"
                      size={20}
                      className="text-neutral-500 shrink-0"
                    />
                    <span>Vídeo indisponível</span>
                  </div>
                ) : (
                  <div className="mb-2 rounded-xl overflow-hidden border border-neutral-700/40">
                    <video
                      src={message.mediaUrl}
                      controls
                      onError={() => setMediaFailed(true)}
                      className="max-h-80 w-auto max-w-full rounded-xl mx-auto block"
                    />
                  </div>
                ))}

              {/* 5. Documento / PDF */}
              {message.type === "document" && (
                <div
                  className={`p-2.5 rounded-xl border transition-all mb-1 ${
                    isMe
                      ? "bg-black/20 border-white/15 text-white"
                      : isDarkMode
                        ? "bg-[#182229] border-[#2a3942] text-white hover:border-[#384c58]"
                        : "bg-neutral-50 border-neutral-200 text-neutral-900 hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={!message.fileUrl}
                      aria-label={`Visualizar ${message.fileName || "documento"}`}
                      onClick={() =>
                        onPreviewMedia({
                          type: "document",
                          url: message.fileUrl!,
                          name: message.fileName,
                        })
                      }
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/60 disabled:cursor-default"
                      title="Visualizar documento"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isMe
                            ? "bg-white/20 text-white"
                            : isDarkMode
                              ? "border border-white/10 bg-white/[0.06] text-zinc-200"
                              : "border border-neutral-200 bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        <FileText size={20} weight="bold" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold tracking-tight truncate hover:underline">
                          {message.fileName || "documento.pdf"}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 ${isMe ? "text-white/80" : "text-neutral-400"}`}
                        >
                          Documento • Clique para abrir
                        </p>
                      </div>
                    </button>

                    {message.fileUrl && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewMedia({
                              type: "document",
                              url: message.fileUrl!,
                              name: message.fileName,
                            })
                          }
                          className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-300"
                          title="Visualizar"
                        >
                          <Eye size={15} weight="bold" />
                        </button>
                        <a
                          href={message.fileUrl}
                          download={message.fileName || "documento"}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-300"
                          title="Baixar"
                        >
                          <DownloadSimple size={15} weight="bold" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 6. Áudio WhatsApp Real (Voice Note / PTT) */}
              {message.type === "audio" && (
                <AudioPlayer
                  audioUrl={message.audioUrl || message.mediaUrl}
                  duration={message.duration}
                  isMe={isMe}
                  isDarkMode={isDarkMode}
                />
              )}

              {/* 7. Texto da mensagem com Truncamento e Botão "Ler mais" */}
              {message.text && message.type !== "audio" && (
                <div className="text-[13.5px] leading-relaxed">
                  <p className="whitespace-pre-wrap font-normal break-words [word-break:break-word]">
                    {message.text.length > 400 && !isExpanded
                      ? `${message.text.slice(0, 400)}...`
                      : message.text}
                    {message.text.length > 400 && (
                      <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="ml-1 text-zinc-400 hover:text-zinc-200 hover:underline font-semibold select-none cursor-pointer inline-block"
                      >
                        {isExpanded ? "Ler menos" : "Ler mais"}
                      </button>
                    )}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Rodapé: Horário, Tag Editada e Status de Entrega */}
          <div
            className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
              isMe ? (isDarkMode ? "text-white/70" : "text-neutral-600") : "text-[#8696a0]"
            }`}
          >
            {message.isEdited && (
              <span className="text-[10px] text-neutral-400 mr-0.5 select-none font-medium">
                Editada
              </span>
            )}

            <span>{message.time}</span>

            {isMe && (
              <span className="flex items-center ml-0.5">
                {message.status === "pending" && (
                  <Clock size={12} className="animate-spin text-neutral-400" />
                )}
                {message.status === "sent" && <Check size={13} className="text-[#8696a0]" />}
                {message.status === "delivered" && <Checks size={14} className="text-[#8696a0]" />}
                {message.status === "read" && (
                  <Checks size={14} weight="bold" className="text-[#53bdeb]" />
                )}
                {isFailed && (
                  <span
                    className="flex items-center gap-1 text-rose-400 text-[10px]"
                    title={message.failedReason || "Falha no envio"}
                  >
                    <WarningCircle size={13} weight="fill" />
                    <span>Falhou</span>
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Pílula de Reações exclusiva com ícones Phosphor SVG (0 Emojis) */}
          {message.reactions && message.reactions.length > 0 && (
            <div className={`absolute -bottom-2.5 ${isMe ? "right-2" : "left-2"} z-10`}>
              <ReactionSummary reactions={message.reactions} isDarkMode={isDarkMode} />
            </div>
          )}
        </div>

        {/* Botão de Responder na calha externa (WhatsApp Web style: nunca sobrepõe texto ou remetente) */}
        {onReact && !isDeleted && (
          <ReactionMenu
            message={message}
            onReact={onReact}
            isDarkMode={isDarkMode}
            open={reactionMenuOpen}
            onToggle={() => setReactionMenuOpen((open) => !open)}
            options={reactionOptions}
          />
        )}
        {onReply && !isDeleted && (
          <button
            type="button"
            onClick={() => onReply(message)}
            className={`p-1.5 rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity self-center shrink-0 ${
              isDarkMode
                ? "bg-[#202c33] text-neutral-300 hover:text-white hover:bg-[#2a3942]"
                : "bg-white text-neutral-600 hover:text-neutral-900 shadow-xs"
            }`}
            title="Responder mensagem"
          >
            <ArrowBendUpLeft size={13} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
