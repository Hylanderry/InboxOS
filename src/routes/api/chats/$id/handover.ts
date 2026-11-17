import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type HandoverAction = "accept" | "resolve" | "cancel";

function isAction(value: unknown): value is HandoverAction {
  return value === "accept" || value === "resolve" || value === "cancel";
}

/**
 * Completes the human-handoff lifecycle for one chat.
 *
 * The request is always resolved through workspace + chat identity, never by
 * trusting a handover id supplied by the browser.  This keeps an operator
 * from accepting or closing a request belonging to another tenant.
 */
export const Route = createFileRoute("/api/chats/$id/handover")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.send");
        if (auth instanceof Response) return auth;

        const chatId = params.id?.trim();
        if (!chatId) return json({ success: false, error: "Conversa não informada" }, 400);

        let action: HandoverAction;
        try {
          const body = await request.json();
          action = body && typeof body === "object" ? body.action : undefined;
          if (!isAction(action)) throw new Error("invalid-action");
        } catch {
          return json(
            { success: false, error: "Ação inválida. Use accept, resolve ou cancel." },
            400,
          );
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: chat, error: chatError } = await supabaseAdmin
            .from("chats")
            .select("id, workspace_id, instance_id, ai_paused")
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();

          if (chatError) {
            return json(
              { success: false, error: safePublicError(chatError, "Falha ao localizar conversa") },
              500,
            );
          }
          if (!chat) return json({ success: false, error: "Conversa não encontrada" }, 404);
          if (!chat.instance_id)
            return json({ success: false, error: "Conexão da conversa não encontrada" }, 409);

          const { data: handover, error: handoverError } = await supabaseAdmin
            .from("handover_requests")
            .select("id,status,assigned_to,accepted_at")
            .eq("workspace_id", auth.workspaceId)
            .eq("chat_id", chat.id)
            .in("status", ["queued", "assigned", "in_progress"])
            .order("requested_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (handoverError) {
            return json(
              {
                success: false,
                error: safePublicError(handoverError, "Falha ao localizar atendimento humano"),
              },
              500,
            );
          }
          if (!handover) {
            return json(
              { success: false, error: "Não há atendimento humano pendente nesta conversa" },
              409,
            );
          }

          const now = new Date().toISOString();
          const handoverPatch =
            action === "accept"
              ? {
                  status: "in_progress",
                  assigned_to: handover.assigned_to || auth.id,
                  accepted_at: handover.accepted_at || now,
                  updated_at: now,
                }
              : {
                  status: action === "resolve" ? "resolved" : "canceled",
                  assigned_to: handover.assigned_to || auth.id,
                  resolved_at: now,
                  updated_at: now,
                };

          const { data: updated, error: updateError } = await supabaseAdmin
            .from("handover_requests")
            .update(handoverPatch)
            .eq("id", handover.id)
            .eq("workspace_id", auth.workspaceId)
            .select("id,status,assigned_to,accepted_at,resolved_at")
            .maybeSingle();
          if (updateError || !updated) {
            return json(
              {
                success: false,
                error: safePublicError(updateError, "Falha ao atualizar atendimento humano"),
              },
              500,
            );
          }

          const { error: chatUpdateError } = await supabaseAdmin
            .from("chats")
            .update({ ai_paused: action === "accept" })
            .eq("id", chat.id)
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_id", chat.instance_id);
          if (chatUpdateError) {
            return json(
              {
                success: false,
                error: safePublicError(chatUpdateError, "Falha ao atualizar estado da IA"),
              },
              500,
            );
          }

          return json({
            success: true,
            chatId: chat.id,
            handover: updated,
            paused: action === "accept",
          });
        } catch (error: unknown) {
          return json(
            { success: false, error: safePublicError(error, "Erro ao atualizar atendimento") },
            500,
          );
        }
      },
    },
  },
});
