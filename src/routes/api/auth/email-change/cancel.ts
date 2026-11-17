import { createFileRoute } from "@tanstack/react-router";
import { cancelEmailChange } from "@/server/auth/email-change.server";
export const Route = createFileRoute("/api/auth/email-change/cancel")({
  server: { handlers: { POST: ({ request }) => cancelEmailChange(request) } },
});
