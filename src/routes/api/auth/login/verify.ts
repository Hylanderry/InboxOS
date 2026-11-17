import { createFileRoute } from "@tanstack/react-router";
import { verifyLogin } from "@/server/auth/login.server";
export const Route = createFileRoute("/api/auth/login/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let p: unknown;
        try {
          p = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
        }
        return verifyLogin(request, p);
      },
    },
  },
});
