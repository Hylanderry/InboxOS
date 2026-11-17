import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import {
  consumeEvolutionQueueMessage,
  type EvolutionQueueMessage,
} from "@/server/evolution/event-inbox";
import {
  createVercelEvolutionProducer,
  verifyEvolutionBackgroundSignature,
} from "@/server/evolution/background-dispatch";
import { trustedAppOrigin } from "@/server/security/trusted-app-origin";
import { logServerError } from "@/server/logging";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/internal/evolution-events")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: false, error: "Método não permitido" }), {
          status: 405,
          headers: { "Content-Type": "application/json", Allow: "POST" },
        }),
      POST: async ({ request }) => {
        const payload = (await request.json().catch(() => null)) as EvolutionQueueMessage | null;
        const eventId = payload?.eventId?.trim() ?? "";
        const signature = request.headers.get("x-inbox-background-signature")?.trim() ?? "";
        const sentAt = request.headers.get("x-inbox-background-sent-at")?.trim() ?? "";
        if (!eventId || !verifyEvolutionBackgroundSignature(eventId, sentAt, signature)) {
          return json({ ok: false, error: "Não autorizado" }, 401);
        }

        const origin = trustedAppOrigin(process.env);
        const producer = createVercelEvolutionProducer(origin);
        waitUntil(
          consumeEvolutionQueueMessage(
            { eventId },
            {
              ...process.env,
              PUBLIC_APP_URL: origin,
              EVOLUTION_EVENTS_QUEUE: producer,
            },
          ).catch((error) => {
            logServerError("[evolution-vercel-background] processing failed", error, { eventId });
          }),
        );
        return json({ ok: true, queued: true }, 202);
      },
    },
  },
});
