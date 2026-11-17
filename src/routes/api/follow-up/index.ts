import { createFileRoute } from "@tanstack/react-router";
import {
  createFollowUp,
  deleteFollowUp,
  listFollowUps,
  updateFollowUp,
} from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/follow-up/")({
  server: {
    handlers: {
      GET: ({ request }) => listFollowUps(request),
      POST: async ({ request }) => createFollowUp(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => updateFollowUp(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteFollowUp(request),
    },
  },
});
