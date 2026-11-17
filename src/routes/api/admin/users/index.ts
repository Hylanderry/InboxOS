import { createFileRoute } from "@tanstack/react-router";
import { adminCustomerDetail } from "@/server/admin/admin-customer-detail.server";
import { adminUsers, adminMutateUser } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/users/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new URL(request.url).searchParams.has("userId")
          ? adminCustomerDetail(request)
          : adminUsers(request),
      PATCH: async ({ request }) =>
        adminMutateUser(request, await request.json().catch(() => null)),
    },
  },
});
