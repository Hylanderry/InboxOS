import { createFileRoute } from "@tanstack/react-router";
import { cleanPhone } from "@/lib/evolution.server";
import { requireApiPermission } from "@/server/middleware/auth";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/$phone/resume")({
  server: {
    handlers: {
      // Reativa o atendimento automático da conversa (respeitando a instância quando informada)
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "agents.manage");
        if (auth instanceof Response) return auth;

        const phone = cleanPhone(params.phone);
        if (!phone) return json({ success: false, error: "Telefone inválido" }, 400);

        const url = new URL(request.url);
        let instanceName =
          url.searchParams.get("instanceName") || url.searchParams.get("instance_name") || "";
        if (!instanceName) {
          try {
            const body = await request.json();
            if (body?.instanceName || body?.instance_name) {
              instanceName = String(body.instanceName || body.instance_name);
            }
          } catch {
            // Silencioso se não houver corpo JSON
          }
        }

        if (!instanceName) {
          return json(
            { success: false, error: "A instância é obrigatória para alterar esta conversa" },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const query = supabaseAdmin
          .from("chats")
          .update({ ai_paused: false })
          .eq("phone", phone)
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName);

        const { error } = await query;
        if (error)
          return json(
            { success: false, error: safePublicError(error, "Falha ao retomar conversa") },
            500,
          );

        return json({ success: true, paused: false, phone, instanceName });
      },
    },
  },
});
