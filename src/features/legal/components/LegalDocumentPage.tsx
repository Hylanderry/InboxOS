import { Link } from "@tanstack/react-router";
import type { LegalDocumentDefinition } from "../legal-documents";
export function LegalDocumentPage({ document }: { document: LegalDocumentDefinition }) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <header className="legal-meta">
          <Link to="/auth/register" className="legal-back">
            Voltar ao cadastro
          </Link>
          <span>Versão {document.version}</span>
        </header>
        <div className="legal-copy">
          {document.bodyMarkdown.split("\n").map((l, i) => {
            const t = l.trim();
            if (!t) return <div key={i} className="h-2" />;
            if (t.startsWith("## ")) return <h2 key={i}>{t.slice(3)}</h2>;
            if (t.startsWith("# ")) return <h1 key={i}>{t.slice(2)}</h1>;
            return <p key={i}>{t}</p>;
          })}
        </div>
        <footer className="legal-footer-note">
          Minuta técnica. Revisão jurídica recomendada antes do lançamento comercial.
        </footer>
      </article>
    </main>
  );
}
