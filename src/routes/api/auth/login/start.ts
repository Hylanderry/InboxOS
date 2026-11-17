import { createFileRoute } from "@tanstack/react-router";
import { startLogin } from "@/server/auth/login.server";
export const Route = createFileRoute("/api/auth/login/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let p: unknown;
        try {
          p = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
        }
        return startLogin(request, p);
      },
    },
  },
});
