import { createFileRoute } from "@tanstack/react-router";
import { evolutionFetch, cleanPhone, configureEvolutionWebhook } from "@/lib/evolution.server";
import { requireApiPermission } from "@/server/middleware/auth";
import {
  isValidInstanceName,
  normalizeDisplayName,
  normalizeInstanceName,
} from "@/server/evolution/instance-name";
import {
  isProviderDisconnectedState,
  providerInstanceNames,
  purgeInstanceData,
} from "@/server/evolution/instance-lifecycle";
import { logServerError, logServerWarning } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

const WEBHOOK_HEALTH_TTL_MS = 60_000;
const webhookHealthCache = new Map<string, number>();

function shouldCheckWebhook(key: string): boolean {
  const lastCheck = webhookHealthCache.get(key) ?? 0;
  return Date.now() - lastCheck >= WEBHOOK_HEALTH_TTL_MS;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type EvolutionInstanceRecord = {
  id?: string;
  instanceId?: string;
  name?: string;
  instanceName?: string;
  connectionStatus?: string;
  state?: string;
  status?: string;
  ownerJid?: string;
  owner?: string;
  number?: string;
  profilePicUrl?: string | null;
  profilePictureUrl?: string | null;
  instance?: EvolutionInstanceRecord;
};
type InstanceView = {
  id: string;
  instanceName: string;
  alias: string;
  state: string;
  phone: string;
  profilePicUrl: string | null;
};
type EvolutionCreateResponse = {
  qrcode?: { base64?: string | null; code?: string | null };
};

export const Route = createFileRoute("/api/instances/")({
  server: {
    handlers: {
      // Lista somente as instâncias registradas no workspace e consulta o estado ao vivo.
      GET: async ({ request }) => {
        const auth = await requireApiPermission(request, "instances.read");
        if (auth instanceof Response) return auth;

        const res = await evolutionFetch<
          EvolutionInstanceRecord[] | { instances?: EvolutionInstanceRecord[] }
        >("/instance/fetchInstances");
        const raw = res.ok
          ? Array.isArray(res.data)
            ? res.data
            : (res.data?.instances ?? [])
          : [];
        const liveInstances = raw.map((item) => {
          const inst = item.instance ?? item;
          return {
            id: inst.id ?? inst.instanceId ?? inst.name ?? inst.instanceName,
            instanceName: inst.name ?? inst.instanceName,
            state: inst.connectionStatus ?? inst.state ?? inst.status ?? "close",
            phone: cleanPhone(inst.ownerJid ?? inst.owner ?? inst.number),
            profilePicUrl: inst.profilePicUrl ?? inst.profilePictureUrl ?? null,
          };
        });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: savedInstances, error: savedInstancesError } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("*")
            .eq("workspace_id", auth.workspaceId);
          if (savedInstancesError) throw savedInstancesError;

          const merged = new Map<string, InstanceView>();
          const healthJobs: Array<Promise<unknown>> = [];
          // A successful provider catalog is authoritative for existence and
          // connection state. A disconnected session is removed from the
          // product immediately; a provider request failure never purges data.
          const liveNames = res.ok ? providerInstanceNames(res.data) : null;
          for (const saved of savedInstances ?? []) {
            if (liveNames && !liveNames.has(saved.instance_name)) {
              await purgeInstanceData(supabaseAdmin, {
                workspaceId: auth.workspaceId,
                instanceId: saved.id,
                instanceName: saved.instance_name,
              });
              continue;
            }
            const live = liveInstances.find(
              (instance) => instance.instanceName === saved.instance_name,
            );
            const state = String(live?.state ?? saved.status ?? "disconnected").toLowerCase();
            if (res.ok && live && isProviderDisconnectedState(state)) {
              await purgeInstanceData(supabaseAdmin, {
                workspaceId: auth.workspaceId,
                instanceId: saved.id,
                instanceName: saved.instance_name,
              });
              continue;
            }
            const storedState =
              state === "open"
                ? "open"
                : state === "connecting" || state === "qrcode"
                  ? "connecting"
                  : "disconnected";
            const nextConnectionState = storedState === "open" ? "connected" : storedState;
            if (saved.status !== storedState || saved.connection_state !== nextConnectionState) {
              healthJobs.push(
                Promise.resolve(
                  supabaseAdmin
                    .from("whatsapp_instances")
                    .update({
                      status: storedState,
                      connection_state: nextConnectionState,
                      ...(storedState === "open" && saved.status !== "open"
                        ? { connected_at: new Date().toISOString() }
                        : {}),
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", saved.id)
                    .eq("workspace_id", auth.workspaceId),
                ),
              );
            }
            // APENAS INSTÂNCIAS REALMENTE CONECTADAS AO WHATSAPP
            // Atua como watchdog: a Evolution pode perder URL/headers do webhook
            // após reiniciar. A função só grava quando detecta divergência.
            if (storedState === "open") {
              const healthKey = `${auth.workspaceId}:${saved.instance_name}`;
              if (shouldCheckWebhook(healthKey)) {
                healthJobs.push(
                  configureEvolutionWebhook(saved.instance_name).then((result) => {
                    if (result.success) webhookHealthCache.set(healthKey, Date.now());
                    return result;
                  }),
                );
              }
            }

            merged.set(saved.instance_name, {
              id: saved.id ?? saved.instance_name,
              instanceName: saved.instance_name,
              alias: saved.display_name || saved.instance_name,
              state: storedState,
              phone: live?.phone || cleanPhone(saved.phone),
              profilePicUrl: live?.profilePicUrl || saved.profile_pic_url || null,
            });
          }

          await Promise.allSettled(healthJobs);

          return json([...merged.values()]);
        } catch (err) {
          logServerWarning("[instances] database mirror failed", err);
          return json({ error: "Falha ao consultar instâncias do workspace" }, 500);
        }
      },

      // Cria uma nova instância já com o webhook do painel configurado (restrito a admin)
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "instances.manage", "admin");
        if (auth instanceof Response) return auth;

        let payload: { instanceName?: string; displayName?: string | null };
        try {
          payload = (await request.json()) as {
            instanceName?: string;
            displayName?: string | null;
          };
        } catch {
          return json({ success: false, error: "Corpo inválido" }, 400);
        }

        const instanceName = normalizeInstanceName(payload.instanceName);
        if (!isValidInstanceName(instanceName)) {
          return json({ success: false, error: "Nome da instância inválido" }, 400);
        }
        const displayName = normalizeDisplayName(payload.displayName) ?? instanceName;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sameNameRows, error: sameNameError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("workspace_id")
          .eq("instance_name", instanceName)
          .limit(2);
        if (sameNameError) {
          logServerError("[instances] technical name validation failed", sameNameError);
          return json({ success: false, error: "Falha ao validar a instância" }, 500);
        }
        if (sameNameRows?.some((row) => row.workspace_id !== auth.workspaceId)) {
          return json(
            { success: false, error: "Esta instância já está vinculada a outro workspace" },
            409,
          );
        }
        const knownInWorkspace = sameNameRows?.some((row) => row.workspace_id === auth.workspaceId);

        // Configuration resolution happens before evolutionFetch can handle
        // network failures. Return an actionable response instead of an
        // unhandled 500 when the integration is unavailable.
        let res: Awaited<ReturnType<typeof evolutionFetch<EvolutionCreateResponse>>>;
        try {
          res = await evolutionFetch<EvolutionCreateResponse>("/instance/create", {
            method: "POST",
            body: {
              instanceName,
              qrcode: true,
              integration: "WHATSAPP-BAILEYS",
            },
          });
        } catch (err) {
          logServerError("[instances] provider configuration unavailable", err);
          return json(
            {
              success: false,
              error:
                "A integra\u00e7\u00e3o WhatsApp n\u00e3o est\u00e1 configurada ou est\u00e1 indispon\u00edvel. Revise-a no ADM e tente novamente.",
            },
            503,
          );
        }

        // A instância pode já existir na Evolution API: nesse caso seguimos para a conexão
        const alreadyExists =
          !res.ok && /already|exists|in use|duplicat/i.test(String(res.error ?? ""));

        // Never attach an unknown provider instance implicitly. An existing
        // Evolution name may belong to another installation/tenant even when
        // our local mirror has no row for it; only an explicit local binding
        // may resume that connection.
        if (alreadyExists && !knownInWorkspace) {
          return json(
            {
              success: false,
              error:
                "Esta instância já existe na Evolution e ainda não foi vinculada a este workspace",
            },
            409,
          );
        }

        if (!res.ok && !alreadyExists) {
          return json(
            { success: false, error: safePublicError(res.error, "Evolution recusou a conexão") },
            502,
          );
        }

        try {
          const { error: registerError } = await supabaseAdmin.from("whatsapp_instances").upsert(
            {
              workspace_id: auth.workspaceId,
              instance_name: instanceName,
              display_name: displayName,
              status: "connecting",
            },
            { onConflict: "workspace_id,instance_name" },
          );
          if (registerError) throw registerError;
        } catch (err) {
          logServerError("[instances] instance registration failed", err);
          return json({ success: false, error: "Falha ao registrar a conexão" }, 500);
        }

        const qr = res.data?.qrcode?.base64 ?? res.data?.qrcode?.code ?? null;
        // Instance creation and webhook configuration are independent. Keep the
        // QR flow available when the provider temporarily rejects the webhook;
        // the connected-instance watchdog retries the configuration safely.
        try {
          const webhook = await configureEvolutionWebhook(instanceName);
          if (!webhook.success) {
            return json(
              {
                success: true,
                instanceName,
                displayName,
                qrcode: qr,
                webhookConfigured: false,
                warning:
                  "A conexão foi criada. O webhook será verificado novamente quando o WhatsApp estiver conectado.",
                missingEvents: webhook.missingEvents,
              },
              201,
            );
          }
        } catch (err) {
          logServerWarning("[instances] webhook configuration deferred", err);
          return json(
            {
              success: true,
              instanceName,
              displayName,
              qrcode: qr,
              webhookConfigured: false,
              warning:
                "A conexão foi criada. O webhook será verificado novamente quando o WhatsApp estiver conectado.",
            },
            201,
          );
        }

        return json({
          success: true,
          instanceName,
          displayName,
          qrcode: qr,
          webhookConfigured: true,
          data: res.data,
        });
      },
    },
  },
});
