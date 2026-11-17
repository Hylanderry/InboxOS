import { createFileRoute } from "@tanstack/react-router";
import { verifyOldEmailChallenge } from "@/server/auth/email-change.server";
export const Route = createFileRoute("/api/auth/email-change/old/verify")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        verifyOldEmailChallenge(request, await request.json().catch(() => null)),
    },
  },
});
