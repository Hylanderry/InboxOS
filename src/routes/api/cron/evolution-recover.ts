import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invokeVercelEvolutionBackground } from "@/server/evolution/background-dispatch";
import { recoverEvolutionInbox } from "@/server/evolution/recovery.server";
import { trustedAppOrigin } from "@/server/security/trusted-app-origin";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/cron/evolution-recover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"]?.trim();
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return json({ ok: false, error: "Não autorizado" }, 401);
        }
        if (process.env["ENABLE_EVOLUTION_RECOVERY"] !== "true") {
          return json({ ok: false, error: "Recovery desativado" }, 503);
        }
        const origin = trustedAppOrigin(process.env);
        const report = await recoverEvolutionInbox(
          supabaseAdmin,
          (eventId) => invokeVercelEvolutionBackground(origin, eventId),
          { maxBatch: 18, concurrency: 3 },
        );
        return json({ ok: true, ...report });
      },
    },
  },
});
