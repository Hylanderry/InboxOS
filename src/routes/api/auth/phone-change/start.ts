import { createFileRoute } from "@tanstack/react-router";
import { startPhoneChange } from "@/server/auth/phone-change.server";
export const Route = createFileRoute("/api/auth/phone-change/start")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        startPhoneChange(request, await request.json().catch(() => null)),
    },
  },
});
