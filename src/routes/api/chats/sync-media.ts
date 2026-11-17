import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { evolutionFetch, storeBase64Media } from "@/lib/evolution.server";
import { extractMediaBase64 } from "@/server/evolution/normalize-message";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

/**
 * Rehydrates media rows that were already persisted by the webhook but could
 * not be downloaded during a provider/storage timeout. This never imports a
 * message: it only updates existing rows identified by their external ID.
 */
export const Route = createFileRoute("/api/chats/sync-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        try {
          const url = new URL(request.url);
          const instanceName = String(url.searchParams.get("instanceName") ?? "").trim();
          const chatId = String(url.searchParams.get("chatId") ?? "").trim();
          const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
          const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 20)
            : 12;
          if (!instanceName) return json({ success: false, error: "Instância obrigatória" }, 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: instance, error: instanceError } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id,instance_name")
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_name", instanceName)
            .maybeSingle();
          if (instanceError)
            return json(
              {
                success: false,
                error: safePublicError(instanceError, "Falha ao consultar a conexão"),
              },
              500,
            );
          if (!instance) return json({ success: false, error: "Instância não encontrada" }, 404);

          let query = supabaseAdmin
            .from("messages")
            .select("id,external_id,remote_jid,sender,type,media_mimetype,media_filename")
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_id", instance.id)
            .is("media_url", null)
            .not("external_id", "is", null)
            .in("type", [...MEDIA_TYPES])
            .order("created_at", { ascending: false })
            .limit(limit);
          if (chatId) query = query.eq("chat_id", chatId);

          const { data: rows, error: rowsError } = await query;
          if (rowsError)
            return json(
              { success: false, error: safePublicError(rowsError, "Falha ao consultar mídias") },
              500,
            );
          if (!rows?.length) return json({ success: true, processed: 0, updated: 0, failed: 0 });

          let updated = 0;
          let failed = 0;
          for (let start = 0; start < rows.length; start += 3) {
            await Promise.all(
              rows.slice(start, start + 3).map(async (row) => {
                const externalId = String(row.external_id ?? "").trim();
                if (!externalId) return;
                try {
                  const provider = await evolutionFetch<unknown>(
                    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
                    {
                      method: "POST",
                      body: {
                        message: {
                          key: {
                            id: externalId,
                            remoteJid: row.remote_jid || undefined,
                            fromMe: row.sender === "agent",
                          },
                        },
                        convertToMp4: false,
                      },
                    },
                  );
                  const base64 = provider.ok ? extractMediaBase64(provider.data) : null;
                  if (!base64) {
                    failed += 1;
                    return;
                  }
                  const stored = await storeBase64Media(
                    base64,
                    row.media_mimetype,
                    row.media_filename,
                    auth.workspaceId,
                  );
                  if (!stored.url) {
                    failed += 1;
                    return;
                  }
                  const { error: updateError } = await supabaseAdmin
                    .from("messages")
                    .update({ media_url: stored.url })
                    .eq("id", row.id)
                    .eq("workspace_id", auth.workspaceId)
                    .eq("instance_id", instance.id)
                    .is("media_url", null);
                  if (updateError) {
                    failed += 1;
                    return;
                  }
                  updated += 1;
                } catch {
                  failed += 1;
                }
              }),
            );
          }

          return json({ success: true, processed: rows.length, updated, failed });
        } catch (error: unknown) {
          return json(
            {
              success: false,
              error: safePublicError(error, "Falha ao recuperar mídia"),
            },
            500,
          );
        }
      },
    },
  },
});
