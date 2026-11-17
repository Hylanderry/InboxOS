import { createFileRoute } from "@tanstack/react-router";
import { uploadCompanyFavicon } from "@/server/auth/profile.server";

export const Route = createFileRoute("/api/company/favicon")({
  server: { handlers: { POST: ({ request }) => uploadCompanyFavicon(request) } },
});
