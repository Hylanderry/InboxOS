import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { processPrivacyQueue } from "@/server/privacy/worker.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/cron/privacy-retention")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        if (process.env["ENABLE_PRIVACY_RETENTION"] !== "true") {
          return json({ ok: false, error: "Privacy worker desativado" }, 503);
        }
        try {
          return json({ ok: true, ...(await processPrivacyQueue()) });
        } catch {
          return json({ ok: false, error: "Falha no worker de privacidade" }, 500);
        }
      },
    },
  },
});
