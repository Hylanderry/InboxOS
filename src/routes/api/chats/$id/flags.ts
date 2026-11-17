import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FlagsPayload = {
  pinned?: unknown;
  archived?: unknown;
  tag?: unknown;
  unread?: unknown;
};
type ChatFlagsUpdate = {
  pinned?: boolean;
  archived?: boolean;
  tag?: string | null;
  unread?: number;
};

/** Salva as preferências de organização de uma conversa (fixar, arquivar, etiqueta, lidas). */
export const Route = createFileRoute("/api/chats/$id/flags")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        const chatId = params.id;
        if (!chatId) return json({ success: false, error: "Conversa não informada" }, 400);

        let body: FlagsPayload;
        try {
          const parsed: unknown = await request.json();
          body = parsed && typeof parsed === "object" ? (parsed as FlagsPayload) : {};
        } catch {
          return json({ success: false, error: "Corpo inválido" }, 400);
        }

        const update: ChatFlagsUpdate = {};
        if (typeof body.pinned === "boolean") update["pinned"] = body.pinned;
        if (typeof body.archived === "boolean") update["archived"] = body.archived;
        if (typeof body.tag === "string" || body.tag === null) update["tag"] = body.tag || null;
        if (typeof body.unread === "number") update["unread"] = Math.max(0, body.unread);

        if (Object.keys(update).length === 0) {
          return json({ success: false, error: "Nada para atualizar" }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("chats")
            .update(update)
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId);
          if (error)
            return json(
              { success: false, error: safePublicError(error, "Falha ao atualizar conversa") },
              500,
            );
          return json({ success: true });
        } catch (err: unknown) {
          return json({ success: false, error: safePublicError(err, "Erro ao salvar") }, 500);
        }
      },
    },
  },
});
