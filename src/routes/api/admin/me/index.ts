import { createFileRoute } from "@tanstack/react-router";
import { adminMe } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/me/")({
  server: {
    handlers: {
      GET: ({ request }) => adminMe(request),
    },
  },
});
