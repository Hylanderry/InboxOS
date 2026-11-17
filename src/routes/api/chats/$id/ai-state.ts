import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/$id/ai-state")({
  server: {
    handlers: {
      // Altera o estado da IA para a conversa específica (isolada por chatId e workspace)
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "agents.manage");
        if (auth instanceof Response) return auth;

        const chatId = params.id;
        if (!chatId) return json({ success: false, error: "Chat ID não informado" }, 400);

        let body: { paused?: boolean };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Corpo da requisição inválido" }, 400);
        }

        if (typeof body.paused !== "boolean") {
          return json({ success: false, error: 'Campo "paused" booleano obrigatório' }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Valida e atualiza especificamente este chat garantindo isolamento
          const { data: updatedChat, error } = await supabaseAdmin
            .from("chats")
            .update({
              ai_paused: body.paused,
            })
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .select("id, phone, instance_name, ai_paused")
            .maybeSingle();

          if (error) {
            return json(
              { success: false, error: safePublicError(error, "Falha ao atualizar estado da IA") },
              500,
            );
          }
          if (!updatedChat) {
            return json({ success: false, error: "Conversa não encontrada" }, 404);
          }

          return json({
            success: true,
            chatId: updatedChat.id,
            instanceName: updatedChat.instance_name,
            phone: updatedChat.phone,
            paused: updatedChat.ai_paused,
          });
        } catch (err: unknown) {
          return json(
            {
              success: false,
              error: safePublicError(err, "Erro ao atualizar estado da IA"),
            },
            500,
          );
        }
      },
    },
  },
});
