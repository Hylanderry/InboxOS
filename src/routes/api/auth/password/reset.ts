import { createFileRoute } from "@tanstack/react-router";
import { resetPassword } from "@/server/auth/password-recovery.server";
export const Route = createFileRoute("/api/auth/password/reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let p: unknown;
        try {
          p = await request.json();
        } catch {
          p = {};
        }
        return resetPassword(request, p);
      },
    },
  },
});
