import { createFileRoute } from "@tanstack/react-router";
import {
  createLead,
  deleteLead,
  listCrm,
  updateLead,
} from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/crm/")({
  server: {
    handlers: {
      GET: ({ request }) => listCrm(request),
      POST: async ({ request }) => createLead(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => updateLead(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteLead(request),
    },
  },
});
