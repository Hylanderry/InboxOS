import { createFileRoute } from "@tanstack/react-router";
import { adminMembers, adminMutateMember } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/members/")({
  server: {
    handlers: {
      GET: ({ request }) => adminMembers(request),
      PATCH: async ({ request }) =>
        adminMutateMember(request, await request.json().catch(() => null)),
    },
  },
});
