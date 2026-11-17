import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/components/LegalDocumentPage";
import { getLegalDocument } from "@/features/legal/legal-documents";
export const Route = createFileRoute("/legal/privacy")({ component: PrivacyPage });
function PrivacyPage() {
  return <LegalDocumentPage document={getLegalDocument("privacy-policy")!} />;
}
