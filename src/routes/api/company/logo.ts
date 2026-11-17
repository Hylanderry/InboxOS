import { createFileRoute } from "@tanstack/react-router";
import { uploadCompanyLogo } from "@/server/auth/profile.server";
export const Route = createFileRoute("/api/company/logo")({
  server: { handlers: { POST: ({ request }) => uploadCompanyLogo(request) } },
});
