import { createFileRoute } from "@tanstack/react-router";
import { rotateSecret } from "@/server/admin/integration-vault.server";
export const Route = createFileRoute("/api/admin/integrations/rotate/")({
  server: {
    handlers: {
      POST: async ({ request }) => rotateSecret(request, await request.json().catch(() => null)),
    },
  },
});
