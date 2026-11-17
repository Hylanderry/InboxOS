import { createFileRoute } from "@tanstack/react-router";
import { cleanPhone, sendWhatsAppPresence } from "@/lib/evolution.server";
import { requireApiPermission } from "@/server/middleware/auth";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/$phone/presence")({
  server: {
    handlers: {
      // Transmite o estado de presença do atendente ("digitando..." / "gravando áudio...") para o WhatsApp do cliente
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.send");
        if (auth instanceof Response) return auth;

        const rawPhone = params.phone;
        const phone = cleanPhone(rawPhone);
        if (!phone) return json({ success: false, error: "Telefone inválido" }, 400);

        let body: {
          presence?: "composing" | "recording" | "paused";
          instanceName?: string;
          isGroup?: boolean;
        };
        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "Corpo inválido" }, 400);
        }

        const presence = body.presence ?? "composing";
        if (!["composing", "recording", "paused"].includes(presence)) {
          return json({ success: false, error: "Presença inválida" }, 400);
        }

        const instanceName = (body.instanceName ?? "").trim();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!instanceName) {
          return json(
            { success: false, error: "A instância é obrigatória para enviar presença" },
            400,
          );
        }

        const { data: ownedInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName)
          .maybeSingle();
        if (!ownedInstance)
          return json({ success: false, error: "Instância não pertence ao workspace" }, 403);

        const ok = await sendWhatsAppPresence(
          instanceName,
          phone,
          presence,
          Boolean(body.isGroup),
          auth.workspaceId,
        );
        return json({ success: ok, presence, phone, instanceName });
      },
    },
  },
});
