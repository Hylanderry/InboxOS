export interface LegalDocumentDefinition {
  slug:
    | "acceptable-use"
    | "cookies-policy"
    | "payments-cancellation"
    | "privacy-policy"
    | "terms-of-use";
  route: string;
  version: string;
  title: string;
  required: boolean;
  bodyMarkdown: string;
}

export type LegalBranding = {
  brandName?: string | null | undefined;
  legalName?: string | null | undefined;
  supportEmail?: string | null | undefined;
};

const PLATFORM_BRAND = process.env["PLATFORM_BRAND_NAME"]?.trim() || "InboxOS";
const PLATFORM_LEGAL = process.env["PLATFORM_LEGAL_NAME"]?.trim() || "Operador responsável";
const PLATFORM_SUPPORT =
  process.env["PLATFORM_SUPPORT_EMAIL"]?.trim() || "e-mail de suporte configurado";

const BODY = {
  terms: `# Termos de Uso\n\nÚltima atualização: 17 de outubro de 2026.\n\nEstes Termos regem o uso de {{brandName}} ("Plataforma"), disponibilizado por {{legalName}}.\n\n## 1. Aceitação\nAo criar uma conta ou utilizar a Plataforma, você declara ter lido e concordado com estes Termos e com a Política de Privacidade.\n\n## 2. Conta e credenciais\nO usuário deve proteger suas credenciais, dispositivos confiáveis e convites. A organização deve revogar acessos que não sejam mais necessários.\n\n## 3. Workspaces e integrações\nOs dados são organizados por workspace. O administrador é responsável pelos membros, integrações, mensagens e conformidade com os provedores de mensageria.\n\n## 4. Uso aceitável\nÉ proibido usar a Plataforma para spam, fraude, phishing, malware, acesso indevido, violação de direitos ou descumprimento das políticas do WhatsApp.\n\n## 5. Privacidade\nExportação, correção, exclusão, retenção e auditoria seguem a política de privacidade e as configurações do workspace.\n\n## 6. Contato\nSolicitações devem ser encaminhadas para {{supportEmail}}.\n\n## 7. Lei aplicável\nAplicam-se as leis da jurisdição informada pela organização responsável.`,
  privacy: `# Política de Privacidade e Proteção de Dados\n\nÚltima atualização: 17 de outubro de 2026.\n\n{{legalName}} trata dados pessoais no {{brandName}} com medidas de privacy by design e em conformidade com a LGPD, quando aplicável.\n\n## 1. Dados tratados\nPodem ser tratados cadastro, sessões, contatos, mensagens, mídia, presença, CRM, follow-ups, automações e registros de auditoria do workspace.\n\n## 2. Finalidades\nOs dados são usados para autenticação, atendimento, CRM, integrações autorizadas, segurança, suporte, retenção configurada e cumprimento de obrigações legais.\n\n## 3. Compartilhamento\nDados podem ser processados por provedores contratados de infraestrutura, mensageria, e-mail e IA somente para a finalidade autorizada. Segredos nunca são enviados ao navegador ou ao modelo.\n\n## 4. IA e mídia\nA IA é desativada por padrão no workspace e respeita o contexto autorizado. Mídia operacional usa armazenamento privado e URLs assinadas.\n\n## 5. Retenção e direitos\nPrazos são configuráveis pelo workspace. O titular pode solicitar acesso, correção, portabilidade ou exclusão pelo canal {{supportEmail}}.\n\n## 6. Segurança\nO sistema usa sessões revogáveis, escopo por workspace/instância, RLS, auditoria e limites de requisição. Nenhuma medida elimina todos os riscos.`,
  cookies: `# Política de Cookies e Armazenamento Local\n\n{{brandName}} usa armazenamento estritamente necessário para autenticação, segurança, tema e preferências. O identificador de dispositivo confiável não substitui credenciais e pode ser revogado.`,
  payments: `# Política de Pagamentos e Cancelamento\n\nQuando planos pagos forem habilitados, preço, ciclo, limites, cancelamento e tratamento de dados serão apresentados antes da contratação por {{legalName}}.`,
  acceptable: `# Política de Uso Aceitável e Segurança\n\nÉ vedado usar {{brandName}} para fraude, phishing, malware, invasão, spam ilícito, violação de privacidade ou tentativa de acessar workspaces de terceiros.`,
} as const;

export const LEGAL_DOCUMENTS: readonly LegalDocumentDefinition[] = [
  {
    slug: "terms-of-use",
    route: "/legal/terms",
    version: "1.2.0",
    title: "Termos de Uso",
    required: true,
    bodyMarkdown: BODY.terms,
  },
  {
    slug: "privacy-policy",
    route: "/legal/privacy",
    version: "1.2.0",
    title: "Política de Privacidade e Proteção de Dados",
    required: true,
    bodyMarkdown: BODY.privacy,
  },
  {
    slug: "cookies-policy",
    route: "/legal/cookies",
    version: "1.1.0",
    title: "Política de Cookies e Armazenamento Local",
    required: false,
    bodyMarkdown: BODY.cookies,
  },
  {
    slug: "payments-cancellation",
    route: "/legal/payments",
    version: "1.1.0",
    title: "Política de Pagamentos e Cancelamento",
    required: false,
    bodyMarkdown: BODY.payments,
  },
  {
    slug: "acceptable-use",
    route: "/legal/acceptable-use",
    version: "1.1.0",
    title: "Política de Uso Aceitável e Segurança",
    required: false,
    bodyMarkdown: BODY.acceptable,
  },
];

function clean(value: string | null | undefined, fallback: string) {
  const result = value
    ?.replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 160);
  return result || fallback;
}

export function renderLegalMarkdown(markdown: string, branding?: LegalBranding) {
  const values = {
    brandName: clean(branding?.brandName, PLATFORM_BRAND),
    legalName: clean(branding?.legalName, PLATFORM_LEGAL),
    supportEmail: clean(branding?.supportEmail, PLATFORM_SUPPORT),
  };
  return markdown
    .replaceAll("{{brandName}}", values.brandName)
    .replaceAll("{{legalName}}", values.legalName)
    .replaceAll("{{supportEmail}}", values.supportEmail);
}

export function getLegalDocument(slug: LegalDocumentDefinition["slug"], branding?: LegalBranding) {
  const document = LEGAL_DOCUMENTS.find((item) => item.slug === slug);
  if (!document) return null;
  return {
    ...document,
    bodyMarkdown: renderLegalMarkdown(document.bodyMarkdown, branding),
  };
}
