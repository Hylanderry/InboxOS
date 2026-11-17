import { createFileRoute } from "@tanstack/react-router";
import { listCampaigns, upsertCampaign } from "@/server/admin/newsletter.server";
export const Route = createFileRoute("/api/admin/newsletter/")({
  server: {
    handlers: {
      GET: ({ request }) => listCampaigns(request),
      POST: async ({ request }) => upsertCampaign(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => upsertCampaign(request, await request.json().catch(() => null)),
    },
  },
});
