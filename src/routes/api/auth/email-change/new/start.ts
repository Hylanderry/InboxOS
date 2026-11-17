import { createFileRoute } from "@tanstack/react-router";
import { startNewEmailChallenge } from "@/server/auth/email-change.server";
export const Route = createFileRoute("/api/auth/email-change/new/start")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        startNewEmailChallenge(request, await request.json().catch(() => null)),
    },
  },
});
