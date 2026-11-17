import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { addReactionToMessage, evolutionFetch, cleanPhone } from "@/lib/evolution.server";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Adds or removes the authenticated operator's reaction on a WhatsApp
 * message. The provider key is always resolved from the scoped chat/message;
 * callers cannot select another workspace or Evolution instance.
 */
export const Route = createFileRoute("/api/messages/reaction")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.send");
        if (auth instanceof Response) return auth;

        let body: { messageId?: unknown; emoji?: unknown };
        try {
          body = (await request.json()) as { messageId?: unknown; emoji?: unknown };
        } catch {
          return json({ success: false, error: "Corpo inválido" }, 400);
        }

        const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
        const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
        if (!messageId || emoji.length > 16) {
          return json({ success: false, error: "Mensagem ou reação inválida" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: message, error: messageError } = await supabaseAdmin
          .from("messages")
          .select("id,external_id,instance_id,chat_id,remote_jid,sender")
          .eq("id", messageId)
          .eq("workspace_id", auth.workspaceId)
          .maybeSingle();
        if (messageError) {
          return json(
            {
              success: false,
              error: safePublicError(messageError, "Falha ao carregar a mensagem"),
            },
            500,
          );
        }
        if (!message?.external_id || !message.instance_id || !message.chat_id) {
          return json({ success: false, error: "Mensagem não encontrada nesta conexão" }, 404);
        }

        const [{ data: chat, error: chatError }, { data: instance, error: instanceError }] =
          await Promise.all([
            supabaseAdmin
              .from("chats")
              .select("remote_jid,phone,instance_name")
              .eq("id", message.chat_id)
              .eq("workspace_id", auth.workspaceId)
              .eq("instance_id", message.instance_id)
              .maybeSingle(),
            supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name,phone")
              .eq("id", message.instance_id)
              .eq("workspace_id", auth.workspaceId)
              .maybeSingle(),
          ]);
        if (chatError || instanceError) {
          return json(
            {
              success: false,
              error: safePublicError(chatError ?? instanceError, "Falha ao validar a conversa"),
            },
            500,
          );
        }
        if (
          !chat?.instance_name ||
          !instance?.instance_name ||
          chat.instance_name !== instance.instance_name
        ) {
          return json({ success: false, error: "Conexão não pertence ao workspace" }, 403);
        }

        const remoteJid =
          message.remote_jid ||
          chat.remote_jid ||
          (chat.phone?.endsWith("@g.us") ? chat.phone : `${chat.phone}@s.whatsapp.net`);
        if (!remoteJid) return json({ success: false, error: "Destino da mensagem ausente" }, 409);

        const provider = await evolutionFetch<unknown>(
          `/message/sendReaction/${encodeURIComponent(instance.instance_name)}`,
          {
            method: "POST",
            body: {
              key: {
                remoteJid,
                fromMe: message.sender === "agent",
                id: message.external_id,
              },
              reaction: emoji,
            },
          },
        );
        if (!provider.ok) {
          return json(
            {
              success: false,
              error: safePublicError(provider.error, "Evolution recusou a reação"),
            },
            502,
          );
        }

        const ownerPhone = cleanPhone(instance.phone) || undefined;
        const persisted = await addReactionToMessage(
          auth.workspaceId,
          message.external_id,
          emoji,
          ownerPhone,
          message.instance_id,
        );
        if (persisted?.error) {
          return json(
            { success: false, error: safePublicError(persisted.error, "Falha ao salvar reação") },
            500,
          );
        }

        return json({ success: true, messageId, emoji: emoji || null });
      },
    },
  },
});
