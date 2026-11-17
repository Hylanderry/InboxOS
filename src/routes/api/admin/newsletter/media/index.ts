import { createFileRoute } from "@tanstack/react-router";
import { uploadNewsletterAsset } from "@/server/admin/newsletter.server";
export const Route = createFileRoute("/api/admin/newsletter/media/")({
  server: {
    handlers: {
      POST: ({ request }) => uploadNewsletterAsset(request),
    },
  },
});
