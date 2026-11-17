import { createFileRoute } from "@tanstack/react-router";
import {
  listIntegrations,
  createIntegration,
  updateIntegration,
} from "@/server/admin/integration-vault.server";
export const Route = createFileRoute("/api/admin/integrations/")({
  server: {
    handlers: {
      GET: ({ request }) => listIntegrations(request),
      POST: async ({ request }) =>
        createIntegration(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) =>
        updateIntegration(request, await request.json().catch(() => null)),
    },
  },
});
