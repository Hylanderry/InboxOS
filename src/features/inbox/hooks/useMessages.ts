import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatMessage, MessageType } from "../types";
import { mapMessageDto } from "../mappers/messageMapper";
import { playNotificationSound, playSentSound } from "@/lib/sound";
import { WhatsAppToast } from "@/components/ui/ToastProvider";
import { apiFetch } from "@/lib/api-fetch";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";
import { applyChatScopedUpdate } from "./chat-scoped-update";

interface SendMessageInput {
  text?: string | undefined;
  media?: string | undefined;
  mediaFile?: Blob | undefined;
  mediaPath?: string | undefined;
  mimetype?: string | undefined;
  fileName?: string | undefined;
  duration?: number | undefined;
  type?: MessageType | undefined;
  quotedMessageId?: string | undefined;
  quotedMessage?: ChatMessage["quotedMessage"] | undefined;
  clientMessageId?: string | undefined;
}

function errorDetails(error: unknown, fallback: string): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message || fallback };
  return { name: "", message: fallback };
}

/**
 * Deduplica mensagens com segurança de três chaves: ID, externalId e clientMessageId
 */
export function deduplicateMessages(list: ChatMessage[]): ChatMessage[] {
  const seenIds = new Set<string>();
  const seenExtIds = new Set<string>();
  const seenClientIds = new Set<string>();
  const result: ChatMessage[] = [];

  // Percorre do fim para o início para que registros confirmados pelo banco sobrescrevam os otimistas
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;

    // Ignora mensagens fantasmas vazias (sem texto, sem mídia/arquivo e não deletadas)
    // Keep a media message even while its private object is being repaired.
    // Dropping audio/sticker rows with a temporary null URL made the timeline
    // unable to trigger the bounded Evolution media rehydration flow.
    const hasMediaType = ["image", "video", "audio", "document", "sticker"].includes(m.type);
    const hasContent = Boolean(
      (m.text && m.text.trim()) ||
      m.mediaUrl ||
      m.audioUrl ||
      m.fileUrl ||
      m.type === "deleted" ||
      hasMediaType,
    );
    if (!hasContent) continue;

    if (m.clientMessageId && seenClientIds.has(m.clientMessageId)) continue;
    if (m.externalId && seenExtIds.has(m.externalId)) continue;
    if (seenIds.has(m.id)) continue;

    seenIds.add(m.id);
    if (m.externalId) seenExtIds.add(m.externalId);
    if (m.clientMessageId) seenClientIds.add(m.clientMessageId);
    result.unshift(m);
  }

  // Ordenação cronológica estrita ascendente (mais antigas primeiro, mais recentes no fim)
  result.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || "").localeCompare(b.id || "");
  });

  return result;
}

// Cache em memória de mensagens por conversa para troca instantânea (0ms de delay)
const messagesCache = new Map<string, ChatMessage[]>();
const MAX_CACHED_CHATS = 50;

function cacheMessages(chatId: string, messages: ChatMessage[]) {
  messagesCache.delete(chatId);
  messagesCache.set(chatId, messages);
  while (messagesCache.size > MAX_CACHED_CHATS) {
    const oldest = messagesCache.keys().next().value;
    if (!oldest) break;
    messagesCache.delete(oldest);
  }
}

export function useMessages(
  chatId: string | null,
  instanceName: string | null,
  phone: string | null,
  isGroup = false,
) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (chatId && messagesCache.has(chatId)) {
      return messagesCache.get(chatId)!;
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return Boolean(chatId && !messagesCache.has(chatId));
  });
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [displayedChatId, setDisplayedChatId] = useState(chatId);

  const activeChatIdRef = useRef<string | null>(chatId);
  activeChatIdRef.current = chatId;
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaRepairAttemptedRef = useRef(new Set<string>());

  // Atualiza cache em memória sempre que as mensagens mudam
  const updateMessagesState = useCallback(
    (chat: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        // A resposta de uma requisição pode chegar após o operador trocar de chat.
        // Atualizar somente o cache do chat antigo; nunca inserir suas mensagens
        // na lista que o React está exibindo para outra conversa.
        const { visible, target } = applyChatScopedUpdate(
          activeChatIdRef.current,
          chat,
          prev,
          messagesCache.get(chat) ?? [],
          (base) => deduplicateMessages(updater(base)),
        );
        cacheMessages(chat, target);
        return visible;
      });
    },
    [],
  );

  const fetchMessages = useCallback(
    async (before?: string | null) => {
      if (!chatId) {
        setMessages([]);
        setIsLoading(false);
        return;
      }

      // Se for carregamento inicial e não estiver no cache, ativa loading
      if (!before && !messagesCache.has(chatId)) {
        setIsLoading(true);
      }

      // Cancela requisição anterior se houver
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setError(null);
      try {
        const url = before
          ? `/api/chats/${encodeURIComponent(chatId)}/messages?before=${encodeURIComponent(before)}&limit=50`
          : `/api/chats/${encodeURIComponent(chatId)}/messages?limit=50`;

        const res = await apiFetch(url, { signal: controller.signal });
        if (!res.ok) {
          if (res.status === 401) {
            setIsLoading(false);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        // Se o usuário já trocou para outro chat enquanto a requisição rodava, descarta
        if (activeChatIdRef.current !== chatId) return;

        const data = await res.json();
        // Também valida após o parse assíncrono para não sobrescrever paginação
        // nem loading com a resposta do chat que deixou de estar ativo.
        if (controller.signal.aborted || activeChatIdRef.current !== chatId) return;
        const rawList = Array.isArray(data?.messages) ? data.messages : [];
        const mapped = rawList.map((message: unknown) => mapMessageDto(message));

        setMessages((prev) => {
          if (activeChatIdRef.current !== chatId) return prev;
          let nextMessages: ChatMessage[];
          if (!before) {
            const pendingOptimistic = prev.filter(
              (m) => m.status === "pending" || m.id.startsWith("optimistic-"),
            );
            nextMessages = deduplicateMessages([...mapped, ...pendingOptimistic]);
          } else {
            nextMessages = deduplicateMessages([...mapped, ...prev]);
          }
          cacheMessages(chatId, nextMessages);
          return nextMessages;
        });

        setNextCursor(data?.nextCursor || null);
        setHasMore(Boolean(data?.hasMore));
      } catch (error: unknown) {
        const details = errorDetails(error, "Erro ao carregar mensagens");
        if (details.name === "AbortError") return;
        if (activeChatIdRef.current === chatId) {
          setError(details.message);
        }
      } finally {
        if (activeChatIdRef.current === chatId) {
          setIsLoading(false);
        }
      }
    },
    [chatId],
  );

  // Troca de chat instantânea: inicializa imediatamente com cache ou reseta estado
  useEffect(() => {
    setDisplayedChatId(chatId);
    setError(null);
    setNextCursor(null);
    setHasMore(false);

    if (!chatId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    // Se já estiver em cache, exibe instantaneamente sem atraso ou tela em branco
    if (messagesCache.has(chatId)) {
      setMessages(messagesCache.get(chatId)!);
      setIsLoading(false);
    } else {
      setMessages([]);
      setIsLoading(true);
    }

    fetchMessages();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [chatId, fetchMessages]);

  // A webhook can persist the message before Evolution/storage finishes
  // returning its base64. Repair only existing rows, once per conversation,
  // without importing history or blocking the first paint of the timeline.
  useEffect(() => {
    if (!chatId || !instanceName || isLoading || messages.length === 0) return;
    const needsRepair = messages.some(
      (message) =>
        message.type !== "text" &&
        message.type !== "deleted" &&
        !message.mediaUrl &&
        Boolean(message.externalId),
    );
    if (!needsRepair || mediaRepairAttemptedRef.current.has(chatId)) return;
    mediaRepairAttemptedRef.current.add(chatId);

    let active = true;
    void apiFetch(
      `/api/chats/sync-media?instanceName=${encodeURIComponent(instanceName)}&chatId=${encodeURIComponent(chatId)}&limit=12`,
      { method: "POST" },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as { updated?: unknown } | null;
      })
      .then((payload) => {
        if (active && Number(payload?.updated ?? 0) > 0) void fetchMessages();
      })
      .catch(() => {
        // Media repair is best-effort; the timeline remains usable with its
        // explicit unavailable-media fallback and can retry on a new message.
      });

    return () => {
      active = false;
    };
  }, [chatId, fetchMessages, instanceName, isLoading, messages]);

  // O Worker publica uma única sequência incremental para toda a aba.
  useEffect(() => {
    if (!chatId) return;
    return subscribeInboxEvent("messages:change", (event) => {
      const row = event?.payload;
      if (!row || row.chat_id !== chatId || activeChatIdRef.current !== chatId) return;
      const operation = String(event.event_type || "").split(".")[1];
      if (operation === "delete") {
        updateMessagesState(chatId, (previous) =>
          previous.filter((message) => message.id !== row.id),
        );
        return;
      }
      const message = mapMessageDto(row);
      if (message.type !== "text" && message.type !== "deleted" && !message.mediaUrl) {
        mediaRepairAttemptedRef.current.delete(chatId);
      }
      if (operation === "insert" && message.sender === "client") playNotificationSound();
      updateMessagesState(chatId, (previous) => {
        const index = previous.findIndex(
          (candidate) =>
            candidate.id === message.id ||
            Boolean(
              message.clientMessageId && candidate.clientMessageId === message.clientMessageId,
            ) ||
            Boolean(message.externalId && candidate.externalId === message.externalId),
        );
        if (index < 0) return [...previous, message];
        const next = [...previous];
        next[index] = { ...next[index], ...message };
        return next;
      });
      // Realtime rows carry the private storage path, which an <img>/<audio>
      // element cannot request with the authenticated bearer header. Refresh
      // once to replace it with the signed URL returned by the messages API.
      if (message.mediaUrl?.startsWith("/api/media/")) void fetchMessages();
    });
  }, [chatId, fetchMessages, updateMessagesState]);

  // O webhook e o Realtime são a via principal. Uma única reconciliação ocorre
  // quando a janela volta ao foco ou a rede retorna, sem polling no Worker.
  useEffect(() => {
    if (!chatId) return;
    const reconcile = () => {
      if (activeChatIdRef.current !== chatId || document.visibilityState === "hidden") return;
      void fetchMessages();
    };

    const pollInterval = setInterval(() => {
      if (activeChatIdRef.current === chatId && document.visibilityState === "visible") {
        void fetchMessages();
      }
    }, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [chatId, fetchMessages]);

  useEffect(() => {
    const handleWorkspaceChange = () => {
      messagesCache.clear();
      setMessages([]);
      setNextCursor(null);
      setHasMore(false);
      setDisplayedChatId(null);
    };
    window.addEventListener("inboxos:workspace-change", handleWorkspaceChange);
    return () => window.removeEventListener("inboxos:workspace-change", handleWorkspaceChange);
  }, []);

  /**
   * Envia uma mensagem com client_message_id UUID e reconciliação atômica
   */
  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<boolean> => {
      if (!phone || !instanceName || !chatId) return false;

      const clientMessageId = input.clientMessageId || crypto.randomUUID();
      const tempId = `optimistic-${clientMessageId}`;

      const optimisticMsg: ChatMessage = {
        id: tempId,
        chatId: chatId || "",
        clientMessageId,
        sender: "agent",
        type: input.type || "text",
        text: input.text || "",
        mediaUrl: input.media || null,
        audioUrl: input.type === "audio" ? input.media : null,
        fileUrl: input.type === "document" ? input.media : null,
        fileName: input.fileName || null,
        duration: input.duration || null,
        mimetype: input.mimetype || null,
        quotedMessage: input.quotedMessage || null,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        createdAt: new Date().toISOString(),
        status: "pending",
        mediaPath: input.mediaPath || null,
      };

      updateMessagesState(chatId, (prev) => [...prev, optimisticMsg]);

      try {
        let mediaPath: string | undefined = input.mediaPath;
        if (input.mediaFile) {
          const uploadRequest = await apiFetch("/api/media/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientMessageId,
              fileName: input.fileName || `audio-${clientMessageId}.ogg`,
              mimetype: input.mimetype || input.mediaFile.type || "application/octet-stream",
              size: input.mediaFile.size,
            }),
          });
          const upload = await uploadRequest.json();
          if (!uploadRequest.ok || !upload.success || !upload.path || !upload.token) {
            throw new Error(upload.error || "Falha ao preparar upload");
          }
          const { supabase } = await import("@/integrations/supabase/client");
          const { error: uploadError } = await supabase.storage
            .from("chat-media")
            .uploadToSignedUrl(upload.path, upload.token, input.mediaFile, {
              contentType: input.mimetype || input.mediaFile.type || "application/octet-stream",
            });
          if (uploadError) throw new Error("Falha no upload da mídia");
          mediaPath = upload.path;
          updateMessagesState(chatId, (prev) =>
            prev.map((message) => (message.id === tempId ? { ...message, mediaPath } : message)),
          );
        }

        const res = await apiFetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceName,
            phone,
            text: input.text,
            media: input.mediaFile ? undefined : input.media,
            mediaPath,
            mimetype: input.mimetype,
            fileName: input.fileName,
            type: input.type,
            duration: input.duration,
            clientMessageId,
            quotedMessageId: input.quotedMessageId,
            quotedMessage: input.quotedMessage,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Falha ao enviar mensagem");
        }

        // Reconcilia a mensagem otimista com o ID definitivo do banco
        playSentSound();
        if (input.mediaFile && input.media?.startsWith("blob:")) URL.revokeObjectURL(input.media);
        updateMessagesState(chatId, (prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: data.message?.id || tempId,
                  externalId: data.message?.external_id || null,
                  mediaUrl: data.message?.media_url || m.mediaUrl,
                  mediaPath: data.message?.media_path || mediaPath || m.mediaPath,
                  audioUrl: m.type === "audio" ? data.message?.media_url || m.audioUrl : m.audioUrl,
                  fileUrl: m.type === "document" ? data.message?.media_url || m.fileUrl : m.fileUrl,
                  status: "sent",
                }
              : m,
          ),
        );
        if (mediaPath) await fetchMessages();
        return true;
      } catch (error: unknown) {
        const details = errorDetails(error, "Erro de envio");
        if (input.mediaFile && input.media?.startsWith("blob:")) {
          URL.revokeObjectURL(input.media);
        }
        updateMessagesState(chatId, (prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  status: "failed",
                  failedReason: details.message,
                }
              : m,
          ),
        );
        WhatsAppToast.sendFailed(phone, details.message, () => {
          void sendMessage({ ...input, clientMessageId });
        });
        return false;
      }
    },
    [chatId, fetchMessages, instanceName, phone, updateMessagesState],
  );

  const resendMessage = useCallback(
    async (failedMsg: ChatMessage): Promise<boolean> => {
      return sendMessage({
        text: failedMsg.text,
        media: undefined,
        mediaPath: failedMsg.mediaPath || undefined,
        type: failedMsg.type,
        fileName: failedMsg.fileName || undefined,
        duration: failedMsg.duration || undefined,
        mimetype: failedMsg.mimetype || undefined,
        clientMessageId: failedMsg.clientMessageId || undefined,
      });
    },
    [sendMessage],
  );

  const reactToMessage = useCallback(
    async (message: ChatMessage, emoji: string): Promise<boolean> => {
      if (!message.id || !chatId) return false;
      try {
        const response = await apiFetch("/api/messages/reaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: message.id, emoji }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        // The webhook/realtime event is authoritative (it includes the
        // provider's sender identity). Reconcile immediately for providers
        // that do not echo the reaction event back to the same connection.
        await fetchMessages();
        return true;
      } catch (error: unknown) {
        const details = errorDetails(error, "Falha ao atualizar reação");
        WhatsAppToast.networkError(details.message);
        return false;
      }
    },
    [chatId, fetchMessages],
  );

  const markAsRead = useCallback(async () => {
    if (!chatId) return;
    try {
      await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: "POST" });
    } catch {
      // Silencioso
    }
  }, [chatId]);

  const sendPresence = useCallback(
    async (presence: "composing" | "recording" | "paused") => {
      if (!phone) return;
      try {
        await apiFetch(`/api/chats/${encodeURIComponent(phone)}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            presence,
            instanceName: instanceName || undefined,
            isGroup,
          }),
        });
      } catch {
        // Silencioso
      }
    },
    [phone, instanceName, isGroup],
  );

  return {
    messages:
      displayedChatId === chatId
        ? messages
        : chatId && messagesCache.has(chatId)
          ? messagesCache.get(chatId)!
          : [],
    isLoading,
    error,
    hasMore,
    loadPreviousMessages: () => nextCursor && fetchMessages(nextCursor),
    sendMessage,
    resendMessage,
    reactToMessage,
    refetch: () => fetchMessages(),
    markAsRead,
    sendPresence,
  };
}
