import { createFileRoute } from "@tanstack/react-router";
import { verifyPhoneChange } from "@/server/auth/phone-change.server";
export const Route = createFileRoute("/api/auth/phone-change/verify")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        verifyPhoneChange(request, await request.json().catch(() => null)),
    },
  },
});
