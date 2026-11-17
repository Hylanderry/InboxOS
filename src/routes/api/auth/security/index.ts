import { createFileRoute } from "@tanstack/react-router";
import {
  listSecuritySessions,
  mutateSecuritySession,
} from "@/server/auth/security-sessions.server";
export const Route = createFileRoute("/api/auth/security/")({
  server: {
    handlers: {
      GET: ({ request }) => listSecuritySessions(request),
      POST: async ({ request }) => {
        let p: unknown;
        try {
          p = await request.json();
        } catch {
          p = {};
        }
        return mutateSecuritySession(request, p);
      },
    },
  },
});
