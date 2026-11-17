import { createFileRoute } from "@tanstack/react-router";
import { adminOverview } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/overview/")({
  server: {
    handlers: {
      GET: ({ request }) => adminOverview(request),
    },
  },
});
