import { createFileRoute } from "@tanstack/react-router";
import { testAgent } from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/agents/test")({
  server: {
    handlers: {
      POST: async ({ request }) => testAgent(request, await request.json().catch(() => null)),
    },
  },
});
