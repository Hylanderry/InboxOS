import { useState } from "react";
import { PushPin, Plus, SquaresFour, ArrowsClockwise } from "@phosphor-icons/react";
import type { WhatsAppInstance } from "../types";
import { WhatsAppToast } from "@/components/ui/ToastProvider";

interface AccountsSidebarProps {
  instances: WhatsAppInstance[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onOpenNewConnection: () => void;
  onSync?: () => Promise<void> | void;
  totalUnread: number;
  unreadByInstance?: Record<string, number>;
  isDarkMode?: boolean;
}

export function AccountsSidebar({
  instances,
  selectedAccountId,
  onSelectAccount,
  onOpenNewConnection,
  onSync,
  totalUnread,
  unreadByInstance = {},
  isDarkMode = false,
}: AccountsSidebarProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncing || !onSync) return;
    setIsSyncing(true);
    try {
      await onSync();
    } catch {
      WhatsAppToast.networkError("Não foi possível sincronizar as contas. Tente novamente.");
    } finally {
      setIsSyncing(false);
    }
  };

  const isExpanded = isPinned || isHovered;
  const activeCount = instances.filter((i) => i.state === "open").length;

  return (
    <aside
      data-testid="accounts-sidebar"
      data-expanded={isExpanded ? "true" : "false"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsHovered(false);
      }}
      style={{ width: isExpanded ? "280px" : "68px" }}
      className={`accounts-panel hidden h-full shrink-0 flex-col justify-start select-none z-20 transition-[width,padding] duration-200 ease-out overflow-hidden border-r md:flex ${
        isDarkMode
          ? "bg-[#0e0e13] border-[#1d1d26] text-white"
          : "bg-[#fafafc] border-[#e2e4e9] text-neutral-900 shadow-xs"
      } ${isExpanded ? "p-4" : "py-4 px-3.5 items-center"}`}
      aria-label="Contas do WhatsApp"
    >
      <div className="w-full flex flex-col items-center">
        {/* Cabeçalho quando expandido */}
        {isExpanded ? (
          <div className="w-full flex items-center justify-between mb-3.5 h-6 px-1 animate-smooth-in">
            <span
              className={`text-[11px] font-bold tracking-wider uppercase truncate ${
                isDarkMode ? "text-[#71717a]" : "text-neutral-500"
              }`}
            >
              Contas WhatsApp
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {onSync && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode
                      ? "text-[#71717a] hover:text-white hover:bg-[#1c1c24]"
                      : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200/70"
                  }`}
                  title="Sincronizar Mensagens com WhatsApp"
                  aria-label="Sincronizar mensagens com WhatsApp"
                >
                  <ArrowsClockwise
                    size={15}
                    className={isSyncing ? "animate-spin text-neutral-400" : ""}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isPinned
                    ? "text-white bg-white/[0.07]"
                    : isDarkMode
                      ? "text-[#71717a] hover:text-white hover:bg-[#1c1c24]"
                      : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200/70"
                }`}
                title={isPinned ? "Desafixar Barra" : "Fixar Barra Expandida"}
                aria-label={
                  isPinned ? "Desafixar barra de contas" : "Fixar barra de contas expandida"
                }
                aria-pressed={isPinned}
              >
                <PushPin size={15} weight={isPinned ? "fill" : "regular"} />
              </button>

              <button
                type="button"
                onClick={onOpenNewConnection}
                className={`p-1.5 rounded-lg transition-all shrink-0 ${
                  isDarkMode
                    ? "text-[#71717a] hover:text-white hover:bg-[#1c1c24]"
                    : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70"
                }`}
                title="Conectar Nova Conta de WhatsApp"
                aria-label="Conectar nova conta de WhatsApp"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex items-center justify-center mb-2.5 h-6">
            <span
              className={`text-[9.5px] font-bold uppercase ${
                isDarkMode ? "text-[#71717a]" : "text-neutral-400"
              }`}
            >
              WA
            </span>
          </div>
        )}

        {/* 1. Item: Todas as Contas */}
        {(() => {
          const isSelected = selectedAccountId === "all";
          return (
            <button
              type="button"
              onClick={() => onSelectAccount("all")}
              title={!isExpanded ? "Todas as Contas" : undefined}
              className={`rounded-xl flex items-center transition-all duration-150 active:scale-[0.99] ${
                isExpanded
                  ? "w-full p-2.5 justify-between border mb-2"
                  : "w-10 h-10 justify-center border mb-2.5"
              } ${
                isSelected
                  ? isDarkMode
                    ? "bg-white/[0.065] text-white border-white/[0.09] shadow-sm"
                    : "bg-black/[0.045] text-neutral-950 border-black/[0.07] font-semibold"
                  : isDarkMode
                    ? "bg-[#13131a]/60 text-[#a1a1aa] border-white/[0.04] hover:bg-[#1a1a24] hover:text-white"
                    : "bg-neutral-100/80 text-neutral-700 border-neutral-200 hover:bg-white hover:text-neutral-950"
              }`}
            >
              <div
                className={`flex items-center ${isExpanded ? "gap-3 min-w-0" : "justify-center"}`}
              >
                <div
                  className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                    isDarkMode
                      ? "bg-[#22222c] border-[#31313d] text-white shadow-inner"
                      : "bg-neutral-200 border-neutral-300 text-neutral-900"
                  }`}
                >
                  <SquaresFour size={17} weight="fill" />
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ${
                      isDarkMode ? "ring-[#0e0e13]" : "ring-white"
                    } ${activeCount > 0 ? "bg-[#00a884]" : "bg-amber-500"}`}
                  />
                </div>

                {isExpanded && (
                  <div className="min-w-0 text-left animate-smooth-in">
                    <p
                      className={`text-[12.5px] font-bold tracking-tight truncate ${
                        isDarkMode ? "text-[#f4f4f5]" : "text-neutral-950"
                      }`}
                    >
                      Todas as Contas
                    </p>
                    <p
                      className={`text-[10.5px] tracking-tight truncate mt-0.5 font-medium flex items-center gap-1.5 ${
                        isDarkMode ? "text-[#8e8e93]" : "text-neutral-600"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          activeCount > 0 ? "bg-[#00a884]" : "bg-amber-500"
                        }`}
                      />
                      <span>
                        {activeCount} {activeCount === 1 ? "ativa" : "ativas"}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {isExpanded && totalUnread > 0 && (
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDarkMode ? "bg-white/[0.09] text-neutral-200" : "bg-black/[0.07] text-neutral-700"}`}
                >
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </button>
          );
        })()}

        {/* Linha Divisória */}
        <div
          className={`w-full my-1 border-t transition-opacity ${
            isDarkMode ? "border-[#1f1f2a]" : "border-neutral-200"
          } ${isExpanded ? "opacity-100" : "opacity-40"}`}
        />

        {/* 2. Contas WhatsApp Individuais (Apenas Conectadas) */}
        <div
          className={`w-full space-y-1.5 flex flex-col ${isExpanded ? "items-stretch" : "items-center"}`}
        >
          {instances
            .filter((inst) => inst.state === "open")
            .map((inst) => {
              const isSelected = selectedAccountId === inst.instanceName;
              const isConnected = inst.state === "open";
              const unreadCount = unreadByInstance[inst.instanceName] || 0;

              return (
                <button
                  key={inst.id || inst.instanceName}
                  type="button"
                  onClick={() => onSelectAccount(inst.instanceName)}
                  title={
                    !isExpanded
                      ? `${inst.alias || inst.instanceName} (${isConnected ? inst.phone || "Conectado" : "Desconectado"})`
                      : undefined
                  }
                  className={`rounded-xl flex items-center transition-all duration-150 active:scale-[0.99] ${
                    isExpanded
                      ? "w-full p-2 justify-between border"
                      : "w-10 h-10 justify-center border"
                  } ${
                    isSelected && isConnected
                      ? isDarkMode
                        ? "bg-white/[0.065] text-white border-white/[0.09] shadow-sm"
                        : "bg-black/[0.045] text-neutral-950 border-black/[0.07] font-semibold"
                      : !isConnected
                        ? isDarkMode
                          ? "bg-transparent text-[#8e8e93] border-dashed border-[#2d2d38] hover:bg-[#181822] hover:text-white"
                          : "bg-transparent text-neutral-500 border-dashed border-neutral-300 hover:bg-neutral-100"
                        : isDarkMode
                          ? "bg-[#13131a]/60 text-[#a1a1aa] border-white/[0.04] hover:bg-[#1a1a24] hover:text-white"
                          : "bg-neutral-100/80 text-neutral-700 border-neutral-200 hover:bg-white hover:text-neutral-950"
                  }`}
                >
                  <div
                    className={`flex items-center ${isExpanded ? "gap-2.5 min-w-0" : "justify-center"}`}
                  >
                    <div
                      className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border overflow-visible ${
                        isDarkMode
                          ? "bg-[#22222c] border-[#31313d] text-white"
                          : "bg-neutral-200 border-neutral-300 text-neutral-900"
                      }`}
                    >
                      {inst.profilePicUrl ? (
                        <img
                          src={inst.profilePicUrl}
                          alt={inst.alias || inst.instanceName}
                          className={`w-full h-full rounded-xl object-cover ${
                            !isConnected ? "grayscale opacity-50" : ""
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full rounded-xl flex items-center justify-center font-bold text-xs">
                          {(inst.alias || inst.instanceName || "W").charAt(0).toUpperCase()}
                        </div>
                      )}

                      <span
                        className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ${
                          isDarkMode ? "ring-[#0e0e13]" : "ring-white"
                        } ${isConnected ? "bg-[#00a884]" : "bg-rose-500"}`}
                      />
                    </div>

                    {isExpanded && (
                      <div className="min-w-0 text-left animate-smooth-in">
                        <p
                          title={inst.alias || inst.instanceName}
                          className={`text-[12px] font-bold tracking-tight truncate ${
                            isDarkMode ? "text-[#f4f4f5]" : "text-neutral-950"
                          }`}
                        >
                          {inst.alias || inst.instanceName}
                        </p>
                        <p
                          className={`text-[10.5px] font-mono tracking-tight truncate mt-0.5 ${
                            isConnected
                              ? isDarkMode
                                ? "text-[#8e8e93]"
                                : "text-neutral-500"
                              : "text-rose-400 font-medium"
                          }`}
                        >
                          {isConnected ? inst.phone || "Conectado" : "Desconectado"}
                        </p>
                      </div>
                    )}
                  </div>

                  {isExpanded && unreadCount > 0 && (
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDarkMode ? "bg-white/[0.09] text-neutral-200" : "bg-black/[0.07] text-neutral-700"}`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </aside>
  );
}
