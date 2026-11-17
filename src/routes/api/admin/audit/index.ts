import { createFileRoute } from "@tanstack/react-router";
import { adminAudit } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/audit/")({
  server: {
    handlers: {
      GET: ({ request }) => adminAudit(request),
    },
  },
});
