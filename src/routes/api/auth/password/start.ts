import { createFileRoute } from "@tanstack/react-router";
import { startPasswordRecovery } from "@/server/auth/password-recovery.server";
export const Route = createFileRoute("/api/auth/password/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let p: unknown;
        try {
          p = await request.json();
        } catch {
          p = {};
        }
        return startPasswordRecovery(request, p);
      },
    },
  },
});
