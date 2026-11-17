import { createFileRoute } from "@tanstack/react-router";
import { listSystemAdmins, changeSystemAdmin } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/system-admins/")({
  server: {
    handlers: {
      GET: ({ request }) => listSystemAdmins(request),
      POST: async ({ request }) =>
        changeSystemAdmin(request, await request.json().catch(() => null)),
    },
  },
});
