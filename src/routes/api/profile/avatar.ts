import { createFileRoute } from "@tanstack/react-router";
import { uploadAvatar } from "@/server/auth/profile.server";
export const Route = createFileRoute("/api/profile/avatar")({
  server: { handlers: { POST: ({ request }) => uploadAvatar(request) } },
});
