import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Conversation, InboxFilters } from "../types";
import { mapChatDto } from "../mappers/chatMapper";
import { apiFetch } from "@/lib/api-fetch";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";

type UseConversationsOptions = {
  enableProfileBackfill?: boolean;
};

export function useConversations({ enableProfileBackfill = true }: UseConversationsOptions = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const markReadInFlight = useRef(new Set<string>());
  // Several sources can request a refresh at the same time (realtime events,
  // focus, polling and an explicit refresh).  A slower response must never
  // replace the snapshot produced by a newer request, otherwise the selected
  // chat can briefly disappear from the list.
  const fetchSequenceRef = useRef(0);

  const [filters, setFilters] = useState<InboxFilters>({
    searchQuery: "",
    selectedAccountId: "all",
    showArchived: false,
    onlyUnread: false,
    showGroups: true,
    audienceFilter: "all",
    tagFilter: null,
  });
  const avatarRepairInFlight = useRef(new Set<string>());

  const fetchConversations = useCallback(async (cursor?: string | null, silent = false) => {
    const requestSequence = ++fetchSequenceRef.current;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const url = cursor
        ? `/api/chats/?cursor=${encodeURIComponent(cursor)}&limit=1000`
        : "/api/chats/?limit=1000";
      const res = await apiFetch(url, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        if (res.status === 401) {
          if (!silent) setIsLoading(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (requestSequence !== fetchSequenceRef.current) return;
      const list = Array.isArray(data) ? data : (data?.chats ?? []);
      const mapped = list.map((item: unknown) => mapChatDto(item));

      setConversations((prev) => {
        if (!cursor) {
          if (prev.length === 0) return mapped;

          // Reconciliação estável por chave única (id ou instance:phone)
          // Isso impede que itens pisquem ou desapareçam quando a lista recarrega
          const prevMap = new Map<string, Conversation>();
          for (const c of prev) {
            prevMap.set(c.id, c);
            if (c.phone) prevMap.set(`${c.instanceName || ""}:${c.phone}`, c);
          }

          let hasChanges = prev.length !== mapped.length;
          const merged = mapped.map((newChat: Conversation) => {
            const oldChat =
              prevMap.get(newChat.id) ||
              (newChat.phone
                ? prevMap.get(`${newChat.instanceName || ""}:${newChat.phone}`)
                : null);
            if (!oldChat) {
              hasChanges = true;
              return newChat;
            }

            const isSame =
              oldChat.id === newChat.id &&
              oldChat.unread === newChat.unread &&
              oldChat.lastMessage === newChat.lastMessage &&
              oldChat.timestamp === newChat.timestamp &&
              oldChat.name === newChat.name &&
              oldChat.avatar === newChat.avatar &&
              oldChat.pinned === newChat.pinned &&
              oldChat.archived === newChat.archived &&
              oldChat.canSend === newChat.canSend &&
              oldChat.isAnnouncement === newChat.isAnnouncement &&
              oldChat.isAdmin === newChat.isAdmin;

            if (!isSame) {
              hasChanges = true;
              return { ...oldChat, ...newChat };
            }
            return oldChat;
          });

          // Também preserva conversas criadas localmente via Realtime que ainda não vieram na 1ª página
          for (const oldChat of prev) {
            const inMapped = mapped.some(
              (m: Conversation) =>
                m.id === oldChat.id ||
                (m.phone &&
                  oldChat.phone &&
                  m.phone === oldChat.phone &&
                  m.instanceName === oldChat.instanceName),
            );
            if (!inMapped) {
              merged.push(oldChat);
              hasChanges = true;
            }
          }

          if (!hasChanges && prev.length === merged.length) {
            return prev;
          }
          return merged;
        }
        // Evita duplicatas ao paginar
        const ids = new Set(prev.map((c) => c.id));
        return [...prev, ...mapped.filter((c: Conversation) => !ids.has(c.id))];
      });

      if (requestSequence === fetchSequenceRef.current) {
        setNextCursor(data?.nextCursor ?? null);
      }
    } catch (err: unknown) {
      if (!silent && requestSequence === fetchSequenceRef.current) {
        setError(err instanceof Error ? err.message : "Erro ao carregar conversas");
      }
    } finally {
      if (!silent && requestSequence === fetchSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // O histórico não é importado. Mensagens novas chegam via webhook; esta ação
  // atualiza somente agenda e grupos da conexão atual.
  const syncEvolution = useCallback(async (_fast = false) => {
    // Repair the callback before metadata sync; Evolution can stay open after
    // losing its URL/headers during a restart.
    for (const phase of ["webhook", "contacts", "groups"] as const) {
      const query = `?phase=${phase}`;
      const response = await apiFetch(`/api/sync/evolution${query}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Falha na sincronização (${response.status})`);
      }
    }
  }, []);

  // Um único fluxo incremental do Worker substitui os canais anônimos do
  // Supabase e evita uma assinatura por componente/linha.
  useEffect(() => {
    void fetchConversations();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshRunning = false;
    let refreshQueued = false;
    const runRefresh = async () => {
      if (refreshRunning) {
        refreshQueued = true;
        return;
      }
      refreshRunning = true;
      do {
        refreshQueued = false;
        await fetchConversations(null, true);
      } while (refreshQueued);
      refreshRunning = false;
    };
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void runRefresh();
      }, 200);
    };
    const unsubscribeChats = subscribeInboxEvent("chats:change", refresh);
    const unsubscribeContacts = subscribeInboxEvent("whatsapp_contacts:change", refresh);

    // Workspace activation changes the x-workspace-id sent by apiFetch. Clear
    // the previous tenant's list immediately and reload the new snapshot;
    // realtimeSocket separately resets its event cursor on the same signal.
    const handleWorkspaceChange = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      // Invalidate every in-flight response before switching tenant data.
      fetchSequenceRef.current += 1;
      setConversations([]);
      setNextCursor(null);
      void fetchConversations(null, false);
    };
    window.addEventListener("inboxos:workspace-change", handleWorkspaceChange);

    // Reconciliação lenta cobre perda temporária de rede sem gerar carga fixa alta.
    const runBackgroundSync = async () => {
      if (document.visibilityState === "visible") {
        await fetchConversations(null, true);
      }
    };

    const pollInterval = setInterval(() => {
      void runBackgroundSync();
    }, 30_000);

    // Reconcilia imediatamente ao recuperar o foco da janela quando o usuário retorna à aba
    const handleFocus = () => {
      void runBackgroundSync();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(pollInterval);
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribeChats();
      unsubscribeContacts();
      window.removeEventListener("inboxos:workspace-change", handleWorkspaceChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchConversations]);

  // Migração e sincronização de fotos de perfil do WhatsApp
  const syncProfilePictures = useCallback(
    async (target?: { phone: string; instanceName?: string | null }) => {
      try {
        const params = new URLSearchParams();
        if (target?.phone) params.set("phone", target.phone.replace(/\D/g, ""));
        if (target?.instanceName) params.set("instanceName", target.instanceName);
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const response = await apiFetch(`/api/chats/sync-pfp${suffix}`, { method: "POST" });
        if (!response.ok) throw new Error(`Falha ao atualizar fotos (${response.status})`);
        // The backfill writes asynchronously in the server. Reconcile the list
        // immediately when it actually found photos so the operator does not
        // have to wait for the 30s conversation poll (or switch workspaces) to
        // see the new avatar. Keep this conditional to avoid an unnecessary
        // fetch on batches where Evolution has no public photo for the contact.
        const payload = (await response.json().catch(() => null)) as {
          updated?: unknown;
        } | null;
        if (Number(payload?.updated ?? 0) > 0) {
          await fetchConversations(null, true);
        }
      } catch {
        // Background silencioso
      }
    },
    [fetchConversations],
  );

  // O backfill é paginado no servidor para não bloquear a rota; repetimos em
  // baixa frequência até que todas as fotos disponíveis na Evolution sejam
  // persistidas em contatos e conversas.
  useEffect(() => {
    if (!enableProfileBackfill) return;
    void syncProfilePictures();
    const interval = setInterval(() => void syncProfilePictures(), 60_000);
    return () => clearInterval(interval);
  }, [enableProfileBackfill, syncProfilePictures]);

  // A provider profile URL can expire after it was persisted. A failed image
  // requests a single, instance-scoped refresh instead of waiting for the
  // broad 60s backfill or hammering Evolution on every render.
  useEffect(() => {
    const handleAvatarError = (event: Event) => {
      const detail = (event as CustomEvent<{ phone?: string; instanceName?: string }>).detail;
      const phone = String(detail?.phone ?? "").replace(/\D/g, "");
      const instanceName = String(detail?.instanceName ?? "").trim();
      if (!phone || !instanceName) return;
      const key = `${instanceName}:${phone}`;
      if (avatarRepairInFlight.current.has(key)) return;
      avatarRepairInFlight.current.add(key);
      void syncProfilePictures({ phone, instanceName }).finally(() => {
        window.setTimeout(() => avatarRepairInFlight.current.delete(key), 30_000);
      });
    };
    window.addEventListener("inboxos:avatar-error", handleAvatarError);
    return () => window.removeEventListener("inboxos:avatar-error", handleAvatarError);
  }, [syncProfilePictures]);

  // P2-08: Filtro completamente blindado contra valores nulos/indefinidos
  const filteredConversations = useMemo(() => {
    const list = conversations.filter((chat) => {
      if (filters.showArchived) {
        if (!chat.archived) return false;
      } else {
        if (chat.archived) return false;
      }

      // Filtro estrito: se a aba ativada for 'groups', EXIGE chat.isGroup = true (nenhum contato individual é permitido)
      if (filters.typeFilter === "groups") {
        if (!chat.isGroup) return false;
      } else if (filters.typeFilter === "direct") {
        if (chat.isGroup) return false;
      } else if (!filters.showGroups && chat.isGroup) {
        return false;
      }

      if (filters.audienceFilter === "leads" && chat.contactCategory !== "lead") return false;
      if (filters.audienceFilter === "personal" && chat.contactCategory !== "personal")
        return false;

      if (filters.onlyUnread && !(chat.unread > 0)) return false;
      if (filters.tagFilter && chat.tag !== filters.tagFilter) return false;

      if (filters.selectedAccountId !== "all" && chat.instanceName !== filters.selectedAccountId) {
        return false;
      }

      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        const nameMatch = String(chat.name ?? "")
          .toLowerCase()
          .includes(q);
        const phoneMatch = String(chat.phone ?? "").includes(q);
        const msgMatch = String(chat.lastMessage ?? "")
          .toLowerCase()
          .includes(q);
        return nameMatch || phoneMatch || msgMatch;
      }

      return true;
    });

    // Prevenção inteligente contra conversas duplicadas (LIDs vs Telefones vs IDs)
    const seenIds = new Set<string>();
    const keyMap = new Map<string, Conversation>();

    for (const chat of list) {
      if (seenIds.has(chat.id)) continue;
      seenIds.add(chat.id);

      const phoneClean = (chat.phone || "").replace(/\D/g, "");
      const key = `${chat.instanceName || "default"}:${phoneClean}`;

      const existing = keyMap.get(key);
      if (!existing) {
        keyMap.set(key, chat);
      } else {
        // A conversa com a data mais recente tem precedência absoluta
        const isChatNewer =
          new Date(chat.timestamp || 0).getTime() >= new Date(existing.timestamp || 0).getTime();
        const primary = isChatNewer ? chat : existing;
        const secondary = isChatNewer ? existing : chat;

        const prefersAvatar = primary.avatar || secondary.avatar || null;
        const prefersName =
          primary.name && !primary.name.startsWith("+")
            ? primary.name
            : secondary.name || primary.name;

        keyMap.set(key, {
          ...primary,
          avatar: prefersAvatar,
          name: prefersName,
          unread: Math.max(primary.unread, secondary.unread),
        });
      }
    }

    const deduplicated = Array.from(keyMap.values());

    return deduplicated.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });
  }, [conversations, filters]);

  // P1-02 & P2-06: Alteração atômica da IA com rollback
  const toggleAiState = useCallback(
    async (chatId: string, paused: boolean) => {
      const previous = [...conversations];
      setConversations((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, aiPaused: paused } : c)),
      );

      try {
        const res = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/ai-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused }),
        });
        if (!res.ok) throw new Error("Falha ao atualizar IA");
      } catch {
        // Rollback otimista
        setConversations(previous);
      }
    },
    [conversations],
  );

  const updateHandover = useCallback(
    async (chatId: string, action: "accept" | "resolve" | "cancel") => {
      const previous = [...conversations];
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== chatId) return conversation;
          if (action === "accept")
            return { ...conversation, aiPaused: true, handoverStatus: "in_progress" };
          return {
            ...conversation,
            aiPaused: false,
            humanHandoff: false,
            handoverStatus: action === "resolve" ? "resolved" : "canceled",
          };
        }),
      );
      try {
        const response = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/handover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) throw new Error("Falha ao atualizar atendimento humano");
      } catch {
        setConversations(previous);
      }
    },
    [conversations],
  );

  const updateChatFlags = useCallback(
    async (chatId: string, update: Partial<Conversation>) => {
      const previous = [...conversations];
      setConversations((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...update } : c)));

      try {
        const res = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/flags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!res.ok) throw new Error("Falha ao atualizar conversa");
      } catch {
        setConversations(previous);
      }
    },
    [conversations],
  );

  const markChatRead = useCallback(async (chatId: string) => {
    if (markReadInFlight.current.has(chatId)) return;
    markReadInFlight.current.add(chatId);
    let previousUnread: number | null = null;
    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== chatId) return conversation;
        previousUnread = conversation.unread;
        return { ...conversation, unread: 0 };
      }),
    );
    try {
      const response = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/read`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Falha ao marcar conversa como lida (${response.status})`);
    } catch {
      // Only restore the optimistic counter when a realtime update did not
      // already bring in a newer unread value while the request was pending.
      if (typeof previousUnread === "number") {
        const unreadToRestore = previousUnread;
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === chatId && conversation.unread === 0
              ? { ...conversation, unread: unreadToRestore }
              : conversation,
          ),
        );
      }
    } finally {
      markReadInFlight.current.delete(chatId);
    }
  }, []);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    isLoading,
    error,
    nextCursor,
    filters,
    setFilters,
    updateFilters: (patch: Partial<InboxFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    loadMore: () => nextCursor && fetchConversations(nextCursor),
    refetch: () => fetchConversations(),
    fetchConversations: () => fetchConversations(null, false),
    syncProfilePictures,
    syncEvolution,
    updateChatFlags,
    markChatRead,
    toggleAiState,
    updateHandover,
  };
}
