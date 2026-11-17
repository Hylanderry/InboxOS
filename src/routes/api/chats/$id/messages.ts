import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { decodeCompositeCursor, encodeCompositeCursor } from "@/lib/pagination-cursor";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function errorMessage(error: unknown, fallback: string): string {
  return safePublicError(error, fallback);
}

export const Route = createFileRoute("/api/chats/$id/messages")({
  server: {
    handlers: {
      // Carrega mensagens paginadas por cursor de uma conversa específica (P1-12)
      GET: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        const chatId = params.id;
        if (!chatId) return json({ error: "Chat ID obrigatório" }, 400);

        try {
          const url = new URL(request.url);
          const before = decodeCompositeCursor("message", url.searchParams.get("before"));
          const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
          const limit = Math.min(Math.max(limitParam, 1), 100);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: chatIdentity, error: chatIdentityError } = await supabaseAdmin
            .from("chats")
            .select("instance_id")
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();
          if (chatIdentityError)
            return json(
              { error: safePublicError(chatIdentityError, "Falha ao validar a conversa") },
              500,
            );
          if (!chatIdentity?.instance_id)
            return json({ error: "Conversa não encontrada nesta conexão" }, 404);

          let query = supabaseAdmin
            .from("messages")
            .select("*")
            .eq("chat_id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_id", chatIdentity.instance_id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit + 1);

          if (before) {
            query = query.or(
              `created_at.lt.${before.timestamp},and(created_at.eq.${before.timestamp},id.lt.${before.id})`,
            );
          }

          const { data: messages, error } = await query;
          if (error)
            return json({ error: safePublicError(error, "Erro ao carregar mensagens") }, 500);

          const hasMore = (messages?.length ?? 0) > limit;
          const sliced = hasMore ? (messages ?? []).slice(0, limit) : (messages ?? []);

          // Inverte para retornar em ordem cronológica (mais antigas primeiro)
          const oldest = sliced.at(-1);
          const nextCursor =
            hasMore && oldest
              ? encodeCompositeCursor("message", { timestamp: oldest.created_at, id: oldest.id })
              : null;
          const chronological = [...sliced].reverse();

          // Browser media elements cannot attach the authenticated bearer
          // header used by apiFetch. Resolve private chat-media paths to
          // short-lived signed URLs before returning the message snapshot;
          // keep mediaPath so retries still use the tenant-scoped object.
          const signedMediaByMessage = new Map<string, string>();
          await Promise.all(
            chronological.map(async (message) => {
              const mediaUrl = typeof message.media_url === "string" ? message.media_url : "";
              if (!mediaUrl.startsWith("/api/media/")) return;
              const path = mediaUrl.slice("/api/media/".length);
              if (!path || path.includes("..") || !path.startsWith(`${auth.workspaceId}/`)) return;
              const { data: signed } = await supabaseAdmin.storage
                .from("chat-media")
                .createSignedUrl(path, 60 * 60);
              if (signed?.signedUrl) signedMediaByMessage.set(String(message.id), signed.signedUrl);
            }),
          );

          // Resolução dinâmica de nomes e avatares atualizados da agenda
          const senderPhones = [
            ...new Set(
              chronological
                .filter((m) => m.sender !== "agent" && m.sender_phone)
                .map((m) => String(m.sender_phone).replace(/\D/g, ""))
                .filter(Boolean),
            ),
          ];

          const contactsMap = new Map<
            string,
            { saved_name: string | null; push_name: string | null; profile_pic_url: string | null }
          >();
          const participantsMap = new Map<
            string,
            { display_name: string | null; profile_pic_url: string | null }
          >();

          if (senderPhones.length > 0) {
            const [contactsRes, participantsRes] = await Promise.all([
              supabaseAdmin
                .from("whatsapp_contacts")
                .select("phone, remote_jid, alternate_jid, saved_name, push_name, profile_pic_url")
                .eq("workspace_id", auth.workspaceId)
                .eq("instance_id", chatIdentity.instance_id)
                .in("phone", senderPhones),
              supabaseAdmin
                .from("group_participants")
                .select("participant_jid, phone_e164, display_name, profile_pic_url")
                .eq("workspace_id", auth.workspaceId)
                .eq("instance_id", chatIdentity.instance_id)
                .eq("chat_id", chatId)
                .in("phone_e164", senderPhones),
            ]);

            for (const c of contactsRes.data ?? []) {
              for (const identity of [c.phone, c.remote_jid, c.alternate_jid]) {
                const digits = identity ? String(identity).replace(/\D/g, "") : "";
                if (digits) contactsMap.set(digits, c);
              }
            }

            for (const p of participantsRes.data ?? []) {
              for (const identity of [p.phone_e164, p.participant_jid]) {
                const digits = identity ? String(identity).replace(/\D/g, "") : "";
                if (digits) participantsMap.set(digits, p);
              }
            }
          }

          return json({
            messages: chronological.map((msg) => {
              const resolvedMediaUrl = signedMediaByMessage.get(String(msg.id)) || msg.media_url;
              const cleanPhone = msg.sender_phone
                ? String(msg.sender_phone).replace(/\D/g, "")
                : "";
              let resolvedName = msg.sender_name;
              let resolvedAvatar = msg.sender_avatar;

              if (msg.sender !== "agent" && cleanPhone) {
                const contact = contactsMap.get(cleanPhone);
                const participant = participantsMap.get(cleanPhone);
                const bestName =
                  contact?.saved_name || participant?.display_name || contact?.push_name;
                const isRawPhone = !resolvedName || /^\+?[\d\s\-()]+$/.test(resolvedName.trim());
                if (bestName && isRawPhone) {
                  resolvedName = bestName;
                }
                if (!resolvedAvatar) {
                  resolvedAvatar = contact?.profile_pic_url || participant?.profile_pic_url || null;
                }
              }

              const quoted =
                msg.quoted_message &&
                typeof msg.quoted_message === "object" &&
                !Array.isArray(msg.quoted_message)
                  ? msg.quoted_message
                  : null;
              const quotedReactions = quoted?.["reactions"];

              return {
                id: msg.id,
                chatId: msg.chat_id,
                clientMessageId: msg.client_message_id || null,
                externalId: msg.external_id,
                sender: msg.sender,
                senderName: resolvedName,
                senderPhone: msg.sender_phone,
                senderAvatar: resolvedAvatar,
                quotedMessage: msg.quoted_message,
                type: msg.type,
                text: msg.text ?? "",
                mediaUrl: resolvedMediaUrl,
                mediaPath:
                  typeof msg.media_url === "string" && msg.media_url.startsWith("/api/media/")
                    ? msg.media_url.slice("/api/media/".length)
                    : null,
                audioUrl: msg.type === "audio" ? resolvedMediaUrl : undefined,
                fileUrl: msg.type === "document" ? resolvedMediaUrl : undefined,
                fileName: msg.media_filename,
                mimetype: msg.media_mimetype,
                duration: msg.media_duration,
                isEdited: Boolean(msg.is_edited || quoted?.["isEdited"]),
                reactions: Array.isArray(msg.reactions)
                  ? msg.reactions
                  : Array.isArray(quotedReactions)
                    ? quotedReactions
                    : undefined,
                isGif: Boolean(
                  msg.is_gif ||
                  msg.media_mimetype === "image/gif" ||
                  (msg.type === "video" && msg.media_filename?.includes(".gif")),
                ),
                time: formatTime(msg.created_at),
                createdAt: msg.created_at,
                status: msg.status || "sent",
              };
            }),
            nextCursor,
            hasMore,
          });
        } catch (error: unknown) {
          return json({ error: errorMessage(error, "Erro ao carregar mensagens") }, 500);
        }
      },
    },
  },
});
