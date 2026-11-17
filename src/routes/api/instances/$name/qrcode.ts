import { createFileRoute } from "@tanstack/react-router";
import {
  configureEvolutionWebhook,
  evolutionFetch,
  publicWebhookUrl,
  EVOLUTION_WEBHOOK_EVENTS,
} from "@/lib/evolution.server";
import { requireApiPermission } from "@/server/middleware/auth";
import { logServerWarning } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type QrPayload = {
  qrcode?: { base64?: string | null; code?: string | null; pairingCode?: string | null };
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
  state?: string | null;
  status?: string | null;
  connectionStatus?: string | null;
  instance?: QrPayload;
};

export const Route = createFileRoute("/api/instances/$name/qrcode")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "instances.read");
        if (auth instanceof Response) return auth;
        const instanceName = (params.name || "").trim();
        if (!instanceName) return json({ state: "error", error: "Instância não informada" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: instance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("status,qr_code")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName)
          .maybeSingle();
        if (!instance)
          return json({ state: "error", error: "Conexão ainda não inicializada" }, 404);
        return json({
          state:
            instance.status === "open" ? "open" : instance.qr_code ? "qrcode" : instance.status,
          instanceName,
          base64: instance.qr_code,
          qrcode: { base64: instance.qr_code },
        });
      },
      // A criação/conexão é uma mutação explícita; o GET acima é somente leitura.
      POST: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "instances.manage");
        if (auth instanceof Response) return auth;

        const instanceName = (params.name || "").trim();
        if (!instanceName) return json({ state: "error", error: "Instância não informada" }, 400);

        // Never query or mutate Evolution before proving that this instance is
        // registered in the caller's workspace. Evolution's catalog is global
        // to the server, so the provider itself cannot enforce tenant scope.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ownedInstance, error: ownershipError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id,instance_name,status")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName)
          .maybeSingle();
        if (ownershipError) {
          return json({ state: "error", error: "Falha ao validar a conexão" }, 500);
        }
        if (!ownedInstance) {
          return json({ state: "error", error: "Conexão não encontrada neste workspace" }, 404);
        }

        // 1. Verifica estado atual da conexão se a instância já existir
        const status = await evolutionFetch<QrPayload>(
          `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        );
        const state = status.data?.instance?.state ?? status.data?.state;
        if (state === "open") {
          await supabaseAdmin.from("whatsapp_instances").upsert(
            {
              workspace_id: auth.workspaceId,
              instance_name: instanceName,
              status: "open",
              qr_code: null,
            },
            { onConflict: "workspace_id,instance_name" },
          );
          const webhook = await configureEvolutionWebhook(instanceName);
          return json({
            state: "open",
            instanceName,
            webhookReady: webhook.success,
            webhookError: webhook.success ? undefined : webhook.error,
          });
        }

        // 2. Tenta conectar para obter o QR Code
        let res = await evolutionFetch<QrPayload>(
          `/instance/connect/${encodeURIComponent(instanceName)}`,
        );

        // 3. Se a instância não existe na Evolution API (404 / Not Found), cria automaticamente
        const isNotFound =
          !res.ok &&
          (res.status === 404 ||
            status.status === 404 ||
            /not found|does not exist|não encontrada|não existe/i.test(String(res.error ?? "")));

        if (isNotFound) {
          const createRes = await evolutionFetch<QrPayload>("/instance/create", {
            method: "POST",
            body: {
              instanceName,
              qrcode: true,
              integration: "WHATSAPP-BAILEYS",
              webhook: {
                url: publicWebhookUrl(),
                byEvents: false,
                base64: true,
                events: EVOLUTION_WEBHOOK_EVENTS,
              },
            },
          });

          if (createRes.ok) {
            res = createRes;
          } else if (/already|exists|in use/i.test(String(createRes.error ?? ""))) {
            // Se indicou que já existe, tenta conectar mais uma vez
            res = await evolutionFetch<QrPayload>(
              `/instance/connect/${encodeURIComponent(instanceName)}`,
            );
          } else {
            return json(
              {
                state: "error",
                instanceName,
                error: safePublicError(createRes.error, "Falha ao inicializar a instância"),
              },
              502,
            );
          }
        }

        if (!res.ok) {
          return json(
            {
              state: "error",
              instanceName,
              error: safePublicError(res.error, "Falha ao conectar a instância"),
            },
            502,
          );
        }

        function extractQrData(data: QrPayload | null) {
          if (!data) return { base64: null, code: null, pairingCode: null, state: null };
          const base64 =
            data?.qrcode?.base64 ??
            data?.base64 ??
            data?.instance?.qrcode?.base64 ??
            data?.instance?.base64 ??
            null;
          const code =
            data?.qrcode?.code ??
            data?.code ??
            data?.instance?.qrcode?.code ??
            data?.instance?.code ??
            null;
          const pairingCode =
            data?.qrcode?.pairingCode ??
            data?.pairingCode ??
            data?.instance?.qrcode?.pairingCode ??
            data?.instance?.pairingCode ??
            null;
          const state =
            data?.instance?.state ??
            data?.instance?.status ??
            data?.state ??
            data?.status ??
            data?.connectionStatus ??
            null;
          return { base64, code, pairingCode, state };
        }

        const initialQr = extractQrData(res.data);
        let { base64, code, pairingCode } = initialQr;
        const extractedState = initialQr.state;
        let currentState = extractedState ?? state ?? "connecting";

        if (currentState === "open") {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("whatsapp_instances").upsert(
              {
                workspace_id: auth.workspaceId,
                instance_name: instanceName,
                status: "open",
                qr_code: null,
              },
              { onConflict: "workspace_id,instance_name" },
            );

            const webhook = await configureEvolutionWebhook(instanceName);
            if (!webhook.success) {
              return json(
                {
                  state: "error",
                  instanceName,
                  error: safePublicError(webhook.error, "Falha ao configurar webhook"),
                },
                502,
              );
            }
          } catch (err) {
            logServerWarning("[qrcode] status update failed", err);
          }
          return json({ state: "open", instanceName });
        }

        // Se ainda não obteve o QR Code na resposta inicial, tenta chamar o connect explicitamente
        if (!base64 && !code) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          const retry = await evolutionFetch<QrPayload>(
            `/instance/connect/${encodeURIComponent(instanceName)}`,
          );
          if (retry.ok) {
            const ret = extractQrData(retry.data);
            base64 = ret.base64 ?? base64;
            code = ret.code ?? code;
            pairingCode = ret.pairingCode ?? pairingCode;
            currentState = ret.state ?? currentState;
          }
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("whatsapp_instances").upsert(
            {
              workspace_id: auth.workspaceId,
              instance_name: instanceName,
              status: currentState === "open" ? "open" : "connecting",
              qr_code: base64 ?? code,
            },
            { onConflict: "workspace_id,instance_name" },
          );
        } catch (err) {
          logServerWarning("[qrcode] QR persistence failed", err);
        }

        if (!base64 && !code && currentState !== "open") {
          return json({
            state: currentState,
            instanceName,
            error: "Aguardando o WhatsApp gerar o código... Atualizando...",
          });
        }

        return json({
          state: currentState === "open" ? "open" : "qrcode",
          connectionStatus: currentState,
          instanceName,
          base64,
          code,
          pairingCode,
          qrcode: { base64, code, pairingCode },
        });
      },
    },
  },
});
