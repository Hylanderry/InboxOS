import { createFileRoute } from "@tanstack/react-router";
import { startOldEmailChallenge } from "@/server/auth/email-change.server";

export const Route = createFileRoute("/api/auth/email-change/old/start")({
  server: { handlers: { POST: ({ request }) => startOldEmailChallenge(request) } },
});
