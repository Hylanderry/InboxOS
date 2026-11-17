import { useState } from "react";
import {
  MagnifyingGlass,
  X,
  ChatTeardropSlash,
  ArrowsClockwise,
  UploadSimple,
} from "@phosphor-icons/react";
import type { Conversation, InboxFilters } from "../types";
import { ConversationRow } from "./ConversationRow";
import { WhatsAppToast } from "@/components/ui/ToastProvider";

interface ConversationListProps {
  conversations: Conversation[];
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
  filters: InboxFilters;
  onUpdateFilters: (update: Partial<InboxFilters>) => void;
  isDarkMode?: boolean;
  onSyncProfilePictures?: () => Promise<void> | void;
  onOpenImportExport?: () => void;
  isLoading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  layout?: "desktop" | "mobile";
}

export function ConversationList({
  conversations,
  selectedChatId,
  onSelectChat,
  filters,
  onUpdateFilters,
  isDarkMode = true,
  onSyncProfilePictures,
  onOpenImportExport,
  isLoading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  layout = "desktop",
}: ConversationListProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncPfp = async () => {
    if (isSyncing || !onSyncProfilePictures) return;
    setIsSyncing(true);
    try {
      await onSyncProfilePictures();
      WhatsAppToast.success(
        "Fotos sincronizadas",
        "As fotos dos contatos e grupos foram atualizadas.",
      );
    } catch {
      WhatsAppToast.networkError("Falha ao atualizar fotos de perfil");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className={`${layout === "mobile" ? "flex w-full" : "flex w-[360px] lg:w-[380px]"} conversation-panel flex-col h-full border-r shrink-0 transition-colors ${
        isDarkMode ? "bg-[#0e0e13] border-[#1e1e26]" : "bg-white border-[#e2e4e9]"
      }`}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight">Conversas</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDarkMode ? "bg-white/[0.08] text-zinc-400" : "bg-slate-100 text-slate-500"}`}
          >
            {conversations.length}
          </span>
        </div>
      </div>

      {/* Barra de Busca e Filtros Rápidos */}
      <div className={`p-3.5 border-b ${isDarkMode ? "border-[#1b1b24]" : "border-neutral-200"}`}>
        <div className="flex items-center gap-1.5">
          <div
            className={`relative flex items-center px-3 py-2 rounded-lg border flex-1 transition-colors ${
              isDarkMode
                ? "bg-white/[0.035] border-white/[0.07] text-white focus-within:border-white/[0.14]"
                : "bg-neutral-50 border-neutral-200 text-neutral-900 focus-within:border-neutral-400"
            }`}
          >
            <MagnifyingGlass size={15} className="text-neutral-400 shrink-0 mr-2" />
            <input
              type="text"
              placeholder="Buscar conversa..."
              aria-label="Buscar conversa por nome ou número"
              value={filters.searchQuery}
              onChange={(e) => onUpdateFilters({ searchQuery: e.target.value })}
              className="w-full bg-transparent text-xs placeholder-neutral-400 focus:outline-none"
            />
            {filters.searchQuery && (
              <button
                type="button"
                onClick={() => onUpdateFilters({ searchQuery: "" })}
                aria-label="Limpar busca de conversas"
                className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {onSyncProfilePictures && (
            <button
              type="button"
              onClick={handleSyncPfp}
              disabled={isSyncing}
              className={`p-2 rounded-lg border shrink-0 transition-colors ${
                isDarkMode
                  ? "bg-white/[0.035] border-white/[0.07] text-neutral-500 hover:text-white hover:border-white/[0.13]"
                  : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-950"
              }`}
              title="Sincronizar fotos de perfil do WhatsApp"
              aria-label="Sincronizar fotos de perfil do WhatsApp"
            >
              <ArrowsClockwise
                size={15}
                className={isSyncing ? "animate-spin text-neutral-300" : ""}
              />
            </button>
          )}

          {onOpenImportExport && (
            <button
              type="button"
              onClick={onOpenImportExport}
              className={`p-2 rounded-lg border shrink-0 transition-colors ${
                isDarkMode
                  ? "bg-white/[0.035] border-white/[0.07] text-neutral-500 hover:text-white hover:border-white/[0.13]"
                  : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-950"
              }`}
              title="Importar contatos ou exportar histórico"
              aria-label="Importar contatos ou exportar histórico"
            >
              <UploadSimple size={15} />
            </button>
          )}
        </div>

        {/* Abas Rápidas de Filtro */}
        <div className="flex items-center gap-1.5 mt-3 w-full overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          <button
            type="button"
            onClick={() =>
              onUpdateFilters({
                typeFilter: "all",
                audienceFilter: "all",
                showGroups: true,
                onlyUnread: false,
                showArchived: false,
              })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              (filters.typeFilter === "all" || !filters.typeFilter) &&
              !filters.onlyUnread &&
              !filters.showArchived
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={
              (filters.typeFilter === "all" || !filters.typeFilter) &&
              !filters.onlyUnread &&
              !filters.showArchived
            }
          >
            Todas
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateFilters({ onlyUnread: !filters.onlyUnread, showArchived: false })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              filters.onlyUnread
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={filters.onlyUnread}
          >
            Não Lidas
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateFilters({
                typeFilter: filters.typeFilter === "groups" ? "all" : "groups",
                audienceFilter: "all",
                showGroups: true,
                showArchived: false,
              })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              filters.typeFilter === "groups"
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={filters.typeFilter === "groups"}
          >
            Grupos
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateFilters({
                audienceFilter: filters.audienceFilter === "leads" ? "all" : "leads",
                typeFilter: "direct",
                showArchived: false,
              })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              filters.audienceFilter === "leads"
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={filters.audienceFilter === "leads"}
          >
            Leads
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateFilters({
                audienceFilter: filters.audienceFilter === "personal" ? "all" : "personal",
                typeFilter: "direct",
                showArchived: false,
              })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              filters.audienceFilter === "personal"
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={filters.audienceFilter === "personal"}
          >
            Pessoais
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateFilters({ showArchived: !filters.showArchived, onlyUnread: false })
            }
            className={`py-1.5 px-3 rounded-full text-[11px] font-medium shrink-0 transition-all text-center ${
              filters.showArchived
                ? isDarkMode
                  ? "bg-white/[0.1] text-white"
                  : "bg-black/[0.075] text-neutral-900"
                : isDarkMode
                  ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                  : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
            }`}
            aria-pressed={filters.showArchived}
          >
            Arquivadas
          </button>
        </div>
      </div>

      {/* Lista de Conversas com Scroll Suave */}
      <div className="flex-1 overflow-y-auto smooth-scroll">
        {isLoading && conversations.length === 0 ? (
          <div className="space-y-1 p-3" aria-label="Carregando conversas">
            {[0, 1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className={`h-14 animate-pulse rounded-lg ${isDarkMode ? "bg-white/[0.04]" : "bg-slate-100"}`}
              />
            ))}
          </div>
        ) : error && conversations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <ChatTeardropSlash size={36} className="mb-3 text-rose-400" />
            <p
              className={`text-sm font-semibold ${isDarkMode ? "text-zinc-200" : "text-slate-800"}`}
            >
              Não foi possível carregar as conversas
            </p>
            <p className="mt-1 text-xs text-slate-500">{error}</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-20 text-center text-xs text-neutral-400 px-6 animate-smooth-in flex flex-col items-center justify-center">
            <ChatTeardropSlash size={40} className="mb-2 text-neutral-600" />
            <p className={`font-bold mb-1 ${isDarkMode ? "text-neutral-300" : "text-slate-700"}`}>
              Nenhuma conversa encontrada
            </p>
            <p className="text-[11px] text-neutral-500 max-w-xs">
              {filters.searchQuery
                ? "Tente buscar por outros termos ou verifique os filtros."
                : "Suas mensagens sincronizadas com o WhatsApp aparecerão aqui."}
            </p>
          </div>
        ) : (
          <>
            {conversations.map((chat) => (
              <ConversationRow
                key={chat.id}
                conversation={chat}
                isSelected={selectedChatId === chat.id}
                onSelect={onSelectChat}
                isDarkMode={isDarkMode}
              />
            ))}
            {hasMore && onLoadMore && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoading}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${isDarkMode ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {isLoading ? "Carregando..." : "Carregar mais conversas"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
