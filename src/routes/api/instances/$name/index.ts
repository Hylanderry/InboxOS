import { createFileRoute } from "@tanstack/react-router";
import { evolutionFetch } from "@/lib/evolution.server";
import { requireApiPermission } from "@/server/middleware/auth";
import { normalizeDisplayName } from "@/server/evolution/instance-name";
import { purgeInstanceData } from "@/server/evolution/instance-lifecycle";
import { logServerError } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/instances/$name/")({
  server: {
    handlers: {
      // Atualiza somente o nome exibido. O identificador Evolution permanece imutável.
      PATCH: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "instances.manage", "admin");
        if (auth instanceof Response) return auth;

        const name = (params.name || "").trim();
        if (!name) return json({ success: false, error: "Instância não informada" }, 400);

        let payload: { displayName?: unknown };
        try {
          payload = (await request.json()) as { displayName?: unknown };
        } catch {
          return json({ success: false, error: "Corpo inválido" }, 400);
        }

        const displayName = normalizeDisplayName(payload.displayName);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: updated, error } = await supabaseAdmin
          .from("whatsapp_instances")
          .update({ display_name: displayName })
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", name)
          .select("id,instance_name,display_name")
          .maybeSingle();

        if (error) {
          logServerError("[instances] display name update failed", error);
          return json({ success: false, error: "Falha ao atualizar a instância" }, 500);
        }
        if (!updated)
          return json({ success: false, error: "Conexão não encontrada neste workspace" }, 404);

        return json({
          success: true,
          instanceName: updated.instance_name,
          displayName: updated.display_name || updated.instance_name,
        });
      },

      // Desconecta e remove a instância na Evolution API (restrito a admin)
      DELETE: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "instances.manage", "admin");
        if (auth instanceof Response) return auth;

        const name = params.name;
        if (!name) return json({ success: false, error: "Instância não informada" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ownedInstance, error: ownershipError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", name)
          .maybeSingle();
        if (ownershipError) return json({ success: false, error: "Falha ao validar conexão" }, 500);
        if (!ownedInstance)
          return json({ success: false, error: "Conexão não encontrada neste workspace" }, 404);

        await evolutionFetch(`/instance/logout/${encodeURIComponent(name)}`, { method: "DELETE" });
        const res = await evolutionFetch(`/instance/delete/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          return json(
            { success: false, error: safePublicError(res.error, "Evolution recusou a operação") },
            502,
          );
        }

        try {
          const cleanup = await purgeInstanceData(supabaseAdmin, {
            workspaceId: auth.workspaceId,
            instanceId: ownedInstance.id,
            instanceName: name,
          });
          return json({ success: true, cleanup });
        } catch (error) {
          logServerError("[instances] scoped cleanup failed after provider deletion", error);
          return json(
            {
              success: false,
              error:
                "A conta foi removida do WhatsApp, mas a limpeza local não foi concluída. Atualize e tente novamente.",
            },
            502,
          );
        }
      },
    },
  },
});
