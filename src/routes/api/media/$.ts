import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";

export const Route = createFileRoute("/api/media/$")({
  server: {
    handlers: {
      // Entrega mídias de chat (fotos, vídeos, áudios, documentos) para solicitações autenticadas
      GET: async ({ request, params }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (!path || path.includes("..")) {
          return new Response("Arquivo inválido", { status: 400 });
        }

        if (!/^[a-zA-Z0-9_./-]+$/.test(path))
          return new Response("Arquivo inválido", { status: 400 });
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;
        const isTenantScoped = path.startsWith(`${auth.workspaceId}/`);
        const isLegacyChatPath = path.startsWith("chat/");
        if (!isTenantScoped && !isLegacyChatPath) {
          return new Response("Arquivo não encontrado", { status: 404 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: ownedMessage } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("workspace_id", auth.workspaceId)
            .ilike("media_url", `%${path}`)
            .limit(1)
            .maybeSingle();
          if (!ownedMessage) return new Response("Arquivo não encontrado", { status: 404 });
          const { data: signed } = await supabaseAdmin.storage
            .from("chat-media")
            .createSignedUrl(path, 3600);

          if (signed?.signedUrl) {
            return Response.redirect(signed.signedUrl, 302);
          }

          return new Response("Arquivo indisponível", { status: 502 });
        } catch {
          return new Response("Arquivo indisponível", { status: 502 });
        }
      },
    },
  },
});
