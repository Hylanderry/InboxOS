import { createFileRoute } from "@tanstack/react-router";
import { getClientTimeline } from "@/server/product/calendar-clients.server";

export const Route = createFileRoute("/api/clients/$id/timeline")({
  server: {
    handlers: {
      GET: ({ request, params }) => getClientTimeline(request, params.id),
    },
  },
});
