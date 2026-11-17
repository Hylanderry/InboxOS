import { createFileRoute } from "@tanstack/react-router";
import { verifyNewEmailChallenge } from "@/server/auth/email-change.server";
export const Route = createFileRoute("/api/auth/email-change/new/verify")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        verifyNewEmailChallenge(request, await request.json().catch(() => null)),
    },
  },
});
