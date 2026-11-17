import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { configureEvolutionWebhook, evolutionFetch } from "@/lib/evolution.server";
import { syncGroups, syncContacts } from "@/server/evolution/sync-engine";
import { safePublicError } from "@/server/public-error";

interface EvolutionInstanceSummary {
  name?: string;
  instanceName?: string;
  connectionStatus?: string;
  state?: string;
  status?: string;
}

type EvolutionInstanceListItem = EvolutionInstanceSummary & {
  instance?: EvolutionInstanceSummary;
};

type EvolutionInstanceListResponse =
  EvolutionInstanceListItem[] | { instances?: EvolutionInstanceListItem[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/sync/evolution")({
  server: {
    handlers: {
      // Sincroniza somente metadados. Mensagens novas chegam pelo webhook ao vivo.
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "instances.manage");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const phase = url.searchParams.get("phase")?.trim() || "all";
        if (!["webhook", "contacts", "groups", "all"].includes(phase)) {
          return json({ success: false, error: "Fase de sincronização inválida" }, 400);
        }
        // Participant enumeration is opt-in. Evolution can take tens of
        // seconds (or time out) when it expands every member of a large
        // group. The normal Inbox refresh only needs group metadata;
        // participant details have their own per-group recovery path.
        const includeParticipants = url.searchParams.get("participants") === "true";
        const requestedInstance = url.searchParams.get("instance")?.trim() || null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: allowedInstances, error: allowedInstancesError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("workspace_id", auth.workspaceId);
        if (allowedInstancesError) {
          return json(
            {
              success: false,
              error: safePublicError(allowedInstancesError, "Falha ao consultar conexões"),
            },
            500,
          );
        }
        const allowedNames = new Set((allowedInstances ?? []).map((row) => row.instance_name));
        if (requestedInstance && !allowedNames.has(requestedInstance)) {
          return json({ success: false, error: "Instância não pertence ao workspace" }, 403);
        }

        const list = await evolutionFetch<EvolutionInstanceListResponse>(
          "/instance/fetchInstances",
        );
        if (!list.ok) {
          return json(
            {
              success: false,
              error: safePublicError(list.error, "Servidor de WhatsApp indisponível"),
            },
            502,
          );
        }

        const raw = Array.isArray(list.data) ? list.data : (list.data?.instances ?? []);
        const liveOpen = raw
          .map((item) => item.instance ?? item)
          .filter((inst) => (inst.connectionStatus ?? inst.state ?? inst.status) === "open");

        const instances = liveOpen.filter((inst) => {
          const name = inst.name ?? inst.instanceName;
          return (
            typeof name === "string" &&
            allowedNames.has(name) &&
            (!requestedInstance || name === requestedInstance)
          );
        });

        if (instances.length === 0) {
          return json(
            {
              success: true,
              contactsSynced: 0,
              groupsSynced: 0,
              message: "Nenhuma conexão aberta",
            },
            200,
          );
        }

        let contactsSynced = 0;
        let groupsSynced = 0;
        const errors: string[] = [];

        for (const inst of instances) {
          const instanceName = inst.name ?? inst.instanceName;
          if (!instanceName) continue;

          if (phase === "webhook" || phase === "all") {
            const webhookResult = await configureEvolutionWebhook(instanceName);
            if (!webhookResult.success) {
              errors.push(
                `${instanceName}: ${safePublicError(webhookResult.error, "webhook incompleto")}`,
              );
            }
          }

          if (phase === "contacts" || phase === "all") {
            const contactsResult = await syncContacts(instanceName, auth.workspaceId);
            contactsSynced += contactsResult.count ?? 0;
            if (!contactsResult.success) {
              errors.push(
                `${instanceName}: ${safePublicError(contactsResult.error, "falha ao sincronizar contatos")}`,
              );
            }
          }

          if (phase === "groups" || phase === "all") {
            const groupsResult = await syncGroups(instanceName, auth.workspaceId, {
              includeParticipants,
              syncParticipantContacts: includeParticipants,
              // Profile pictures are refreshed by the instance-scoped
              // /api/chats/sync-pfp worker. Keeping them out of group sync
              // prevents provider latency from blocking the metadata commit.
              fetchMissingPictures: false,
            });
            groupsSynced += groupsResult.count ?? 0;
            if (!groupsResult.success) {
              errors.push(
                `${instanceName}: ${safePublicError(groupsResult.error, "falha ao sincronizar grupos")}`,
              );
            }
          }
        }

        return json(
          {
            success: errors.length === 0,
            contactsSynced,
            groupsSynced,
            errors: errors.length > 0 ? errors : undefined,
          },
          errors.length > 0 ? 502 : 200,
        );
      },
    },
  },
});
