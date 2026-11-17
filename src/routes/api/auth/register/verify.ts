import { createFileRoute } from "@tanstack/react-router";
import { verifyRegistration } from "@/server/auth/registration.server";
export const Route = createFileRoute("/api/auth/register/verify")({
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
        return verifyRegistration(request, payload);
      },
    },
  },
});
