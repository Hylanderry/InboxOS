import { createFileRoute } from "@tanstack/react-router";
import { createPrivacyRequest } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        return createPrivacyRequest(request, {
          ...(payload && typeof payload === "object" ? payload : {}),
          requestType: "export",
        });
      },
    },
  },
});
