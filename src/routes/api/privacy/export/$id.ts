import { createFileRoute } from "@tanstack/react-router";
import { getPrivacyExportDownload } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/export/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => getPrivacyExportDownload(request, params.id),
    },
  },
});
