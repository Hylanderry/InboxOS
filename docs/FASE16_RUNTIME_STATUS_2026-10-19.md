# InboxOS — status de runtime e homologação (20/10/2026)

Este registro separa evidência local de validação externa. Nenhuma mensagem foi
enviada pelo WhatsApp e nenhum dado remoto foi alterado nesta auditoria.

## Gates locais

| Gate                                                            | Resultado                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm test`                                                      | **PASS — 425/425**                                                      |
| `npx --no-install tsc --noEmit`                                 | **PASS**                                                                |
| `npm run lint`                                                  | **PASS — 0 erros; 6 avisos preexistentes de Fast Refresh**              |
| `npm run audit:release`                                         | **PASS — 318 fontes e 109 rotas**                                       |
| `npm run audit:public`                                          | **PASS — templates sem credenciais e sem artefatos proibidos**           |
| `npm run audit:prod`                                            | **PASS — 0 vulnerabilidades de produção**                               |
| `npm run build`                                                 | **PASS — Vite + Nitro/Vercel client e SSR**                             |
| `git diff --check`                                              | **PASS** (somente avisos de line ending do Windows)                     |
| `npm audit --omit=dev`                                          | **PASS — 0 vulnerabilidades de produção**                               |
| `npm audit --audit-level=high`                                 | **REVISÃO — 13 vulnerabilidades high apenas em dependências de desenvolvimento; sem correção upstream disponível** |
| `npm run audit:env`                                             | **PASS — configuração estrutural; serviços reais ainda requerem smoke** |
| `npm run test:integration` (servidor local em `127.0.0.1:4182`) | **PASS — 6/6**                                                          |
| `node scripts/validate-ui-updates.mjs` (Vite local em `127.0.0.1:3001`) | **PASS — temas, modal legal e checkbox**                              |

O runner `npm run test:integration:local` tambÃ©m foi validado: ele sobe o Vite
em `127.0.0.1:4182`, executa os 6 contratos HTTP e encerra o processo.

O novo `npm run test:staging:browser` foi adicionado ao workflow manual. Ele
exercita login/cadastro, tema, seletor de país, diálogo legal e páginas legais
em viewport mobile, sem login, escrita ou envio de mensagens. O alvo de
produção é rejeitado antes de qualquer request.

## Playwright isolado

- Auditoria pública mobile em 390×844: **8/8 páginas**, sem overflow, HTTP 4xx/5xx,
  erros de console ou erros de runtime.
- Auditoria funcional autenticada com APIs, Supabase Auth e dados mockados:
  **10/10 áreas**, 0 falhas de página, 0 HTTP >= 400, 0 requisições lentas,
  0 erros de console e 0 erros de runtime.
- A API nativa automática de View Transitions foi removida porque abortava em
  navegações concorrentes. A transição CSS curta do shell continua ativa e é
  desativada para `prefers-reduced-motion`.
- O fluxo de aceite legal do cadastro deixou de depender do comportamento nativo
  de `<label>`/checkbox. A caixa agora abre o diálogo de termos de forma
  determinística também em telas móveis, mantendo o controle acessível.

## Correções incluídas

- Leitura defensiva da resposta parcial da Central de privacidade.
- Migration `20261019120000_privacy_runtime_repair.sql`: status
  `manual_review` e wrapper service-role-only para a rotina de exclusão.
- Contraste do System Admin no tema claro com tokens de texto legíveis.
- Smoke do Evolution com guarda fail-closed para previews Vercel:
  aliases Vercel sem confirmação explícita não são aceitos e a rota/path devem
  ser exatamente a webhook de staging.
- O smoke HTTP geral agora compartilha a mesma allow-list e rejeita aliases
  Vercel sem identificador de deployment gerado.
- A validação HTTP foi executada contra um servidor local real e confirmou que
  APIs privadas, mutações, workspace explícito, webhook Evolution, ADM global e
  origem cruzada recusam acesso anônimo ou inválido antes de tocar provedores.
- A auditoria Playwright isolada foi reexecutada após as últimas alterações:
  10/10 áreas, zero respostas HTTP >= 400, zero requisições lentas, zero erros
  de console e zero erros de runtime.
- A migration `20261019130000_newsletter_media_write_boundary.sql` mantém a
  leitura pública necessária para newsletters, mas remove políticas ambíguas e
  restringe escrita, atualização e exclusão ao `service_role`.
- A migration `20261019131000_chat_media_bucket_boundary.sql` garante que o
  bucket de conversas exista, permaneça privado e aceite operações somente pelo
  `service_role`, sem alterar o conteúdo das mensagens.
- O snapshot de presença realtime agora devolve `instance_id`; o cliente usa a
  identidade canônica da instância ao indexar digitação/gravação, evitando que o
  mesmo telefone em duas conexões seja misturado. A troca de workspace limpa o
  mapa e os temporizadores locais.
- O CRM automático considera somente instâncias com status `open`, e a tela de
  agentes não oferece conexões desconectadas como destino. Leads comerciais já
  existentes continuam preservados, mas sessões encerradas não alimentam novas
  importações.
- Cópia pública sincronizada em `C:\Users\DedSec\Desktop\INBOX OS - OPEN SOURCE - FINAL`.
- A auditoria estrita da cópia pública verifica também documentação/scripts e
  bloqueia refs Supabase, domínios, e-mails pessoais, instâncias Evolution e
  caminhos privados; resultado atual: 481 arquivos limpos.
- O arquivo local `.dev.vars` foi removido do índice Git e adicionado ao
  `.gitignore`; a cópia pública não contém esse arquivo. Como ele já esteve
  versionado com credenciais, as chaves históricas devem ser rotacionadas antes
  de qualquer publicação ou deploy.

O sync manual de grupos agora mantém a enumeração de participantes opt-in
(`participants=true`) e deixa fotos para o backfill por instância; o fluxo
padrão persiste metadados sem bloquear em contas com grupos grandes.

O backfill de fotos também foi fechado para instâncias ativas: `/api/chats/sync-pfp` só consulta e atualiza conversas/contatos cujo `whatsapp_instances.status` esteja `open`, sempre dentro do workspace e da instância canônica.

Foi adicionada a base de conhecimento opcional por workspace (`supabase/migrations/20261019140000_workspace_knowledge_base.sql`). O CRUD exige `agents.manage`, usa RLS/service-role e o agente só recebe até oito documentos quando `includeKnowledgeBase` está explicitamente ativado.

A exportação de privacidade agora inclui `workspace_knowledge_documents` e a migration `20261019150000_privacy_knowledge_cleanup.sql` remove esses documentos na mesma transação quando o workspace entra em estado `deleted`.

O watchdog de instâncias agora mantém `status`, `connection_state` e o início do
epoch de conexão alinhados. As rotinas internas de contatos, grupos e mensagens
recusam instâncias que não estejam abertas.

Em 20/10/2026, o teste manual Playwright confirmou `/auth/register` em 320×640,
390×844 e 1440×900 sem overflow horizontal, sem erros de console/runtime e com
abertura do diálogo legal após o controle ficar visível.

## Ainda não comprovado

Os gates acima não substituem homologação externa. Antes de qualquer release
oficial ainda é necessário, em Supabase/Evolution de staging isolados:

1. aplicar e verificar todas as migrations no projeto correto;
2. testar dois usuários, dois workspaces e duas instâncias com tentativas IDOR;
3. validar webhook, presença, recibos de leitura, mídia e limpeza de desconexão;
4. executar QA autenticado com dados sintéticos reais do staging;
5. só então publicar o build aprovado no Vercel e validar as rotas no domínio.
