# InboxOS — plano de integração do patch no projeto principal

Status: rascunho para aprovação. Nenhum código novo será aplicado com base neste documento antes da aprovação.

## Intenção

Integrar no projeto principal as correções funcionais e as melhorias do patch, usando o projeto principal como fonte da verdade, preservando as alterações locais existentes e deixando uma sequência verificável para auditoria e execução.

## Evidências atuais

- O patch contém 22 arquivos alterados e 13 arquivos novos relevantes.
- O patch altera `src/styles.css`, componentes Radix, `InboxShell`, `ProductViews`, `SettingsView`, `SystemAdminView`, navegação e rotas.
- Os arquivos `.env` e `.env.local` do patch têm as mesmas chaves e os mesmos valores do projeto principal.
- `.env.example` e `.env.netlify.example` existem somente no projeto principal e são mais completos.
- O patch documenta aplicação incremental e proíbe alterações automáticas em `.env`, produção, RLS e schema.
- O projeto principal já possui alterações locais; substituição integral é proibida.

## Objetivos

1. Incorporar correções funcionais do patch no projeto principal.
2. Preservar paleta, tipografia, tokens visuais, densidade e identidade já existentes.
3. Preservar secrets e configurações válidas do projeto principal.
4. Reconciliar rotas, testes, documentação e contratos sem duplicação.
5. Validar cada lote com testes, lint, TypeScript, auditoria e build.

## Fora de escopo

- Substituir o projeto principal pelo conteúdo completo do patch.
- Copiar `.env` ou `.env.local` do patch sobre o projeto principal.
- Alterar paleta, tipografia, `src/styles.css` ou componentes visuais apenas para reproduzir o patch.
- Aplicar migrations, alterar RLS, executar SQL ou modificar produção.
- Conectar GitHub ou publicar alterações enquanto a conta não for autorizada.
- Excluir o diretório do patch antes da validação e do aceite final.

## Abordagens consideradas

### A. Substituição integral

Copiar todo o patch para o projeto principal. É rejeitada porque sobrescreve trabalho local, inclui artefatos e pode alterar a identidade visual.

### B. Merge seletivo por contrato — abordagem proposta

Aplicar primeiro contratos backend, autorização, endpoints read-only, validações, navegação funcional, testes e documentação. Avaliar cada alteração de frontend visual separadamente e manter a versão principal quando ela mudar cores, fontes, tokens ou densidade. É a abordagem escolhida por equilibrar funcionalidade e preservação visual.

### C. Somente backend

Reduz risco visual, mas deixa de fora correções de navegação, importação e integração de estado que podem ser necessárias para o comportamento completo.

## Plano de execução

### Fase 0 — baseline e proteção

- registrar `git status`, hashes e comandos atuais;
- preservar alterações locais e o patch original;
- confirmar que nenhum secret aparece no diff;
- manter `.env` principal sem cópia automática.

### Fase 1 — configuração e dependências

- comparar `package.json` e `package-lock.json`;
- executar `npm ci` no projeto principal;
- aceitar somente dependências realmente novas e justificadas;
- validar Node, npm, Playwright e scripts existentes.

### Fase 2 — backend e contratos

- aplicar autorização por domínio no ADM;
- integrar endpoint read-only de detalhes do cliente;
- preservar seleção restritiva e ausência de secrets/metadata sensível;
- aplicar validação de importação sem truncamento silencioso;
- revisar rotas e testes de contrato.

### Fase 3 — frontend funcional sem redesign

- integrar navegação, deep-links, estados de carregamento/erro e concorrência quando não houver alteração visual;
- manter classes, cores, fontes e tokens do projeto principal;
- rejeitar ou adaptar qualquer mudança do patch que somente altere aparência.

### Fase 4 — documentação e skills locais

- incorporar documentação útil sem duplicar arquivos;
- usar as skills de engenharia já ativas no Codex;
- não gravar em `.agents` enquanto a pasta estiver somente para leitura;
- não instalar GitHub sem conexão autorizada.

### Fase 5 — verificação

- `npm test`;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run audit:release`;
- `npm run build`;
- Playwright/browser somente com ambiente local ou staging autorizado;
- Supabase somente em leitura até existir acesso e ambiente confirmado.

## Critérios de aceite

- testes e build passam;
- nenhum secret é alterado ou exposto;
- nenhuma migration/RLS/produção é modificada sem autorização específica;
- identidade visual permanece baseada no projeto principal;
- rotas, endpoints, autorização e importação têm cobertura de contrato;
- qualquer alteração visual residual fica listada para decisão explícita;
- rollback continua possível pelo Git e pelo patch preservado.

## Riscos e bloqueios conhecidos

- o projeto principal possui muitas mudanças locais anteriores;
- o Supabase remoto não estava autorizado para consultas MCP;
- a pasta `.agents` do projeto está somente para leitura;
- o GitHub não está conectado nesta conta;
- validação autenticada real exige staging isolado e credenciais próprias.

## Aprovação necessária

A implementação deve começar somente após confirmar este plano. A confirmação também deve indicar se as mudanças de frontend do patch que alteram apenas layout, tokens, cores ou tipografia devem ser descartadas definitivamente ou mantidas em uma lista de backlog visual.
