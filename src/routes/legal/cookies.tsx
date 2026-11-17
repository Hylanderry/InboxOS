import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/components/LegalDocumentPage";
import { getLegalDocument } from "@/features/legal/legal-documents";
export const Route = createFileRoute("/legal/cookies")({ component: CookiesPage });
function CookiesPage() {
  return <LegalDocumentPage document={getLegalDocument("cookies-policy")!} />;
}
