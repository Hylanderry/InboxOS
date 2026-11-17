import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { cleanPhone, evolutionFetch } from "@/lib/evolution.server";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/$id/read")({
  server: {
    handlers: {
      // Confirmação de visualização: zera unread no Supabase e envia read receipt para o WhatsApp
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        const chatId = params.id;
        if (!chatId) return json({ error: "Chat ID obrigatório" }, 400);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Localiza a conversa
          const { data: chat, error: chatErr } = await supabaseAdmin
            .from("chats")
            .select(
              "id, workspace_id, instance_id, instance_name, phone, remote_jid, is_group, unread",
            )
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();

          if (chatErr || !chat) {
            return json({ error: "Conversa não encontrada" }, 404);
          }
          if (!chat.instance_id) {
            return json({ error: "Conexão da conversa não encontrada" }, 409);
          }

          // 2. Confirma a leitura local de forma transacional. O recibo remoto
          // é registrado separadamente porque uma falha da Evolution não pode
          // desfazer o que o operador já leu no painel.
          const { error: markReadError } = await supabaseAdmin.rpc("mark_chat_read", {
            p_chat_id: chatId,
            p_workspace_id: auth.workspaceId,
          });
          if (markReadError) throw markReadError;

          // 3. Atualiza mensagens não lidas no banco para 'read'
          const unreadMsgs: Array<{ id: string; external_id: string | null }> = [];
          for (let from = 0; ; from += 1000) {
            const { data: page, error: pageError } = await supabaseAdmin
              .from("messages")
              .select("id, external_id")
              .eq("chat_id", chatId)
              .eq("workspace_id", auth.workspaceId)
              .eq("instance_id", chat.instance_id)
              .eq("sender", "client")
              .neq("status", "read")
              .range(from, from + 999);
            if (pageError) throw pageError;
            unreadMsgs.push(...(page ?? []));
            if (!page || page.length < 1000) break;
          }

          // 4. Envia confirmação de visualização para a Evolution API (WhatsApp)
          let receiptError: string | null = null;
          if (chat.instance_name && chat.phone) {
            const phone = cleanPhone(chat.phone);
            const remoteJid =
              chat.remote_jid || (chat.is_group ? `${phone}@g.us` : `${phone}@s.whatsapp.net`);

            const externalIds = (unreadMsgs ?? [])
              .map((m) => m.external_id)
              .filter(Boolean) as string[];

            if (externalIds.length > 0) {
              for (let index = 0; index < externalIds.length; index += 100) {
                const readMessages = externalIds.slice(index, index + 100).map((id) => ({
                  remoteJid,
                  fromMe: false,
                  id,
                }));
                const receipt = await evolutionFetch<unknown>(
                  `/chat/markMessageAsRead/${encodeURIComponent(chat.instance_name)}`,
                  { method: "POST", body: { readMessages } },
                );
                if (!receipt.ok) {
                  receiptError = safePublicError(
                    receipt.error,
                    "Evolution não confirmou a visualização",
                  );
                }
              }
            }
          }

          if (unreadMsgs.length > 0) {
            await supabaseAdmin
              .from("messages")
              .update(
                receiptError
                  ? { read_receipt_error: receiptError }
                  : {
                      read_receipt_sent_at: new Date().toISOString(),
                      read_receipt_error: null,
                      status: "read",
                    },
              )
              .in(
                "id",
                unreadMsgs.map((message) => message.id),
              )
              .eq("workspace_id", auth.workspaceId)
              .eq("instance_id", chat.instance_id)
              .eq("chat_id", chatId);
          }

          return json({ success: true, unread: 0, receiptPending: Boolean(receiptError) });
        } catch (err: unknown) {
          return json(
            {
              error: safePublicError(err, "Falha ao confirmar visualização"),
            },
            500,
          );
        }
      },
    },
  },
});
