import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import type { ChatMessage, Conversation } from "../types";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useInstances } from "@/features/instances/hooks/useInstances";
import { AccountRail } from "./AccountRail";
import { getAppViewMeta, type AppView } from "../navigation";
import { AccountsSidebar } from "./AccountsSidebar";
import { ConversationList } from "./ConversationList";
import { ChatHeader } from "./ChatHeader";
import { MessageTimeline } from "./MessageTimeline";
import { MessageComposer } from "./MessageComposer";
import { shouldMarkChatRead } from "../read-policy";
import {
  ChatCircleText,
  SidebarSimple,
  MagnifyingGlass,
  Sun,
  Moon,
  CaretDown,
} from "@phosphor-icons/react";
import { useResponsiveViewport } from "@/hooks/use-responsive-viewport";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { MobileDock } from "./MobileDock";
import { SettingsView } from "./SettingsView";
import { apiFetch } from "@/lib/api-fetch";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { createLead } from "../workspace-product-api";
import { loadWorkspaceBranding } from "../settings-api";
import {
  AgentsView,
  CalendarView,
  ClientsView,
  CrmView,
  DashboardView,
  FollowUpView,
} from "./ProductViews";
import { resolveInboxComposition } from "../layout-state";
import { useTheme } from "@/components/theme-context";
import { PLATFORM_BRAND_NAME } from "@/lib/platform-brand";

const ConnectionManager = lazy(() =>
  import("@/features/instances/components/ConnectionManager").then((m) => ({
    default: m.ConnectionManager,
  })),
);

const MediaPreviewModal = lazy(() =>
  import("@/features/media/components/MediaPreviewModal").then((m) => ({
    default: m.MediaPreviewModal,
  })),
);

const ImportExportModal = lazy(() =>
  import("./ImportExportModal").then((m) => ({
    default: m.ImportExportModal,
  })),
);

export function InboxShell() {
  const navigate = useNavigate();
  const { view: searchView } = useSearch({ from: "/" });
  const viewport = useResponsiveViewport();
  // O dashboard é a porta de entrada da área autenticada; a Inbox continua
  // disponível pela navegação e mantém seu estado independente.
  const [currentView, setCurrentView] = useState<AppView>(searchView);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [workspaceBrandName, setWorkspaceBrandName] = useState(PLATFORM_BRAND_NAME);
  const [workspaceBrandAssets, setWorkspaceBrandAssets] = useState<{
    logoLightPath: string | null;
    logoDarkPath: string | null;
    faviconPath: string | null;
  }>({ logoLightPath: null, logoDarkPath: null, faviconPath: null });
  const [workspaceBrandAssetUrls, setWorkspaceBrandAssetUrls] = useState<{
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    faviconUrl: string | null;
  }>({ logoLightUrl: null, logoDarkUrl: null, faviconUrl: null });
  const brandObjectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    let active = true;
    void apiFetch("/api/admin/me/", {}, { workspace: false })
      .then((r) => {
        if (active) setIsSystemAdmin(r.ok);
      })
      .catch(() => {
        if (active) setIsSystemAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshBrand = () => {
      setWorkspaceBrandName(PLATFORM_BRAND_NAME);
      setWorkspaceBrandAssets({ logoLightPath: null, logoDarkPath: null, faviconPath: null });
      void loadWorkspaceBranding()
        .then(({ branding }) => {
          if (active)
            setWorkspaceBrandName(
              branding?.brand_name?.trim() || branding?.trade_name?.trim() || PLATFORM_BRAND_NAME,
            );
          if (active) {
            setWorkspaceBrandAssets({
              logoLightPath: branding?.logo_light_path || branding?.logo_path || null,
              logoDarkPath: branding?.logo_dark_path || branding?.logo_path || null,
              faviconPath: branding?.favicon_path || null,
            });
          }
        })
        .catch(() => {
          if (active) setWorkspaceBrandName(PLATFORM_BRAND_NAME);
        });
    };
    refreshBrand();
    window.addEventListener("inboxos:workspace-change", refreshBrand);
    return () => {
      active = false;
      window.removeEventListener("inboxos:workspace-change", refreshBrand);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const paths = [
      ["logoLightUrl", workspaceBrandAssets.logoLightPath],
      ["logoDarkUrl", workspaceBrandAssets.logoDarkPath],
      ["faviconUrl", workspaceBrandAssets.faviconPath],
    ] as const;
    const nextUrls: Partial<Record<(typeof paths)[number][0], string | null>> = {};
    const createdUrls: string[] = [];
    const previousUrls = brandObjectUrlsRef.current;
    brandObjectUrlsRef.current = [];
    setWorkspaceBrandAssetUrls({ logoLightUrl: null, logoDarkUrl: null, faviconUrl: null });
    previousUrls.forEach((url) => URL.revokeObjectURL(url));

    const load = async () => {
      for (const [key, path] of paths) {
        if (!path) {
          nextUrls[key] = null;
          continue;
        }
        try {
          const response = await apiFetch(`/api/company/assets?path=${encodeURIComponent(path)}`);
          if (!response.ok) {
            nextUrls[key] = null;
            continue;
          }
          const blob = await response.blob();
          if (!blob.size) {
            nextUrls[key] = null;
            continue;
          }
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          nextUrls[key] = objectUrl;
        } catch {
          nextUrls[key] = null;
        }
      }
      if (!active) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      brandObjectUrlsRef.current = createdUrls;
      setWorkspaceBrandAssetUrls({
        logoLightUrl: nextUrls.logoLightUrl ?? null,
        logoDarkUrl: nextUrls.logoDarkUrl ?? null,
        faviconUrl: nextUrls.faviconUrl ?? null,
      });
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    workspaceBrandAssets.faviconPath,
    workspaceBrandAssets.logoDarkPath,
    workspaceBrandAssets.logoLightPath,
  ]);

  useEffect(() => {
    return () => {
      brandObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      brandObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const favicon = workspaceBrandAssetUrls.faviconUrl;
    if (!favicon) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      links.push(link);
    }
    for (const link of links) link.href = favicon;
  }, [workspaceBrandAssetUrls.faviconUrl]);
  useEffect(() => {
    if (workspaceBrandName.trim()) {
      document.title = `${workspaceBrandName.trim()} — Atendimento`;
    }
  }, [workspaceBrandName]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  // Keep the last selected row while a realtime refresh is reconciling.  The
  // list may be empty for one render during a tenant/network refresh; showing
  // the empty-state in that interval feels like the click was lost and also
  // resets the message timeline unnecessarily.
  const selectedChatSnapshotRef = useRef<Conversation | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const { isDarkMode, toggleTheme, themeLoaded } = useTheme();
  useEffect(() => {
    setCurrentView(searchView);
  }, [searchView]);
  const selectView = (view: AppView) => {
    if (view === "admin") {
      void navigate({ to: "/admin" });
      return;
    }
    setCurrentView(view);
    void navigate({ to: "/", search: { view } });
  };
  const [isRailOpen, setIsRailOpen] = useState(true);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{
    type: "image" | "video" | "document";
    url: string;
    name?: string | null | undefined;
  } | null>(null);

  useEffect(() => {
    const handleWorkspaceChange = () => {
      selectedChatSnapshotRef.current = null;
      setSelectedChatId(null);
    };
    window.addEventListener("inboxos:workspace-change", handleWorkspaceChange);
    return () => window.removeEventListener("inboxos:workspace-change", handleWorkspaceChange);
  }, []);

  const {
    conversations,
    isLoading: isLoadingConversations,
    error: conversationsError,
    nextCursor,
    loadMore,
    filters,
    updateFilters,
    syncProfilePictures,
    syncEvolution,
    updateChatFlags,
    markChatRead,
    toggleAiState,
    updateHandover,
    fetchConversations,
  } = useConversations({ enableProfileBackfill: currentView === "inbox" });

  const { instances, refetch: refetchInstances, deleteInstance } = useInstances();

  // Seleciona o chat inicial automaticamente sem sobrepor escolhas do usuário
  useEffect(() => {
    if (
      viewport.isDesktop &&
      conversations.length > 0 &&
      (!selectedChatId ||
        !conversations.some((conversation) => conversation.id === selectedChatId)) &&
      conversations[0]?.id
    ) {
      setSelectedChatId(conversations[0].id);
    }
  }, [conversations, selectedChatId, viewport.isDesktop]);

  // Busca conversa ativa sem reverter involuntariamente
  const activeChat = useMemo(() => {
    if (!selectedChatId) return viewport.isDesktop ? conversations[0] || null : null;
    const found = conversations.find((c) => c.id === selectedChatId);
    if (found) return found;
    // Only use the snapshot while the list is transiently empty.  If a
    // non-empty authoritative snapshot no longer contains the id, the effect
    // above will select the first valid conversation instead.
    if (conversations.length === 0 && selectedChatSnapshotRef.current?.id === selectedChatId) {
      return selectedChatSnapshotRef.current;
    }
    return null;
  }, [conversations, selectedChatId, viewport.isDesktop]);
  useEffect(() => {
    if (activeChat) selectedChatSnapshotRef.current = activeChat;
  }, [activeChat]);
  const activeChatIdRef = useRef<string | null>(activeChat?.id ?? null);
  activeChatIdRef.current = activeChat?.id ?? null;
  const visibleReadChatRef = useRef<string | null>(null);

  const handleSelectChat = (id: string) => {
    setSelectedChatId(id);
    setReplyingTo(null);
    const selected = conversations.find((conversation) => conversation.id === id);
    if ((selected?.unread ?? 0) > 0) void markChatRead(id);
  };

  const handleCreateLead = async () => {
    if (!activeChat || activeChat.isGroup || activeChat.leadId) return;
    try {
      const digits = activeChat.phone.replace(/\D/g, "");
      await createLead({
        name: activeChat.name.trim() || `Cliente ${digits}`,
        chatId: activeChat.id,
        phoneE164: /^\d{8,15}$/.test(digits) ? `+${digits}` : null,
        source: "inbox",
      });
      await fetchConversations();
      WhatsAppToast.success("Cliente registrado no CRM.");
    } catch (error: unknown) {
      WhatsAppToast.networkError(
        error instanceof Error ? error.message : "Falha ao registrar cliente",
      );
    }
  };

  const {
    messages,
    isLoading: isLoadingMessages,
    error: messagesError,
    hasMore: hasMoreMessages,
    loadPreviousMessages,
    refetch: refetchMessages,
    sendMessage,
    reactToMessage,
    sendPresence,
  } = useMessages(
    activeChat?.id || null,
    activeChat?.instanceName || null,
    activeChat?.phone || null,
    activeChat?.isGroup ?? false,
  );

  // A timeline that finished loading is considered visible. This also covers
  // the first desktop conversation, which is selected automatically.
  useEffect(() => {
    const activeId = activeChat?.id ?? null;
    const unread = activeChat?.unread ?? 0;
    const readKey = activeId ? `${activeId}:${unread}:${activeChat?.timestamp ?? ""}` : null;
    if (!activeId || isLoadingMessages || messagesError) return;
    if (unread <= 0 || !readKey || visibleReadChatRef.current === readKey) return;
    if (
      shouldMarkChatRead({
        unread,
        selectionSource: selectedChatId ? "user" : "automatic",
        timelineVisible: true,
      })
    ) {
      visibleReadChatRef.current = readKey;
      void markChatRead(activeId);
    }
  }, [
    activeChat?.id,
    activeChat?.timestamp,
    activeChat?.unread,
    isLoadingMessages,
    markChatRead,
    messagesError,
    selectedChatId,
  ]);

  // Total não lido global
  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread || 0), 0);
  }, [conversations]);

  // Mensagens não lidas por instância WhatsApp
  const unreadByInstance = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of conversations) {
      if (!c.archived && c.instanceName) {
        map[c.instanceName] = (map[c.instanceName] || 0) + (c.unread || 0);
      }
    }
    return map;
  }, [conversations]);

  // Instância WhatsApp ativa selecionada no filtro
  const activeInstance = useMemo(() => {
    if (filters.selectedAccountId === "all") return null;
    return instances.find((i) => i.instanceName === filters.selectedAccountId) || null;
  }, [instances, filters.selectedAccountId]);

  // Alterna o tema no elemento raiz para sincronia perfeita de CSS
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // Não sobrescrever a preferência antes de lê-la (inclusive em StrictMode).
    if (!themeLoaded) return;
    try {
      window.localStorage.setItem("inboxos:theme", isDarkMode ? "dark" : "light");
    } catch {
      // O tema funciona em memória mesmo com armazenamento indisponível.
    }
  }, [isDarkMode, themeLoaded]);

  const currentViewMeta = getAppViewMeta(currentView);
  const composition = resolveInboxComposition({
    isDesktop: viewport.isDesktop,
    currentView,
    hasActiveChat: Boolean(activeChat),
  });

  useEffect(() => {
    const unreadPrefix = totalUnread > 0 ? `(${totalUnread}) ` : "";
    document.title = `${unreadPrefix}${currentViewMeta.title} — ${workspaceBrandName}`;
  }, [currentViewMeta.title, totalUnread, workspaceBrandName]);

  return (
    <div
      className={`inbox-app inboxos-app-shell flex h-[100dvh] w-screen overflow-hidden font-sans vp-x-${viewport.horizontal} vp-y-${viewport.vertical} vp-o-${viewport.orientation} ${
        isDarkMode ? "dark bg-[#080809] text-[#f4f4f5]" : "bg-[#f6f6f4] text-neutral-900"
      }`}
    >
      {/* 1. Trilho de Navegação Lateral Estreito (WORKSPACE e CONNECTIONS) */}
      {viewport.isDesktop && isRailOpen && (
        <AccountRail
          currentView={currentView}
          isSystemAdmin={isSystemAdmin}
          brandName={workspaceBrandName}
          onSelectView={selectView}
          totalUnread={totalUnread}
          isDarkMode={isDarkMode}
        />
      )}

      {viewport.isDesktop && currentView === "inbox" && (
        <AccountsSidebar
          instances={instances}
          selectedAccountId={filters.selectedAccountId}
          onSelectAccount={(name) => updateFilters({ selectedAccountId: name })}
          onOpenNewConnection={() => {
            // O atalho lateral usa o mesmo fluxo nomeado da tela de Conexões.
            // Evita criar IDs automáticos que o operador não reconhece.
            setCurrentView("conexoes");
          }}
          onSync={syncEvolution}
          totalUnread={totalUnread}
          unreadByInstance={unreadByInstance}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Área Principal Direita com Top Bar e Conteúdo */}
      <div className="inboxos-workspace-frame flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar (Idêntico aos prints 2 e 5) */}
        {viewport.isDesktop ? (
          <header
            className={`app-topbar h-14 px-4 border-b flex items-center justify-between shrink-0 select-none z-30 transition-colors ${
              isDarkMode
                ? "bg-[#0b0b0c]/94 backdrop-blur-md border-white/[0.065] text-white"
                : "bg-[#fafaf8]/94 backdrop-blur-md border-black/[0.07] text-neutral-900"
            }`}
          >
            {/* Lado Esquerdo: Toggle de Barra Lateral e Título da Conexão */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsRailOpen(!isRailOpen)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "text-neutral-500 hover:text-white hover:bg-white/[0.055]"
                    : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
                }`}
                title={isRailOpen ? "Ocultar navegação" : "Mostrar navegação"}
                aria-label={isRailOpen ? "Ocultar navegação" : "Mostrar navegação"}
                aria-expanded={isRailOpen}
              >
                <SidebarSimple size={18} weight="bold" />
              </button>

              <div className="flex min-w-0 items-center gap-2.5">
                {currentView === "inbox" && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--whatsapp)]" />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${isDarkMode ? "text-zinc-600" : "text-neutral-400"}`}
                  >
                    {currentViewMeta.eyebrow}
                  </p>
                  <h2 className="truncate text-[12px] font-semibold tracking-[-0.01em]">
                    {currentView === "inbox"
                      ? activeInstance
                        ? activeInstance.alias || activeInstance.instanceName
                        : `Inbox · ${instances.filter((i) => i.state === "open").length} conexões ativas`
                      : currentViewMeta.title}
                  </h2>
                </div>
              </div>
            </div>

            {/* Lado Direito: Busca Global, Toggle de Tema e Perfil OP */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Campo de Busca Global */}
              {currentView === "inbox" && (
                <div
                  className={`hidden items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors lg:flex ${
                    isDarkMode
                      ? "border-white/[0.07] bg-white/[0.035] text-white focus-within:border-white/[0.14]"
                      : "border-black/[0.07] bg-black/[0.025] text-neutral-900 focus-within:border-black/[0.14]"
                  }`}
                >
                  <MagnifyingGlass size={14} className="shrink-0 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Buscar conversas"
                    value={filters.searchQuery}
                    onChange={(e) => updateFilters({ searchQuery: e.target.value })}
                    aria-label="Buscar conversas"
                    className="w-44 bg-transparent text-xs placeholder-neutral-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Alternador de Tema */}
              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "text-neutral-500 hover:text-white hover:bg-white/[0.055]"
                    : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
                }`}
                title={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
                aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
              >
                {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>

              {/* Badge de Perfil do Operador (OP) */}
              <div className="relative">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center p-1 border ${
                    isDarkMode
                      ? "bg-white/[0.055] border-white/[0.08] text-zinc-300"
                      : "bg-black/[0.04] border-black/[0.08] text-neutral-700"
                  }`}
                  title={`Workspace ${workspaceBrandName}`}
                >
                  <img
                    src={
                      workspaceBrandAssetUrls[isDarkMode ? "logoDarkUrl" : "logoLightUrl"]
                        ? workspaceBrandAssetUrls[isDarkMode ? "logoDarkUrl" : "logoLightUrl"]!
                        : isDarkMode
                          ? "/logo-dark-mode.png"
                          : "/logo-light-mode.png"
                    }
                    alt={workspaceBrandName}
                    className="h-5 w-5 object-contain select-none"
                  />
                </div>
              </div>
            </div>
          </header>
        ) : (
          <header
            className={`mobile-topbar ${isDarkMode ? "mobile-topbar-dark" : "mobile-topbar-light"}`}
          >
            <div className="min-w-0">
              <p className="mobile-eyebrow">{currentViewMeta.eyebrow}</p>
              <h1 className="mobile-title">{currentViewMeta.title}</h1>
            </div>
            <div className="flex items-center gap-1.5">
              {currentView === "inbox" && (
                <button
                  type="button"
                  className="mobile-account-pill"
                  onClick={() => setCurrentView("conexoes")}
                  aria-label="Gerenciar conexões WhatsApp"
                >
                  <span className="status-dot" />
                  {instances.filter((i) => i.state === "open").length}
                  <CaretDown size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                className="mobile-icon-button"
                aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                type="button"
                onClick={() => setCurrentView("configuracoes")}
                className="mobile-profile-button flex items-center justify-center p-1"
                aria-label="Abrir configurações"
              >
                <img
                  src={
                    workspaceBrandAssetUrls[isDarkMode ? "logoDarkUrl" : "logoLightUrl"]
                      ? workspaceBrandAssetUrls[isDarkMode ? "logoDarkUrl" : "logoLightUrl"]!
                      : isDarkMode
                        ? "/logo-dark-mode.png"
                        : "/logo-light-mode.png"
                  }
                  alt={workspaceBrandName}
                  className="h-4 w-4 object-contain select-none"
                />
              </button>
            </div>
          </header>
        )}

        {/* 2. Tela de Conexões WhatsApp / Gerenciador Completo */}
        {currentView === "conexoes" && (
          <div className="flex-1 overflow-auto">
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center p-12 text-sm text-neutral-400">
                  Carregando conexões...
                </div>
              }
            >
              <ConnectionManager
                instances={instances}
                onSelectInstance={(name) => {
                  updateFilters({ selectedAccountId: name });
                  setCurrentView("inbox");
                }}
                onDeleteInstance={deleteInstance}
                onRefresh={refetchInstances}
                isDarkMode={isDarkMode}
              />
            </Suspense>
          </div>
        )}

        {/* 3. Tela Principal de Atendimento (Cockpit Multicontas) */}
        {currentView === "inbox" && (
          <div className="flex-1 flex h-full overflow-hidden">
            {/* Lista de Conversas Filtradas */}
            {composition.showConversationList && (
              <ConversationList
                conversations={conversations}
                selectedChatId={activeChat?.id || null}
                onSelectChat={handleSelectChat}
                filters={filters}
                onUpdateFilters={updateFilters}
                isDarkMode={isDarkMode}
                onSyncProfilePictures={async () => {
                  await syncEvolution(false);
                  await syncProfilePictures();
                  await fetchConversations();
                }}
                onOpenImportExport={() => setIsImportExportOpen(true)}
                isLoading={isLoadingConversations}
                error={conversationsError}
                hasMore={Boolean(nextCursor)}
                onLoadMore={() => void loadMore()}
                layout={viewport.isDesktop ? "desktop" : "mobile"}
              />
            )}

            {/* Área Central de Conversa Ativa */}
            {composition.showChatPane && activeChat ? (
              <div
                key={activeChat.id}
                className="flex-1 flex flex-col h-full overflow-hidden transition-colors"
              >
                <ChatHeader
                  conversation={activeChat}
                  onTogglePin={() => updateChatFlags(activeChat.id, { pinned: !activeChat.pinned })}
                  onToggleArchive={() =>
                    updateChatFlags(activeChat.id, { archived: !activeChat.archived })
                  }
                  onOpenExport={() => setIsImportExportOpen(true)}
                  onCreateLead={handleCreateLead}
                  onToggleAi={(paused) => void toggleAiState(activeChat.id, paused)}
                  onHandoverAction={(action) => updateHandover(activeChat.id, action)}
                  onBack={() => setSelectedChatId(null)}
                  isDarkMode={isDarkMode}
                  layout={viewport.isDesktop ? "desktop" : "mobile"}
                />

                <MessageTimeline
                  messages={messages}
                  isLoading={isLoadingMessages}
                  error={messagesError}
                  onRetry={() => void refetchMessages()}
                  hasMore={hasMoreMessages}
                  onLoadPrevious={loadPreviousMessages}
                  onPreviewMedia={setPreviewMedia}
                  onReply={setReplyingTo}
                  onReact={(message, emoji) => void reactToMessage(message, emoji)}
                  isDarkMode={isDarkMode}
                  isGroup={activeChat.isGroup}
                  activePhone={activeChat.phone}
                  activeInstanceName={activeChat.instanceName}
                  activeInstanceId={activeChat.instanceId}
                  activeAvatar={activeChat.avatar}
                  activeName={activeChat.name}
                />

                <MessageComposer
                  chatId={activeChat.id}
                  onSendMessage={sendMessage}
                  onPresence={sendPresence}
                  replyingTo={replyingTo}
                  onCancelReply={() => {
                    // Um envio do chat anterior pode concluir depois da troca de conversa.
                    // Não apagar a citação que o usuário já escolheu no chat atual.
                    if (activeChatIdRef.current === activeChat.id) setReplyingTo(null);
                  }}
                  isDarkMode={isDarkMode}
                  isGroup={activeChat.isGroup}
                  canSend={activeChat.canSend}
                  isAnnouncement={activeChat.isAnnouncement}
                  isAdmin={activeChat.isAdmin}
                />
              </div>
            ) : viewport.isDesktop ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-neutral-500 animate-smooth-in">
                <ChatCircleText size={56} className="mb-3 text-neutral-500/35" />
                <p className="text-base font-bold text-neutral-400 mb-1">
                  Nenhuma conversa selecionada
                </p>
                <p className="text-xs text-neutral-500 max-w-sm">
                  Selecione uma conversa na lista ao lado ou selecione outra conta WhatsApp
                  conectada.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {currentView === "dashboard" && <DashboardView isDarkMode={isDarkMode} />}
        {currentView === "crm" && <CrmView isDarkMode={isDarkMode} />}
        {currentView === "clientes" && <ClientsView isDarkMode={isDarkMode} />}
        {currentView === "follow-up" && <FollowUpView isDarkMode={isDarkMode} />}
        {currentView === "calendario" && <CalendarView isDarkMode={isDarkMode} />}
        {currentView === "agentes" && <AgentsView isDarkMode={isDarkMode} />}
        {currentView === "configuracoes" && <SettingsView isDarkMode={isDarkMode} />}
        {composition.showMobileDock && (
          <MobileDock
            currentView={currentView}
            onSelectView={selectView}
            isSystemAdmin={isSystemAdmin}
            onOpenAdmin={() => void navigate({ to: "/admin" })}
            unread={totalUnread}
            dark={isDarkMode}
          />
        )}
      </div>

      {/* Modal de Conexão Rápida / QR Code */}
      {/* Modal de Importação e Exportação */}
      {isImportExportOpen && (
        <Suspense fallback={null}>
          <ImportExportModal
            isOpen={isImportExportOpen}
            onClose={() => setIsImportExportOpen(false)}
            activeChat={activeChat}
            messages={messages}
            allConversations={conversations}
            onImportComplete={() => {
              fetchConversations();
              syncEvolution();
            }}
            isDarkMode={isDarkMode}
          />
        </Suspense>
      )}

      {/* Modal de Pré-visualização de Mídias */}
      {previewMedia && (
        <Suspense fallback={null}>
          <MediaPreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />
        </Suspense>
      )}
    </div>
  );
}
