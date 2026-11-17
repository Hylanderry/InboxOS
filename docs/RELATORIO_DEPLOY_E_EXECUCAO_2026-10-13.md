# Relatório de Execução, Deploy e Diagnóstico — InboxOS

**Data:** 13/10/2026  
**Ambiente:** Produção (Vercel + Supabase + Evolution API)  
**Status do Deploy:** Concluído com Sucesso e Promovido para Produção  

---

## 1. Resumo Executivo

Foi executado o fluxo completo de homologação, testes automatizados, compilação de produção e deploy via Vercel CLI com os artefatos locais mais recentes (incluindo correções de estabilidade de presença WhatsApp, prevenção de loop de atualização de tema, tratamento de mídia e sincronização de contatos).

A aplicação está em produção respondendo nos domínios oficiais. Foi também diagnosticada a causa exata do webhook da Evolution estar bloqueado (`42P10`), com a query necessária pronta para execução no Supabase.

---

## 2. Etapas Executadas e Resultados

### 2.1. Autenticação e Vínculo com a Vercel
- **Comando:** `npx vercel whoami` & `npx vercel link --yes`
- **Resultado:** Sessão confirmada como usuário `hylanderry`. Projeto vinculado com sucesso a `nicks-projects-0aa02c95/inboxos-fase16-uiux-consolidado-2026-10-11`. Variáveis de ambiente sincronizadas.

### 2.2. Bateria de Testes Automatizados
- **Comando:** `npm test`
- **Resultado:** **334 testes executados e 334 testes aprovados (100% PASS)** em 1.96s.
  - Testes de isolamento multi-tenant, regressões de presença realtime, fallbacks da Evolution API, gestão de contatos e integridade de sessões validados.

### 2.3. Verificação Estática de Tipos TypeScript
- **Comando:** `npx --no-install tsc --noEmit`
- **Resultado:** **0 erros** de compilação ou inconsistência de tipos.

### 2.4. Análise de Código (Linter)
- **Comando:** `npm run lint`
- **Resultado:** **0 erros** impeditivos.

### 2.5. Auditoria de Release
- **Comando:** `npm run audit:release`
- **Resultado:** PASS na integridade de dependências (`package-lock.json`), PASS na resolução de 88 rotas TanStack Router e flags de billing blindadas.

### 2.6. Build e Compilação de Produção
- **Comandos:** `npm run build` e `npx vercel build --prod --yes`
- **Resultado:** Gerado pacote otimizado `.vercel/output` utilizando o motor Vite + Nitro com runtime Node.js 24.x, dividindo corretamente chunks do cliente e SSR.

### 2.7. Deploy de Produção
- **Comando:** `npx vercel deploy --prod --yes`
- **Resultado:** Deploy concluído com compilação remota e promovido diretamente para produção:
  - **Deployment ID:** `dpl_BWUrVdQtTuPAKMWHKnKcVN39RZXz`
  - **URL Canônica do Deploy:** `https://inboxos-fase16-uiux-consolidado-2026-10-11-3o5nkp8rd.vercel.app`
  - **Inspector URL:** `https://vercel.com/nicks-projects-0aa02c95/inboxos-fase16-uiux-consolidado-2026-10-11/BWUrVdQtTuPAKMWHKnKcVN39RZXz`
  - **Aliases Ativos de Produção:**
    - `https://inboxos.cloud`
    - `https://www.inboxos.cloud`
    - `https://app.inboxos.cloud`

---

## 3. Validação e Saúde em Produção

Foram executadas chamadas HTTP nos endpoints de saúde publicados:

```bash
# Teste via HTTP no endpoint de saúde
curl -s https://inboxos.cloud/api/health
{"status":"ok","database":"reachable","latencyMs":56}

curl -s https://app.inboxos.cloud/api/health
{"status":"ok","database":"reachable","latencyMs":69}
```

- **Status da API:** `ok`
- **Banco de Dados:** `reachable` (acessível, sem atrasos anômalos)
- **Drift de Schema:** Nenhum aviso de `schema: "outdated"` retornado.

---

## 4. Diagnóstico do Webhook Evolution (Erro 42P10)

Nos logs ao vivo da Vercel (`npx vercel logs inboxos.cloud`), os disparos vindos do Evolution para `/api/public/webhooks/evolution` apresentaram o seguinte log:
```text
[webhook evolution] erro: {
  code: '42P10',
  message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification'
}
```

### Análise no Banco de Dados
Foi realizado teste de diagnóstico direto via client administrativo:
- As tabelas `whatsapp_contacts` e `whatsapp_presence` estão com **0 linhas conflitantes/duplicadas**.
- O motivo de mensagens recebidas não estarem sendo gravadas é exclusivamente a ausência das constraints únicas compostas que dão suporte aos upserts da API.

---

## 5. Ação Necessária no Supabase (Copiar e Colar)

Para desbloquear imediatamente a gravação das mensagens recebidas e presença de contatos, execute o script SQL abaixo no **SQL Editor** do Supabase de produção:

```sql
-- 1. Ajuste da constraint de status da conexão
alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_connection_state_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_connection_state_check
  check (
    connection_state is null
    or connection_state in (
      'open', 'connecting', 'connected', 'disconnected', 'close', 'qrcode'
    )
  );

-- 2. Índice único para instâncias por workspace
create unique index if not exists whatsapp_instances_workspace_instance_key
  on public.whatsapp_instances(workspace_id, instance_name);

-- 3. Índice único para contatos WhatsApp (resolve o ON CONFLICT do webhook)
create unique index if not exists whatsapp_contacts_workspace_instance_remote_jid_key
  on public.whatsapp_contacts(workspace_id, instance_id, remote_jid);

-- 4. Índice único para presença de contatos (resolve o ON CONFLICT de presença)
create unique index if not exists whatsapp_presence_workspace_instance_phone_key
  on public.whatsapp_presence(workspace_id, instance_id, phone);

-- 5. Índice único para deduplicação de eventos Evolution
create unique index if not exists evolution_events_workspace_id_event_key_key
  on public.evolution_events(workspace_id, event_key);
```

### 5.1. Consulta de Validação (Somente Leitura)
Após executar o SQL acima, execute esta consulta para validar que os índices foram criados:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'whatsapp_contacts_workspace_instance_remote_jid_key',
    'whatsapp_presence_workspace_instance_phone_key'
  );
```

---

## 6. Próximos Passos de QA
1. Executar o SQL do item 5 no Supabase.
2. Acessar `https://app.inboxos.cloud` e conferir a tela de conversas/Inbox.
3. Enviar mensagem de teste para o número conectado e verificar que a mensagem é gravada e o contador de não lidas é atualizado.
