import { useState, useEffect, useRef } from "react";
import {
  X,
  Buildings,
  MapPin,
  EnvelopeSimple,
  Globe,
  Clock,
  CheckCircle,
  Tag,
  ArrowSquareOut,
  Spinner,
} from "@phosphor-icons/react";
import { formatPhoneLabel } from "../mappers/chatMapper";
import { stripEmojis } from "@/lib/emoji";
import { apiFetch } from "@/lib/api-fetch";

interface BusinessProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar?: string | null | undefined;
  isDarkMode?: boolean;
}

interface BusinessProfileData {
  isBusiness: boolean;
  address?: string | null;
  description?: string | null;
  website?: string[] | null;
  email?: string | null;
  category?: string | null;
  businessHours?: {
    timezone?: string;
    schedule?: Array<{
      day_of_week: string;
      mode?: string;
      open_time?: number | string;
      close_time?: number | string;
    }>;
  } | null;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Segunda-feira",
  TUESDAY: "Terça-feira",
  WEDNESDAY: "Quarta-feira",
  THURSDAY: "Quinta-feira",
  FRIDAY: "Sexta-feira",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export function BusinessProfileModal({
  isOpen,
  onClose,
  chatId,
  contactName,
  contactPhone,
  contactAvatar,
  isDarkMode = true,
}: BusinessProfileModalProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const profileRequestKeyRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const cleanName = stripEmojis(contactName) || "Contato";
  const cleanInitials =
    cleanName
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  useEffect(() => {
    if (!isOpen || !chatId) {
      if (!isOpen) profileRequestKeyRef.current = null;
      return;
    }
    if (profileRequestKeyRef.current === chatId) return;
    profileRequestKeyRef.current = chatId;

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiFetch(`/api/chats/${encodeURIComponent(chatId)}/business-profile`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setProfile(data.profile || null);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Falha ao buscar perfil comercial");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, chatId]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
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
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
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
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm transition-all duration-200 animate-fade-in overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        aria-labelledby="business-profile-title"
        className={`w-full max-w-lg m-auto rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all animate-scale-in ${
          isDarkMode
            ? "bg-[#111115] border-white/[0.12] text-neutral-100 shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
            : "bg-white border-neutral-200 text-neutral-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div
          className={`h-14 px-6 border-b flex items-center justify-between shrink-0 ${
            isDarkMode ? "border-[#22222b] bg-[#16161c]" : "border-neutral-100 bg-neutral-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <Buildings size={20} className="text-[#25d366]" weight="bold" />
            <h3 id="business-profile-title" className="font-bold text-sm">
              Informações do Contato
            </h3>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar informações do contato"
            className={`min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-colors ${
              isDarkMode
                ? "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                : "hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Avatar & Identificação Principal */}
          <div className="flex flex-col items-center text-center pb-4 border-b border-neutral-700/20">
            <div className="w-24 h-24 rounded-full overflow-hidden border border-white/[0.1] shadow-lg mb-3 relative bg-neutral-800 flex items-center justify-center">
              {contactAvatar ? (
                <img src={contactAvatar} alt={cleanName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-zinc-300">{cleanInitials}</span>
              )}
            </div>

            <h4 className="text-base font-bold flex items-center gap-1.5">
              {cleanName}
              {profile?.isBusiness && (
                <span title="Conta Comercial Verificada">
                  <CheckCircle size={16} weight="fill" className="text-[#00a884]" />
                </span>
              )}
            </h4>
            <p className="text-xs text-neutral-400 mt-0.5">{formatPhoneLabel(contactPhone)}</p>

            {profile?.isBusiness && (
              <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#00a884]/10 text-[#00a884] border border-[#00a884]/20">
                Conta WhatsApp Business
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Spinner size={28} className="animate-spin text-[#00a884]" />
              <span className="text-xs">Consultando perfil no WhatsApp...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center">
              {error}
            </div>
          ) : !profile?.isBusiness ? (
            <div className="p-4 rounded-xl bg-neutral-800/20 border border-neutral-700/20 text-center text-xs text-neutral-400">
              Este número utiliza uma conta pessoal padrão do WhatsApp.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Descrição / Bio */}
              {profile.description && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-400">
                    Descrição Comercial
                  </span>
                  <div
                    className={`p-3 rounded-xl border whitespace-pre-wrap ${
                      isDarkMode
                        ? "bg-[#181820] border-[#22222b]"
                        : "bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    {profile.description}
                  </div>
                </div>
              )}

              {/* Categoria */}
              {profile.category && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-neutral-800/40 text-neutral-300">
                    <Tag size={16} weight="bold" />
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-400 block">Categoria</span>
                    <span className="font-semibold">{profile.category}</span>
                  </div>
                </div>
              )}

              {/* Endereço */}
              {profile.address && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-neutral-800/40 text-neutral-300">
                    <MapPin size={16} weight="bold" />
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-400 block">Endereço</span>
                    <span className="font-semibold">{profile.address}</span>
                  </div>
                </div>
              )}

              {/* Email */}
              {profile.email && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-neutral-800/40 text-neutral-300">
                    <EnvelopeSimple size={16} weight="bold" />
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-400 block">E-mail Comercial</span>
                    <a
                      href={`mailto:${profile.email}`}
                      className="font-semibold text-zinc-300 hover:text-white hover:underline flex items-center gap-1"
                    >
                      {profile.email}
                      <ArrowSquareOut size={12} />
                    </a>
                  </div>
                </div>
              )}

              {/* Websites */}
              {Array.isArray(profile.website) && profile.website.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-neutral-400">
                    Websites e Links
                  </span>
                  <div className="space-y-1.5">
                    {profile.website.map((url, i) => (
                      <a
                        key={i}
                        href={url.startsWith("http") ? url : `https://${url}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`p-2.5 rounded-lg border flex items-center justify-between text-zinc-300 hover:text-white hover:underline transition-colors ${
                          isDarkMode
                            ? "bg-[#181820] border-[#22222b]"
                            : "bg-neutral-50 border-neutral-200"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Globe size={15} />
                          {url}
                        </span>
                        <ArrowSquareOut size={13} className="shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Horário de Atendimento */}
              {profile.businessHours?.schedule && profile.businessHours.schedule.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1.5">
                    <Clock size={14} />
                    Horário de Atendimento
                  </span>
                  <div
                    className={`rounded-xl border divide-y overflow-hidden text-[11px] ${
                      isDarkMode
                        ? "bg-[#181820] border-[#22222b] divide-neutral-800"
                        : "bg-neutral-50 border-neutral-200 divide-neutral-200"
                    }`}
                  >
                    {profile.businessHours.schedule.map((slot, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2">
                        <span className="font-medium text-neutral-300">
                          {DAY_LABELS[slot.day_of_week] || slot.day_of_week}
                        </span>
                        <span className="text-neutral-400 font-mono">
                          {slot.mode === "open"
                            ? `${slot.open_time ?? "08:00"} - ${slot.close_time ?? "18:00"}`
                            : "Fechado"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`h-12 px-6 border-t flex items-center justify-end shrink-0 text-xs text-neutral-400 ${
            isDarkMode ? "border-[#22222b] bg-[#16161c]" : "border-neutral-100 bg-neutral-50"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-1.5 font-semibold text-black transition-colors hover:bg-zinc-200 dark:bg-white dark:text-black"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
