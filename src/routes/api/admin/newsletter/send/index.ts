import { createFileRoute } from "@tanstack/react-router";
import { publishCampaign } from "@/server/admin/newsletter.server";
export const Route = createFileRoute("/api/admin/newsletter/send/")({
  server: {
    handlers: {
      POST: async ({ request }) => publishCampaign(request, await request.json().catch(() => null)),
    },
  },
});
