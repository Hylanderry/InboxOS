import { createFileRoute } from "@tanstack/react-router";
import { createPrivacyRequest, listPrivacyRequests } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/requests")({
  server: {
    handlers: {
      GET: ({ request }) => listPrivacyRequests(request),
      POST: async ({ request }) =>
        createPrivacyRequest(request, await request.json().catch(() => null)),
    },
  },
});
