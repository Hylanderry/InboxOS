import { createFileRoute } from "@tanstack/react-router";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
} from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/agents/")({
  server: {
    handlers: {
      GET: ({ request }) => listAgents(request),
      POST: async ({ request }) => createAgent(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => updateAgent(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteAgent(request),
    },
  },
});
