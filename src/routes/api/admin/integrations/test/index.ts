import { createFileRoute } from "@tanstack/react-router";
import { testIntegration } from "@/server/admin/integration-vault.server";
export const Route = createFileRoute("/api/admin/integrations/test/")({
  server: {
    handlers: {
      POST: async ({ request }) => testIntegration(request, await request.json().catch(() => null)),
    },
  },
});
