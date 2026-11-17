# InboxOS

InboxOS é um painel multi-tenant para atendimento e vendas por WhatsApp, integrado à Evolution API, Supabase, Resend e Groq. Esta cópia é um modelo white-label para publicação e fork, com Billing desativado por padrão.

Origem e manutenção: **Ackley Studios by Trax Company**.

## Recursos

- autenticação com OTP, dispositivos confiáveis, recuperação de senha e sessões revogáveis;
- Inbox com mensagens, presença, grupos, reações, edição, leitura e mídia privada;
- conexões Evolution isoladas por workspace e instância, sem importação histórica após a conexão;
- CRM, clientes, tags, follow-ups, calendário e agentes de IA com handoff humano;
- branding por workspace (nome, logo, favicon, domínio e remetente de e-mail);
- privacidade com exportação, exclusão programada, retenção, auditoria e opt-out de IA;
- ADM global protegido, convites por função e cofre de integrações server-side.

## Desenvolvimento local

Requisitos: Node.js 22.12+ e npm 10.9+ (a mesma faixa usada pelo CI).

```bash
npm install
# macOS/Linux: cp .env.example .env
# PowerShell:  Copy-Item .env.example .env
npm run dev
```

Preencha `.env` somente com credenciais próprias. Nunca publique `.env`, service role, chaves da Evolution, Resend, Groq ou `AUTH_CRYPTO_SECRET`.

## Variáveis de ambiente e Vercel

- `.env.example`: desenvolvimento local;
- `VITE_PLATFORM_BRAND_NAME`: nome público padrão antes de resolver o workspace (não é segredo);
- Vercel é o único destino de deploy: configure as variáveis no projeto Vercel e use `vercel.json`.

Chaves server-side não podem usar o prefixo `VITE_`. As migrations em `supabase/migrations` devem ser aplicadas primeiro em um projeto Supabase de staging isolado. A migration `20261018092000_white_label_runtime_defaults.sql` cria os defaults de privacidade, habilita revisão manual de correções e exige nomes de instância Evolution globalmente únicos; ela falha de forma explícita se houver duplicidade para resolver antes. Nunca copie `.env` para o repositório.

Em um deploy de produção, configure também `EXPECTED_SUPABASE_PROJECT_REF` com
o ref do seu próprio projeto. O template não fixa nenhum projeto Supabase.

> **Importante para forks:** a fundação Auth/multi-tenant está nas migrations versionadas, mas deve ser validada em staging antes de produção. Consulte [`docs/OPEN_SOURCE_SETUP.md`](docs/OPEN_SOURCE_SETUP.md) e teste cadastro, OTP, login, convite e RLS antes de publicar.

O roteiro de isolamento e smoke test está em
[`docs/STAGING_HANDOFF.md`](docs/STAGING_HANDOFF.md). Sem um preview e um
Supabase/Evolution de staging confirmados, o build não deve ser promovido.

Os controles técnicos de privacidade e LGPD estão documentados em
[`docs/PRIVACY_LGPD.md`](docs/PRIVACY_LGPD.md).

## Gates antes de publicar

```bash
npm test
npm run lint
npx tsc --noEmit
npm run audit:release
npm run audit:public
npm run audit:prod
npm run build
```

Os testes locais validam contratos, isolamento, rotas, mídia e UI. Homologação real ainda exige dois usuários, dois workspaces e instâncias Evolution separadas em staging. Não execute testes de envio contra WhatsApp de produção.

Para executar a suite HTTP local sem deixar um servidor aberto, use:

```bash
npm run test:integration:local
```

Esse comando inicia o Vite apenas em `127.0.0.1`, executa os contratos de
autenticacao, isolamento, webhook e ADM e encerra o processo automaticamente.
Para um Deploy Preview, use `TEST_BASE_URL` com `npm run test:integration` e
valide primeiro o alvo com `node scripts/validate-staging-target.mjs`. Depois,
execute `npm run test:staging:browser` para conferir auth/legal UI e mobile sem
escrever dados ou enviar mensagens.

## Estrutura

- `src/`: aplicação React/TanStack Start e APIs server-side;
- `supabase/migrations/`: schema, RLS e funções de banco;
- `tests/`: testes unitários e contratos de segurança;
- `scripts/`: utilitários de auditoria e desenvolvimento;
- `docs/`: decisões, checklists e documentação de operação.

## Licença

Distribuído sob a licença MIT. Consulte `LICENSE` e `SECURITY.md` antes de abrir issues ou configurar uma instalação pública.
