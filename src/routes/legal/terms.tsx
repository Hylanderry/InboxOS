import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/components/LegalDocumentPage";
import { getLegalDocument } from "@/features/legal/legal-documents";
export const Route = createFileRoute("/legal/terms")({ component: TermsPage });
function TermsPage() {
  return <LegalDocumentPage document={getLegalDocument("terms-of-use")!} />;
}
