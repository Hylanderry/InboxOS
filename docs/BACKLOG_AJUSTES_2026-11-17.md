# InboxOS — Backlog de ajustes (2026-11-17)

Levantamento feito por auditoria de código (read-only), testes de conectividade e gates
(`npm test` 453/453, `tsc` OK, `lint` 0 erros, `audit:release` PASS). Ordem = prioridade.

## P0 — Infra e ambiente (bloqueia todo o resto)
- [ ] **Evolution: `CORS_ORIGIN=*`** — com origem restrita, toda chamada server-to-server volta 500 "Not allowed by CORS". Corrigido em `.env.evolution`; reaplicar no Easypanel.
- [ ] **Chave da Evolution sincronizada** — `AUTHENTICATION_API_KEY` nova precisa estar em ADM › Integrações › Evolution (`api_key`, tem prioridade) **e** em Vercel `EVOLUTION_API_KEY`.
- [ ] **Rotacionar segredos expostos** (chaves e senhas Postgres/Redis coladas em chat) — `ALTER USER` antes de trocar a URI.
- [ ] **Ambiente de staging** — `.env` local aponta para o Supabase de produção (`bopdgnmifuohuoftjexs`). Criar Supabase staging + instância Evolution sandbox para testar logado sem tocar clientes reais.
- [ ] **Confirmar migrations aplicadas em produção** (`FASE16_RUNTIME_STATUS:109`), em especial `20261017090000_repair_workspace_isolation` e `20261018092000` (índice único global de instância).
- [ ] **Backlog de eventos Evolution** (~38,6k na fila, ~8,3k dead-letter, erro 42P10) — não reprocessar antes de corrigir o item "replay por nome" abaixo.

## P0 — Isolamento multi-tenant do WhatsApp
- [ ] **Membros legados no workspace `…0001`** — migration `20260915120000` adicionou todo usuário ao workspace padrão; o reparo só removeu `role='agent'`. Auditar (SELECT) e remover membros indevidos de outros papéis.
- [ ] **Webhook resolve tenant só pelo nome da instância + token global** (`webhooks/evolution.ts:167-181`, `evolution.server.ts:973-988`) — adotar token/segredo por instância.
- [ ] **Replay da fila re-resolve por nome** (`event-inbox.ts:120-139`) — usar `workspace_id/instance_id` gravados no evento.
- [ ] **Purge apaga a linha mas deixa a instância na Evolution** (`instance-lifecycle.ts:197-202`) — nome fica livre para outro tenant.
- [ ] **Envio sem `instanceName` escolhe qualquer número conectado** (`messages/send.ts:86-96`) — exigir instância explícita.
- [ ] **`persist_inbox_message` busca chat por `instance_name`** e não `instance_id` (`20261012133000:56-62`).
- [ ] **Conexões não reage à troca de workspace** (`useInstances.ts`) — mostra o workspace anterior até 30 s.
- [ ] **Corrida check-then-insert ao criar instância** (`instances/index.ts:195-216`).
- [ ] Menor: `/api/media/$` aceita caminho legado `chat/` com `ilike` (`_` vira curinga).
- [ ] Watchdog reescreve o webhook a cada GET `/api/instances` — qualquer outro ambiente que compartilhe a mesma Evolution "rouba" o webhook da produção.

## P1 — Base visual (o que dá cara de "feito por IA")
- [ ] Unificar design system: trocar tokens slate/azulados do shadcn (`styles.css:64-133`) pela paleta Trax neutra; token semântico `--whatsapp`.
- [ ] Escala tipográfica fixa (11/12/13/15/20) — eliminar 9–10px (~125 ocorrências) e tamanhos fracionados.
- [ ] Ícones Phosphor: 3 tamanhos, 1 peso (hoje ~20 tamanhos e 3 pesos).
- [ ] Cinzas: um só família (hoje neutral ×497, zinc ×221, slate, 233 hex soltos incl. cinzas do WhatsApp Web).
- [ ] Verde só quando semântico (`#00a884` ×54 em CTAs e seleção).
- [ ] Regra de raio (hoje xl/lg/2xl/3xl sem critério).
- [ ] Tema via tokens/`dark:` em vez de prop `isDarkMode` com ternários.
- [ ] Usar os primitivos shadcn (button, input, table, tabs, dialog) em vez de `card()/inputClass()` recriados por tela.
- [ ] Enxugar `styles.css` (3.246 linhas, 56 `!important`, camadas por fase).
- [ ] Remover card-dentro-de-card; listas e tabelas onde há dados.

## P1 — ADM
- [ ] **Bug provável: inputs perdem foco a cada tecla** — `Field`/`Box` declarados dentro do componente (`SystemAdminView.tsx:186-234`).
- [ ] Tabelas reais (usuários, workspaces, auditoria) com busca server-side, paginação e drawer de detalhes.
- [ ] Cabeçalho duplicado (`admin.tsx:121` + `SystemAdminView.tsx:389`); abas finas; estado por aba (hoje um `data` compartilhado).
- [ ] Sem UUID cru; adicionar System Admin por e-mail, não por UUID.
- [ ] Integrações por formulário, não textarea JSON.
- [ ] Auditoria com filtros (ação, alvo, período) e rótulos legíveis.
- [ ] Modo claro do ADM (cores hard-coded).

## P1 — Agentes de IA
- [ ] Painel de teste estilo chat (conversa contínua, contexto visível) em vez de input único.
- [ ] Toggle real para ativar/desativar; rótulos legíveis no lugar de `reply_mode` cru.
- [ ] Usar `ConfirmDialog` e modal padrão (hoje modal/confirm feitos à mão).
- [ ] Execuções recentes com data, agente e link para o chat.
- [ ] Remover card-dentro-de-card no editor e na base de conhecimento.

## P1 — Conexões WhatsApp
- [ ] Estados reais: conectando / aguardando QR / conectado / desconectado / erro (hoje binário e oculta desconectadas).
- [ ] QR com contagem de expiração, botão de renovar e alternativa por código de pareamento.
- [ ] Cartão com última atividade, volume e agente atribuído.
- [ ] Corrigir divisor escuro no modo claro e cores fora da paleta.

## P2 — Demais telas
- [ ] Dashboard: poucas métricas com tendência + listas acionáveis (hoje 10 cards iguais).
- [ ] CRM: colunas conforme nº de etapas; arrastar-e-soltar.
- [ ] Clientes: tabela ordenável em vez de grade de cards; filtros compactos.
- [ ] Follow-up: atraso com texto, não só ícone vermelho.
- [ ] Calendário: rótulos ≥12px; painel lateral mais leve.
- [ ] Configurações: navegação interna por seção.
- [ ] Larguras de página e níveis de título consistentes entre telas.
- [ ] Remover `FeaturePlaceholder.tsx` (código morto).

## P2 — Qualidade
- [ ] QA visual real em 320/360/390/768/1024/1440, claro/escuro, teclado (pendências F14/F16 UI-B01…B12).
- [ ] 6 warnings de lint (`react-refresh/only-export-components`).
- [ ] Atualizar deps deprecadas (recharts 2 → 3, eslint 9).
