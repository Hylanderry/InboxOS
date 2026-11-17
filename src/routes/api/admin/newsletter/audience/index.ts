import { createFileRoute } from "@tanstack/react-router";
import { listAudience, addAudience } from "@/server/admin/admin-newsletter-audience.server";
export const Route = createFileRoute("/api/admin/newsletter/audience/")({
  server: {
    handlers: {
      GET: ({ request }) => listAudience(request),
      POST: async ({ request }) => addAudience(request, await request.json().catch(() => null)),
    },
  },
});
