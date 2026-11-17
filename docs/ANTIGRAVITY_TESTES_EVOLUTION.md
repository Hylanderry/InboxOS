# Evolution API v2 — matriz de testes e execução segura

## Preparação obrigatória
- Evolution v2 com URL, versão e API key de uma **instância de teste**; outra instância/conta para troca de mensagens autorizada.
- Supabase staging ref **diferente de `aczstooavclxhmgtsobg`**, com workspaces A/B; Vercel Deploy Preview isolado e URL pública HTTPS.
- Secrets armazenados em variáveis de ambiente; **não** publicar chave em console, `.env` commitado, screenshot, curl em shell history ou relatório.
- Confirmar eventos/webhook na versão da Evolution instalada, verificando `GET /webhook/find/{instance}` e o formato exigido pelo endpoint; consultar a documentação da versão, não assumir que a API é idêntica a releases anteriores.
- Não habilitar `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE` em instância real. `ENABLE_EVOLUTION_RECOVERY` permanece false até a homologação do agendamento.

## Teste sintético automatizado (não envia WhatsApp)
Na raiz, primeiro `node scripts/evolution-preview-smoke.mjs` (DRY RUN; sem rede). Depois, **somente com sandbox confirmado**:
```bash
# Valores de EXEMPLO. Definir via secret store da máquina/IDE/CI, sem compartilhar no chat.
# EVOLUTION_STAGING_WEBHOOK_URL=https://project-deployment-abc12345.vercel.app/api/public/webhooks/evolution
# EVOLUTION_STAGING_INSTANCE=wa_test_1
# EVOLUTION_STAGING_WEBHOOK_TOKEN=[secret de staging]
# EVOLUTION_STAGING_SUPABASE_REF=[project ref de staging, 20 caracteres]
# EVOLUTION_PRODUCTION_SUPABASE_REF=[project ref verdadeiro da produção, 20 caracteres]
# PRODUCTION_APP_URL=https://app.seudominio.com
# STAGING_ISOLATED_DB_CONFIRMED=yes
# STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes
node scripts/evolution-preview-smoke.mjs --execute
```
**Fase 13 — proteção adicional:** `--execute` também exige a referência explícita da produção, URL de produção para bloquear o mesmo origin, confirmação de que o preview usa banco separado e confirmação de que agentes/respostas automáticas estão desativados. O timestamp antigo **não garante** que agentes não disparem respostas. A conferência manual da configuração do Preview continua obrigatória: variáveis fornecidas pelo operador não provam qual banco foi configurado no deploy.

O script envia cinco eventos **sintéticos** (`CONTACTS_UPDATE`, `CHATS_UPSERT`, `PRESENCE_UPDATE`, `MESSAGES_UPDATE`, `MESSAGES_UPSERT`) e bloqueia hosts que não sejam previews isolados da Vercel. `HTTP 2xx` apenas confirma aceitação: consultar staging depois para verificar transição `queued→completed`, efeitos reais e logs.

## Matriz funcional — execução em staging
| ID | Cenário | Evidência de PASS |
|---|---|---|
| E01 | Webhook sem token / token inválido | 401 sem gravar evento |
| E02 | JSON inválido e payload maior que 4 MiB | 400 / 413, sem efeitos |
| E03 | Mesmo webhook reenviado | não criar processamento duplicado |
| E04 | `CONTACTS_UPDATE` e `CONTACTS_UPSERT`, evento unitário e em lista | upsert sem SQL 42P10, nome/foto existentes preservados se campo omitido |
| E05 | Contato `@lid` versus `@s.whatsapp.net` | não inventar número nem duplicar identidade indevidamente |
| E06 | `CHATS_UPSERT`, `CHATS_UPDATE`, grupo e chat privado | chat do workspace/instância correto; nome de grupo válido |
| E07 | `PRESENCE_UPDATE` | UPSERT por UNIQUE real; presença atualizada |
| E08 | `MESSAGES_UPSERT` entrada de texto e mídia | mensagem uma vez, anexo validado, sem erro de media/signature |
| E09 | `MESSAGES_UPDATE`, `DELIVERED→READ`, evento atrasado | dois eventos diferentes; status não regride |
| E10 | `MESSAGES_EDITED`, `MESSAGES_DELETE` | aplica à mensagem/instância correta, texto editado/excluído |
| E11 | Reação e resposta citada | ligação preservada à mensagem certa |
| E12 | Grupos / participantes / sincronização | JIDs e participantes isolados, sem timeout recorrente |
| E13 | Dois workspaces e duas instâncias com mesmo ID externo | sem alteração cruzada, RLS e joins corretos |
| E14 | Envio duplicado simultâneo com o mesmo `clientMessageId` | apenas uma aceitação/envio remoto |
| E15 | Resposta remota com timeout/408/5xx após envio incerto | status `unknown`/reconciliação; **sem** retry cego |
| E16 | Sucesso Evolution seguido de erro ao persistir histórico | outbox preserva `accepted`; API responde sem novo envio; reconciliação |
| E17 | Processamento interrompido e stale queued/failed | worker retoma só quando permitido, sem claim duplo |
| E18 | `dead_letter` simulado em staging | classe de erro identificada; recuperação seletiva sem bulk |
| E19 | Groq para mensagem muito antiga/replay | sem resposta automática retroativa |
| E20 | Evolução de mensagens real (texto, mídia, entregue, lida) entre **números de teste** | painel, DB e instância remota concordam |
| E21 | Reconfiguração de webhook no preview | não alterar webhook da instância de produção |
| E22 | Saúde `/api/health`, worker e cron da Vercel | estado declarado confere com configuração e execução, não com suposição |

## Fluxo ponta a ponta com Evolution real (apenas sandbox)
1. Conferir instância de teste autenticada/`open`; habilitar eventos necessários no webhook de staging, sem afetar outras instâncias.
2. Enviar **uma** mensagem de texto para conta autorizada B com `clientMessageId` novo; registrar ID externo e horário de forma redigida.
3. B responde a A; observar webhook → evento de entrada → worker → `messages`/`chats` → UI. Repetir com mídia pequena permitida, edição, exclusão e reação.
4. Acompanhar confirmação `DELIVERED`, depois `READ`; verificar que uma atualização tardia `DELIVERED` não rebaixa `READ`.
5. Rodar duplicatas concorrentes da **mesma mensagem de teste**; verificar um único envio. Para timeouts/remoto ambíguo, **não criar novo envio** — reconciliar.
6. Simular queda do worker em staging, aguardar política de stale e recuperar. Verificar que não cria respostas automáticas de IA para mensagens antigas.
7. Verificar `queued`, `failed`, `dead_letter` e contagem final. Nada que contorne limites ou impacte produção.

## Arquivos relevantes
- `src/routes/api/public/webhooks/evolution.ts` — entrada de webhook e eventos.
- `src/routes/api/messages/send.ts` — saída HTTP.
- `src/server/evolution/` — normalizadores, outbox, idempotência, status, corpo do webhook e filas.
- `src/lib/evolution.server.ts` — Evolution API e persistência.
- `src/routes/api/internal/evolution-events.ts` e `src/routes/api/cron/evolution-recover.ts` — worker/cron da Vercel.
- `tests/evolution-live-regressions.test.ts`, `tests/evolution-ingress-boundary.test.ts`, `tests/evolution-recovery.test.ts`, `tests/evolution-receipts.test.ts` — regressão local.
- `docs/EVOLUTION_DB_DIAGNOSTIC_READ_ONLY_2026-10-02.sql` — somente SELECTs.

**Se um teste falhar:** anotar ID, ambiente, versão, comportamento esperado/obtido, log redigido e query sem PII, criar teste de regressão, corrigir e repetir o ciclo; não mascarar `FAIL` com `NOT RUN`.
