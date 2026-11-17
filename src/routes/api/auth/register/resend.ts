import { createFileRoute } from "@tanstack/react-router";
import { resendRegistrationCode } from "@/server/auth/registration.server";
export const Route = createFileRoute("/api/auth/register/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Corpo JSON inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return resendRegistrationCode(request, payload);
      },
    },
  },
});
