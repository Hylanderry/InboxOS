import { createFileRoute } from "@tanstack/react-router";
import { assignTags, listClients, mutateTag } from "@/server/product/calendar-clients.server";

export const Route = createFileRoute("/api/clients/")({
  server: {
    handlers: {
      GET: ({ request }) => listClients(request),
      POST: async ({ request }) => mutateTag(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => assignTags(request, await request.json().catch(() => null)),
    },
  },
});
