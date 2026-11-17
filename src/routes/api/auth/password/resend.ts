import { createFileRoute } from "@tanstack/react-router";
import { resendPasswordRecoveryCode } from "@/server/auth/password-recovery.server";
export const Route = createFileRoute("/api/auth/password/resend")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        resendPasswordRecoveryCode(request, await request.json().catch(() => null)),
    },
  },
});
