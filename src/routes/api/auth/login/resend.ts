import { createFileRoute } from "@tanstack/react-router";
import { resendLoginCode } from "@/server/auth/login.server";
export const Route = createFileRoute("/api/auth/login/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => resendLoginCode(request, await request.json().catch(() => null)),
    },
  },
});
