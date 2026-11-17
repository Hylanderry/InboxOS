# Handoff Antigravity — InboxOS / mensagens e deploy

Data: 13/10/2026

## Estado do código

O código local auditado é mais novo que o último deploy Vercel. O deploy de produção foi criado às 10:05 (commit anterior); o workspace local está no commit `54c4b39` às 10:20 e contém, entre outras, as correções de identidade/contatos e mídia dos commits `4f4013d` e `4d6e4d1`.

Não reutilizar o URL de deployment protegido como teste funcional. Os aliases públicos são `https://inboxos.cloud`, `https://www.inboxos.cloud` e `https://app.inboxos.cloud`.

## Causa confirmada do Evolution parado

Os logs de produção mostraram repetidamente:

```text
POST /api/public/webhooks/evolution
42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Os upserts usam estas chaves compostas:

- `whatsapp_contacts (workspace_id, instance_id, remote_jid)`
- `whatsapp_presence (workspace_id, instance_id, phone)`

Sem os índices/constraints exatos, o webhook falha antes de persistir mensagens, contatos e presença. Isso explica a mensagem enviada do outro número não aparecer.

## Ação obrigatória no Supabase do ambiente que alimenta a produção

Aplicar integralmente, uma vez, a migration versionada:

```text
supabase/migrations/20261013100000_evolution_runtime_constraints.sql
```

Depois validar, em SQL somente leitura:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'whatsapp_contacts_workspace_instance_remote_jid_key',
    'whatsapp_presence_workspace_instance_phone_key'
  );
```

Os dois índices devem existir com exatamente as colunas acima. Também confirmar:

```sql
select * from public.health_schema_diagnostics();
```

O endpoint autenticado `/api/health` deve retornar `status: "ok"` e `database: "reachable"`, sem `schema: "outdated"`.

## Deploy do código atual

Executar a partir da raiz deste repositório, depois de garantir que as variáveis já existem no projeto Vercel correto (não commitar `.env`):

```powershell
npx vercel login
npx vercel link
npm test
npx --no-install tsc --noEmit
npm run lint
npm run audit:release
npm run build
npx vercel deploy --prebuilt --prod --yes
```

Após o deploy, acompanhar:

```powershell
npx vercel logs <URL-DO-DEPLOY> --since 15m --limit 200
```

Não deve haver `42P10`, `Supabase environment missing` ou `schema: outdated`.

## Correções locais incluídas neste handoff

- Conversa visível marca não lidas após a timeline terminar de carregar, inclusive a conversa selecionada automaticamente; a rota `/api/chats/:id/read` envia o recibo de leitura ao WhatsApp.
- Timeline não força a rolagem quando o contato está digitando/gravação; mostra botão “Ir para as mensagens mais recentes”.
- Composer envia `composing`, agenda `paused` após inatividade e encerra presença ao limpar/enviar/parar áudio.
- Modal de informações do contato deduplica a requisição por conversa e o tema não é mais hidratado duas vezes; isso elimina o loop `Maximum update depth exceeded` que podia produzir a tela genérica de erro.
- Perfil comercial é carregado de forma estável e testado abrindo/fechando no Playwright.
- A página `Agentes` existe no código atual e foi exercitada no Playwright. Ela fica intencionalmente oculta apenas para membros com `workspaceRole === "agent"`; owner/admin/superadmin a enxergam. Se o usuário final for agente e precisar administrar agentes, alterar a política de permissão antes do deploy.

## Verificação adicional da Evolution (somente leitura)

- `fetchInstances`: HTTP 200; a instância `WhatsApp_1665` respondeu `open`.
- `findContacts/WhatsApp_1665`: o servidor Evolution respondeu erro 500 interno.
- `findChats/WhatsApp_1665`: HTTP 200 e retornou dados com nome/foto dos chats.
- O código local agora tenta `findContacts` e, quando o provedor falha, usa `findChats` como fallback somente leitura, ignorando JIDs de grupos na importação de contatos.
- Ainda falta ao Antigravity confirmar esse fluxo no deploy publicado e observar a persistência no Supabase com a instância real.

## QA pós-deploy

1. Abrir `https://app.inboxos.cloud`, autenticar e confirmar `/api/health`.
2. Abrir Inbox, Conexões e o perfil de um contato; conferir ausência de tela branca e nomes/fotos.
3. Confirmar que a conversa aberta zera o contador local e que o WhatsApp marca as mensagens como lidas.
4. Digitar e gravar áudio; confirmar indicadores `composing`/`recording` e `paused`.
5. Enviar uma mensagem real somente para um número de staging explicitamente autorizado; nunca para grupos nem para contatos aleatórios em produção. O smoke padrão deste repositório não envia mensagens.
