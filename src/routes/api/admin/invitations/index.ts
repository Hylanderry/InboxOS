import { createFileRoute } from "@tanstack/react-router";
import {
  listSystemInvites,
  createSystemInvite,
  revokeSystemInvite,
} from "@/server/admin/admin-invitations.server";
export const Route = createFileRoute("/api/admin/invitations/")({
  server: {
    handlers: {
      GET: ({ request }) => listSystemInvites(request),
      POST: async ({ request }) =>
        createSystemInvite(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) =>
        revokeSystemInvite(request, await request.json().catch(() => null)),
    },
  },
});
