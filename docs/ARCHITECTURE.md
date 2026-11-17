# Arquitetura do InboxOS

## Papéis e permissões

Cada membro possui um papel (`owner`, `admin` ou `agent`) e pode receber
restrições por permissão na migration
`20261019110000_workspace_permission_overrides.sql`. As restrições apenas
removem capacidades do papel; nunca concedem ao agente ou administrador uma
permissão que o papel base não possui. Convites carregam a mesma configuração
e ela é aplicada novamente no servidor quando o cadastro é verificado. Toda
alteração é escopada ao workspace ativo e exige `members.manage`.

As rotas protegidas de mensagens, mídia, instâncias, contatos e automação usam
`requireApiPermission` no servidor. Ocultar um botão no frontend não é uma
barreira: uma revogação de permissão retorna `403` também para chamadas diretas
à API. Diagnósticos detalhados de saúde seguem a mesma regra e continuam
restritos a administradores com `workspace.read`.

O InboxOS é um monorepo React/TanStack Start com APIs server-side, Supabase
como persistência multi-tenant e Evolution API como adaptador de mensagens.

## Limites de responsabilidade

- `src/routes/`: páginas e endpoints HTTP do produto;
- `src/server/`: regras de negócio, autenticação, isolamento e integrações;
- `supabase/migrations/`: schema, RLS, índices e funções SQL versionadas;
- `tests/`: contratos unitários e de segurança que não dependem de produção;
- `scripts/`: verificações offline e utilitários de desenvolvimento.

Cada requisição autenticada resolve o workspace a partir da sessão do usuário.
Consultas de conversas, instâncias, contatos, mídia e automações devem carregar
o escopo do workspace e, quando aplicável, o `instance_id`. Credenciais de
integrações são somente server-side; valores com prefixo `VITE_` são públicos.

## Fluxo de publicação

1. Crie um Supabase de staging separado e aplique as migrations em ordem.
2. Configure `.env` a partir de `.env.example`, sem commitar segredos.
3. Rode os gates locais (`npm test`, lint, TypeScript, auditoria e build).
4. Valide dois usuários, dois workspaces e uma instância Evolution de teste.
5. Configure o domínio e os segredos no provedor de hospedagem.

O template não contém um projeto Supabase ou Evolution pré-configurado. Cada
fork deve declarar seus próprios identificadores e domínios.

## Logs e fronteira de privacidade

Erros de autenticação, Evolution, filas e integrações passam por
`src/server/logging.ts`. O helper remove e-mails, telefones, documentos,
tokens, cookies, JWTs e cargas de mídia antes de enviar dados ao coletor de
logs. Não use `console.error` diretamente em handlers; registre o erro com
`logServerError` ou `logServerWarning` e passe apenas metadados operacionais.

O webhook nunca devolve a mensagem original de uma exceção ao chamador. O
detalhe fica restrito ao log sanitizado e ao identificador durável do evento.
