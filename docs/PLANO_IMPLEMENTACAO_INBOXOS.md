# 📋 Plano de Implementação Completo — InboxOS

> **Objetivo:** Transformar o InboxOS em uma plataforma SaaS premium com atendimento humanizado e auto-aprimoramento contínuo.
>
> **Última atualização:** 2026-11-24
>
> **Status do repositório:** ✅ Push realizado para [Hylanderry/InboxOS](https://github.com/Hylanderry/InboxOS)

---

## 🎯 Visão Geral das Áreas

| Área | Foco Principal | Impacto no Negócio |
|------|---------------|-------------------|
| **A. Infraestrutura & Backend** | Confiabilidade, segurança, performance | Base sólida para todas as features |
| **B. Chat & Atendimento** | UX fluida, acessibilidade, estados | Experiência do atendente |
| **C. Dashboard & Analytics** | Gráficos cartesianos, KPIs acionáveis | Visibilidade operacional |
| **D. CRM & Pipeline** | Sugestões inteligentes, timeline | Vendas mais eficientes |
| **E. Agentes IA** | Feedback loop, aprendizado contínuo | Auto-aprimoramento da IA |
| **F. Clientes** | Perfil rico, histórico unificado | Atendimento humanizado |
| **G. Follow-up & Calendário** | Automação inteligente, lembretes | Proatividade no atendimento |
| **H. Polimento & Acessibilidade** | Animações, responsividade, a11y | Qualidade percebida |

---

## 🏗️ SPRINT 1 — Fundação (Crítico)

### A1. Corrigir duplicação de chats sob concorrência
- **Arquivo:** `src/server/evolution/sync-engine.ts:628-649`
- **Problema:** Chat upsert gera UUID aleatório → conversas duplicadas quando dois workers processam o mesmo phone/workspace simultaneamente
- **O que PODE fazer:** Gerar UUID determinístico via `uuidv5(namespace, workspace_id + instance_name + phone)` OU mudar `onConflict` para unique constraint real `(workspace_id, instance_name, phone)`
- **O que NÃO PODE fazer:** Manter geração de UUID aleatório; ignorar a unique constraint existente no banco
- **Resultado esperado:** Zero conversas duplicadas sob qualquer cenário de concorrência
- **Como testar:** Simular 10 webhooks simultâneos para o mesmo phone/workspace; verificar que apenas 1 chat existe no banco
- **Observador:** Query `SELECT COUNT(*) FROM chats WHERE workspace_id = ? AND phone = ?` deve retornar sempre 1

### A2. Cache de contatos isolado por tenant
- **Arquivo:** `src/server/evolution/sync-engine.ts:231-324`
- **Problema:** Cache global por processo serverless → cross-tenant em container frio
- **O que PODE fazer:** Mover para `Map<workspaceId, Map<key,value>>` ou usar Supabase como cache compartilhado; adicionar namespace no `lastContactRefresh`
- **O que NÃO PODE fazer:** Compartilhar estado entre workspaces no mesmo processo
- **Resultado esperado:** Dados de um workspace nunca vazam para outro via cache
- **Como testar:** Criar 2 workspaces, popular contatos diferentes, verificar que cada um vê apenas seus próprios dados
- **Observador:** Logs de cache hit/miss devem mostrar workspace_id correto

### A3. Guardrail automático para supabaseAdmin
- **Arquivo:** `src/integrations/supabase/client.server.ts:67-72`
- **Problema:** Cliente admin bypassa RLS sem enforcement automático
- **O que PODE fazer:** Criar wrapper `scopedAdmin(workspaceId)` que injeta `.eq("workspace_id", workspaceId)` automaticamente; adicionar lint rule customizada
- **O que NÃO PODE fazer:** Confiar que todo desenvolvedor lembrará de filtrar por workspace_id manualmente
- **Resultado esperado:** Impossível escrever query admin sem escopo de workspace
- **Como testar:** Tentar query sem workspace_id deve lançar erro em dev; code review automatizado deve bloquear PRs sem scopedAdmin
- **Observador:** ESLint rule `inboxos/no-unscoped-admin` ativa no CI

### B1. ReactionMenu acessível em mobile
- **Arquivo:** `src/features/inbox/components/MessageBubble.tsx:246-258`
- **Problema:** Botão de reação usa `sm:opacity-0 sm:group-hover/row:opacity-100` → invisível em touch devices
- **O que PODE fazer:** Adicionar long-press/context menu em mobile; tornar botão sempre visível em touch com tamanho reduzido (≥44px)
- **O que NÃO PODE fazer:** Depender exclusivamente de hover para funcionalidade crítica
- **Resultado esperado:** Usuários mobile conseguem reagir a mensagens com gesto natural
- **Como testar:** Abrir no Chrome DevTools mobile emulation + dispositivo real Android/iOS; verificar que reação funciona
- **Observador:** Teste E2E com Playwright simulando touch events

### B2. Performance do usePresence (N+1 subscriptions)
- **Arquivo:** `src/features/inbox/components/ConversationRow.tsx:24-30`
- **Problema:** Cada ConversationRow chama `usePresence()` → 100+ subscriptions globais → re-render em cascata
- **O que PODE fazer:** Extrair para Context/Provider acima da lista; usar zustand/jotai com subscription seletiva por chave
- **O que NÃO PODE fazer:** Manter setState global que dispara em todas as rows simultaneamente
- **Resultado esperado:** Lista de 200 conversas com scroll fluido (60fps); apenas row afetada re-renderiza
- **Como testar:** React DevTools Profiler: abrir lista com 200 conversas, receber evento de presença, verificar que <5 componentes re-renderizam
- **Observador:** Métrica de FPS no browser ≥55 durante scroll com lista cheia

### B3. Preservar draft do composer entre chats
- **Arquivo:** `src/features/inbox/components/InboxShell.tsx:666-721`
- **Problema:** `key={activeChat.id}` força remount completo → perde texto digitado ao trocar conversa
- **O que PODE fazer:** Remover `key`; salvar draft em store externo (zustand/context) keyed por chatId; resetar estado interno via effects
- **O que NÃO PODE fazer:** Destruir DOM do composer a cada troca de conversa
- **Resultado esperado:** Atendente digita mensagem, troca de chat, volta → texto preservado exatamente como estava
- **Como testar:** Digitar texto em chat A, clicar em chat B, voltar em chat A; verificar que texto persiste; repetir com 5 chats diferentes
- **Observador:** Estado do draft inspecionável via React DevTools; nenhum re-mount desnecessário

### B4. Busca global acessível em mobile/tablet
- **Arquivo:** `src/features/inbox/components/InboxShell.tsx:506`
- **Problema:** Campo de busca usa `hidden lg:flex` → inacessível em viewports <1024px
- **O que PODE fazer:** Adicionar botão de busca em mobile que expande overlay fullscreen; integrar na ConversationList mobile
- **O que NÃO PODE fazer:** Esconder funcionalidade essencial em telas menores
- **Resultado esperado:** Usuário mobile encontra qualquer conversa em ≤2 toques
- **Como testar:** Viewport 375px, 768px, 1024px; verificar que busca está acessível e funcional em todos
- **Observador:** Lighthouse accessibility score ≥90 em mobile

---

## 📊 SPRINT 2 — Dashboard & Analytics

### C1. Gráficos cartesianos com filtros de período
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (DashboardView, linhas 295-572)
- **Problema:** KPIs são números estáticos sem tendência temporal; sem filtros de data
- **O que PODE fazer:** Usar Recharts (já instalado em `src/components/ui/chart.tsx`) para gráficos de linha/barra; adicionar seletor 7d/10d/30d/90d/custom; endpoint `loadDashboard(period)` com parâmetro de período
- **O que NÃO PODE fazer:** Adicionar biblioteca nova de charts; hardcodar períodos sem opção custom
- **Resultado esperado:** Dashboard mostra evolução temporal de mensagens, conversas, pipeline; usuário seleciona período e todos os KPIs/gráficos atualizam
- **Como testar:** Selecionar cada período pré-definido + custom range; verificar que dados mudam corretamente; redimensionar janela para responsividade dos gráficos
- **Observador:** Gráficos renderizam em <500ms após mudança de filtro; tooltips mostram valores corretos

### C2. Métricas de qualidade do atendimento
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (DashboardView)
- **Problema:** Sem KPIs de tempo médio de resposta, taxa de resolução, satisfação
- **O que PODE fazer:** Calcular métricas server-side via SQL aggregation; exibir cards com tendência (↑↓ vs período anterior); adicionar meta configurável por workspace
- **O que NÃO PODE fazer:** Mostrar métricas sem contexto de comparação; calcular no client-side com dados incompletos
- **Resultado esperado:** Atendente vê claramente se está melhorando ou piorando; gestor identifica gargalos
- **Como testar:** Criar cenário com 50 mensagens respondidas em tempos variados; verificar que média calculada bate com planilha manual
- **Observador:** Métricas atualizam em tempo real (<30s delay) após novas interações

### C3. Insights preditivos na seção "Precisa de atenção"
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (DashboardView)
- **Problema:** Seção é reativa (mostra problemas atuais), não preditiva
- **O que PODE fazer:** Heurísticas simples: leads estagnados há X dias, clientes com risco de churn (inatividade >30d), horários de pico previstos baseado em histórico
- **O que NÃO PODE fazer:** ML complexo sem dados suficientes; alertas falsos positivos frequentes
- **Resultado esperado:** Atendente recebe sugestões proativas antes que problemas aconteçam
- **Como testar:** Criar lead parado há 5 dias; verificar que aparece como insight; criar cliente inativo há 35 dias; verificar alerta de churn
- **Observador:** Insights aparecem em <2s após carregamento do dashboard; dismiss persistente por sessão

---

## 🤖 SPRINT 3 — Humanização & Auto-Aprimoramento

### E1. Feedback loop nos agentes IA (thumbs up/down)
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (AgentsView, linhas 2321-3833) + novo endpoint
- **Problema:** Agentes não aprendem com interações reais; zero mecanismo de feedback
- **O que PODE fazer:** Botões 👍/👎 em respostas no Inbox; log de respostas editadas/rejeitadas pelo humano; painel de "respostas problemáticas" para revisão; tabela `agent_feedback` no Supabase
- **O que NÃO PODE fazer:** Fine-tuning automático sem supervisão humana; expor dados de feedback entre tenants
- **Resultado esperado:** Agente melhora progressivamente baseado em correções humanas; operador identifica padrões de erro
- **Como testar:** Enviar 10 mensagens de teste; dar thumbs down em 3; verificar que aparecem no painel de revisão; editar resposta e verificar que edição é logada
- **Observador:** Contagem de feedback positivo/negativo por agente visível no AgentsView; export CSV disponível

### F1. Timeline/histórico unificado por cliente
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (ClientsView, linhas 4598-5224) + novo componente
- **Problema:** Não há visão consolidada de todas as interações por cliente
- **O que PODE fazer:** Drawer/modal com timeline cronológica: mensagens, agendamentos, follow-ups, mudanças no CRM, notas; query JOIN entre tabelas messages/appointments/follow_ups/crm_leads
- **O que NÃO PODE fazer:** Carregar todo o histórico de uma vez sem paginação; mostrar dados de outros clientes por acidente
- **Resultado esperado:** Atendente clica em cliente → vê toda a jornada em ordem cronológica; contexto completo para atendimento humanizado
- **Como testar:** Cliente com 20 mensagens, 3 agendamentos, 2 follow-ups, 1 mudança de etapa CRM; abrir timeline e verificar que tudo aparece na ordem correta
- **Observador:** Timeline carrega em <1s para clientes com até 500 eventos; scroll infinito para históricos maiores

### F2. Perfil rico do cliente
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (ClientsView)
- **Problema:** Perfil básico (nome, telefone, email, empresa) insuficiente para humanização
- **O que PODE fazer:** Adicionar campos: aniversário, preferências, tags coloridas, LTV, última interação, canal preferido, observações pessoais; migration no Supabase
- **O que NÃO PODE fazer:** Campos obrigatórios que atrasam cadastro; PII sensível sem criptografia
- **Resultado esperado:** Atendente conhece o cliente além do transacional; personalização natural nas conversas
- **Como testar:** Preencher todos os novos campos; verificar que persistem após refresh; verificar que aniversário dispara lembrete no dashboard
- **Observador:** Formulário valida tipos (data, número); campos opcionais não bloqueiam salvamento

### D1. Sugestões automáticas de follow-up
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (FollowUpView, linhas 1692-2146) + endpoint `suggestFollowUps`
- **Problema:** Follow-ups 100% manuais; sistema não sugere ações baseadas em eventos
- **O que PODE fazer:** Regras heurísticas: proposta enviada → follow-up em 3 dias; reunião agendada → lembrete 1 dia antes; lead inativo 7 dias → reengajamento; endpoint retorna sugestões contextualizadas
- **O que NÃO PODE fazer:** Criar follow-ups automaticamente sem confirmação humana; sugerir ações irrelevantes baseadas em dados incompletos
- **Resultado esperado:** Atendente recebe sugestões inteligentes; aceita com 1 clique ou descarta; follow-up vinculado à conversa original
- **Como testar:** Enviar proposta via WhatsApp; verificar que sugestão aparece em 5 min; aceitar sugestão; verificar que follow-up criado com link para conversa
- **Observador:** Sugestões aparecem em badge no FollowUpView; taxa de aceitação >40% indica relevância

### G1. Lembretes automáticos via WhatsApp para agendamentos
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (CalendarView, linhas 3870-4594) + worker/job
- **Problema:** Calendário cria agendamentos mas não envia lembretes ao cliente
- **O que PODE fazer:** Job que roda a cada 15 min; consulta agendamentos nas próximas 24h e 1h; envia mensagem via Evolution API; marca como `reminder_sent` para evitar duplicata
- **O que NÃO PODE fazer:** Enviar lembrete fora do horário comercial sem configuração explícita; enviar para número errado por falha de lookup
- **Resultado esperado:** Cliente recebe lembrete 24h e 1h antes; redução de no-shows; atendente não precisa lembrar manualmente
- **Como testar:** Criar agendamento para daqui a 25h; esperar job rodar; verificar que mensagem chegou no WhatsApp do cliente; verificar log de envio
- **Observador:** Tabela `appointment_reminders` com status sent/pending/failed; dashboard mostra taxa de entrega

---

## 🔧 SPRINT 4 — Correções Técnicas Medium/High

### B5. Auto-select agressivo de chat
- **Arquivo:** `src/features/inbox/components/InboxShell.tsx:263-273`
- **Fix:** Só auto-selecionar quando `selectedChatId === null`; preservar seleção anterior em ref; restaurar quando voltar a estar disponível na lista filtrada

### B6. Focus trap no dropdown do ChatHeader
- **Arquivo:** `src/features/inbox/components/ChatHeader.tsx:57`
- **Fix:** Implementar focus trap com Tab/Shift+Tab circulando; mudar `role="group"` para `role="menu"` + `role="menuitem"`; navegação por setas verticais

### B7. Typing indicator com aria-live
- **Arquivo:** `src/features/inbox/components/MessageTimeline.tsx:266-301`
- **Fix:** Envolver em `<div role="status" aria-live="polite">`; adicionar texto sr-only descritivo

### B8. Estado offline/desconectado visível
- **Arquivo:** `src/features/inbox/components/MessageTimeline.tsx`
- **Fix:** Hook `useNetworkStatus` ou ouvir eventos do realtimeSocket; banner "Conexão perdida - reconectando..." quando offline

### A4. Batch updates no CRM (N+1)
- **Arquivo:** `src/server/product/crm-contact-sync.server.ts:213-233`
- **Fix:** Coletar pares `(id, newName)` e executar upsert em batch de 250 registros

### A5. Rate limiting por (user_id, action_type)
- **Arquivo:** `src/server/middleware/auth.ts:88-108`
- **Fix:** Buckets separados para endpoints críticos vs não-críticos; header `X-RateLimit-Remaining` na resposta

### D2. Importação de leads no CRM com deduplicação
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (CrmView)
- **Fix:** Botão "Importar leads" com mapeamento de colunas; normalização canonical de telefone; merge/update em vez de duplicar

### D3. Histórico de movimentação do lead (timeline CRM)
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (CrmView)
- **Fix:** Componente de timeline baseado em eventos de mudança de etapa; quem moveu, quando, motivo opcional

### G2. Detecção visual de conflitos no calendário
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (CalendarView)
- **Fix:** Mostrar slots disponíveis/ocupados visualmente antes do submit; prevenir double-booking no frontend

### G3. Integração bidirecional calendário ↔ WhatsApp
- **Arquivo:** `src/features/inbox/components/ProductViews.tsx` (CalendarView)
- **Fix:** Notificar cliente via WhatsApp ao criar agendamento; confirmação do cliente atualiza status para "confirmed"

---

## ✨ SPRINT 5 — Polimento & Low Priority

| # | Item | Arquivo | Fix Resumido |
|---|------|---------|-------------|
| B9 | Scroll threshold dinâmico | MessageTimeline.tsx:156 | `% of viewport` ou IntersectionObserver |
| B10 | Grouping consecutivo AND | MessageTimeline.tsx:225-232 | Chave composta `${phone}:${name}` |
| B11 | Quote text light mode | MessageBubble.tsx:672 | Classe condicional dark/light |
| B12 | Polling reconciliação condicional | useMessages.ts:331-335 | Desativar quando WebSocket connected |
| B13 | Rollback cirúrgico toggleAiState | useConversations.ts:378-398 | Armazenar apenas `{chatId, previousAiPaused}` |
| B14 | Debounce fetchConversations | useConversations.ts:207-209 | Coalesce focus/online/realtime triggers |
| A6 | CAS claim retry logging | event-inbox.ts:84-104 | Log quando CAS falha; re-enfileirar explicitamente |
| A7 | ListMembers paginado | workspaces.server.ts:157-163 | Paginação ou RPC/view materializada |
| A8 | Contact pagination limit | sync-engine.ts:290-300 | Max 50 páginas (50k contatos) + warning |
| A9 | Outbound unknown resolver | outbound-policy.ts:8-14 | Endpoint de consulta + timeout → failed |
| A10 | CRM dedup normalizado | crm-contact-sync.server.ts | Função SQL `normalize_phone()` no upsert |
| E2 | Teste agente multi-turn | ProductViews.tsx AgentsView | Manter contexto entre mensagens no teste |
| E3 | Métricas qualidade por agente | ProductViews.tsx AgentsView | Taxa transferência, edições, tempo resolução |
| E4 | Templates adicionais | ProductViews.tsx AgentsView | Pós-venda, cobrança, onboarding, NPS |
| F3 | Segmentação automática | ClientsView | Sugestões: inativos, alto valor, frequentes |
| F4 | Tags coloridas | ClientsView:5172 | Color picker ou paleta pré-definida |
| G4 | Recorrência follow-up | FollowUpView | Campo iCal simplificado |
| G5 | Editor disponibilidade semanal | CalendarView | UI para editar horários por dia |
| G6 | Visão semana/dia | CalendarView | Toggle mês/semana/dia |
| H1 | Dead code removal | MessageBubble.tsx | Remover `renderReactionIcon` duplicada |
| H2 | dvh fallback | InboxShell.tsx:419 | `h-screen` antes de `h-[100dvh]` |
| H3 | Presence clock drift warning | usePresence.ts:41 | Warning dev mode + TTL server-provided |
| H4 | Truncamento visual | MessageBubble.tsx:957-968 | CSS line-clamp + ResizeObserver |
| H5 | Mensagens deletadas feedback | MessageBubble.tsx:1021-1030 | Espaço ocupado ou tooltip explicativo |
| A11 | PII regex refinada | agent-personalization.ts:56 | Exigir prefixo país/formatação BR |
| A12 | Erros diferenciados | login.server.ts:297 | 503 infra vs 500 lógica + request_id |
| A13 | Chunking triple-backtick | message-chunking.ts:13-42 | Fence blocks como unidade indivisível |
| H6 | SettingsView unificada | Novo componente | Seções: Geral, Notificações, IA, Integrações, Equipe |

---

## 🧪 Estratégia de Testes & Observadores

### Testes Automatizados
| Tipo | Cobertura | Ferramenta |
|------|-----------|-----------|
| Unit | Hooks puros (`chat-scoped-update`, `auth-validation`) | `node --test` |
| Integration | Endpoints server + Supabase staging | `node --test` + test DB |
| E2E | Fluxos críticos (login, chat, CRM, agents) | Playwright |
| Visual | Regressão UI em 6 breakpoints | Playwright screenshots |
| Performance | FPS scroll, tempo de carga, bundle size | Lighthouse CI |
| Acessibilidade | WCAG 2.1 AA | axe-core + Playwright |

### Observadores por Sprint
| Sprint | Métrica Chave | Threshold | Alerta |
|--------|--------------|-----------|--------|
| 1 | Conversas duplicadas | 0 | PagerDuty imediato |
| 1 | FPS lista conversas | ≥55 | Warning no Sentry |
| 2 | Tempo carga dashboard | <2s p95 | Slack notification |
| 3 | Taxa aceitação sugestões | >40% | Review semanal |
| 3 | Entrega lembretes | >95% | Alerta se <90% |
| 4 | Error rate API | <0.1% | Datadog monitor |
| 5 | Lighthouse a11y | ≥90 | Block PR se <85 |

### Browser Testing Matrix
| Viewport | Dispositivo | Prioridade |
|----------|------------|-----------|
| 375×812 | iPhone SE | Critical |
| 390×844 | iPhone 14 | Critical |
| 768×1024 | iPad Mini | High |
| 1024×768 | Tablet landscape | High |
| 1440×900 | Desktop padrão | Critical |
| 1920×1080 | Desktop full HD | Medium |

### Checklist de Validação por Feature
- [ ] Funciona em light e dark mode
- [ ] Responsivo em todos os breakpoints
- [ ] Acessível via teclado (Tab, Enter, Escape)
- [ ] Leitor de tela anuncia corretamente (NVDA/VoiceOver)
- [ ] Estados loading/error/empty tratados
- [ ] Offline graceful degradation
- [ ] Console sem warnings/errors
- [ ] Network tab sem requests redundantes
- [ ] Performance dentro do threshold
- [ ] Dados isolados entre tenants (RLS)

---

## 🚫 Restrições Globais (O que NÃO PODE em nenhuma sprint)

1. **Nunca** usar `supabaseAdmin` sem `scopedAdmin(workspaceId)`
2. **Nunca** gerar UUID aleatório para entidades que têm unique constraint natural
3. **Nunca** depender exclusivamente de hover para funcionalidade crítica
4. **Nunca** destruir estado local do usuário (draft, scroll, filtros) em trocas de rota/chat
5. **Nunca** adicionar biblioteca de UI nova sem aprovação explícita (usar shadcn/Tailwind/Phosphor existentes)
6. **Nunca** commitar `.env` com valores reais
7. **Nunca** expor dados entre tenants (testar sempre com 2+ workspaces)
8. **Nunca** implementar ML/fine-tuning sem supervisão humana e dados suficientes
9. **Nunca** enviar mensagem WhatsApp real em testes automatizados
10. **Nunca** declarar "UI pronta" sem screenshot real nos 6 breakpoints

---

## 📈 Métricas de Sucesso do Projeto

| Indicador | Baseline (Atual) | Meta Sprint 1-2 | Meta Sprint 3-5 |
|-----------|-----------------|-----------------|-----------------|
| Conversas duplicadas/mês | ~15 (estimado) | 0 | 0 |
| FPS scroll lista 200 chats | ~30-40 | ≥55 | ≥58 |
| Tempo carga dashboard | ~3-5s | <2s | <1.5s |
| Follow-ups criados/atendente/dia | 3-5 (manual) | 8-12 (com sugestões) | 15-20 (auto-sugestões) |
| No-show rate agendamentos | ~25% | ~15% (lembretes) | <10% |
| Satisfação agente IA (thumbs up %) | N/A | >60% | >75% |
| Lighthouse a11y score | ~70 | ≥85 | ≥90 |
| Bundle size (gzip) | ~350KB | <320KB | <300KB |

---

*Documento gerado em 2026-11-24. Atualizar após cada sprint review.*