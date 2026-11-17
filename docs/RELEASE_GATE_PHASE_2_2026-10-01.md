# InboxOS — Etapa 2: validação da newsletter e gates automáticos

## Alterações feitas

- O endpoint administrativo de upload da newsletter agora confere a assinatura dos primeiros bytes do arquivo **antes** de gravar no Supabase Storage. O MIME informado pelo navegador, isoladamente, não é confiável. Há validação básica para JPEG, PNG, GIF, WebP, MP4 (`ftyp` e bloqueio de marcas de imagem) e WebM (EBML com DocType). Os arquivos inválidos recebem HTTP 415.
- O bucket `newsletter-media` continua com acesso de leitura pública **por necessidade do HTML dos e-mails**. Isso **não** significa permissão de escrita pública; a API de upload segue exigindo papel de ADM autorizado. A assinatura é apenas uma defesa inicial, não substitui antivírus ou decodificação completa e segura.
- A suíte offline ganhou os testes `tests/media-signatures.test.ts`.
- Foi adicionado `.github/workflows/release-gates.yml` que roda `npm ci`, suíte de testes, auditoria de imports/rotas, lint, typecheck e build de produção. O workflow **não** usa chaves de produção e não testa provedores externos.

## Resultados reproduzidos localmente

- `npm test`: 89 testes aprovados, 0 falhas.
- Arquivos de código TS/TSX/MTS continuam com parse válido; inspecionar o resultado de `npm run audit:release` na entrega.
- Consulta **somente leitura** ao Supabase: `newsletter-media` está público para leitura, com limite de 52428800 bytes e MIME permitido para seis formatos; Security Advisor retornou 0 achados.

## Bloqueios ainda não resolvidos

1. O registry do npm não responde neste executor (`EAI_AGAIN`). O pacote `@netlify/vite-plugin-tanstack-start@1.3.19` ainda falta no `package-lock.json`. **Não inventar integrities/tarball hashes.** O CI falhará até regenerar o lock em ambiente com acesso ao registry.
2. Não foi possível executar localmente `npm ci`, ESLint, `tsc --noEmit`, `vite build` e testes HTTP com app iniciado; não declarar build aprovado.
3. `supabase/migrations/20261001230000_protect_last_privileged_members.sql` continua **somente local**, pendente de homologação em banco de testes isolado. Não rodar `supabase db reset` nem reexecutar histórico antigo no projeto vivo.
4. Testes E2E com Supabase Auth, Evolution API, Resend, Groq, webhooks, newsletter e browser permanecem obrigatórios antes do deploy de produção.

## Próximo ambiente com npm disponível

```bash
npm install
# revisão de package-lock.json; commit no controle de versão
npm ci
npm test
npm run audit:release
npm run lint
npx tsc --noEmit
npm run build
# executar Preview com .env isolado e sem acesso a credenciais de produção
npm run dev
# em outro terminal, usando apenas usuários/workspaces de teste:
npm run test:integration
```

Em seguida: homologar a migration em clone/staging, simular concorrência, 401/403/409, suspensão global, troca de owner, Webhook Evolution, OTP, Resend e mensagens de IA. Conferir o artefato gerado e o Deploy Preview da Netlify; não enviar newsletter real sem consentimento explícito dos destinatários.
