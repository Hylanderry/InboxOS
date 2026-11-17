import { createFileRoute } from "@tanstack/react-router";
import {
  createStage,
  deleteStage,
  listStages,
  updateStage,
} from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/crm/stages")({
  server: {
    handlers: {
      GET: ({ request }) => listStages(request),
      POST: async ({ request }) => createStage(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => updateStage(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteStage(request),
    },
  },
});
