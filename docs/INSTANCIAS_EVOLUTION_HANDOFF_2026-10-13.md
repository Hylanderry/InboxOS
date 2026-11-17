# Instâncias WhatsApp / Evolution — handoff técnico

## Decisão de identidade

- `whatsapp_instances.instance_name` continua sendo o identificador técnico da Evolution.
- Esse identificador é escolhido na criação, validado com 2–80 caracteres (`A-Z`, `a-z`, números, `.`, `-`, `_`) e não é renomeado depois que a instância passa a ter histórico.
- `whatsapp_instances.display_name` é o nome amigável editável no painel. A UI usa esse campo como `alias` e mantém o ID técnico visível de forma secundária.

## Correções aplicadas

1. Criação de conexão com nome técnico escolhido pelo operador e nome exibido opcional.
2. PATCH admin para editar apenas `display_name`, sempre escopado por `workspace_id + instance_name`.
3. Bloqueio HTTP 409 quando o mesmo nome técnico já pertence a outro workspace.
4. Migração idempotente para `display_name` e seu limite de tamanho:
   `supabase/migrations/20261013110000_whatsapp_instance_display_name.sql`.
5. Lista de conexões passa a mostrar nome amigável, ID técnico, telefone, status, editar nome, atualizar status, reconectar e abrir conversas.
6. Health check de webhook com janela de 60 segundos por workspace/instância, evitando uma verificação remota completa em todo refresh da UI.

## Aplicação obrigatória antes do deploy

Aplicar a migration acima primeiro em Supabase Staging isolado, regenerar/confirmar os tipos do Supabase e verificar:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'whatsapp_instances'
  and column_name = 'display_name';
```

Não aplicar `db reset`, `db push` ou DDL diretamente na produção sem backup, janela e autorização. Depois da migration, publicar o mesmo commit do código; sem ela o PATCH de nome retorna erro de schema.

## Evidência local

- `npm test`: 334/334 PASS.
- `npx --no-install tsc --noEmit`: PASS.
- `npm run lint`: 0 erros; 6 avisos antigos de fast-refresh.
- `npm run audit:release`: PASS (286 arquivos parseados, 88 rotas).
- `npm run build`: PASS (cliente + SSR Nitro/Vercel).
- Playwright isolado em `Conexões`: PASS, 0 erros HTTP, console ou página; nenhuma chamada externa nem mensagem WhatsApp enviada.

## Refinamentos adicionais (13/10/2026)

- O atalho `+` do Inbox agora abre a tela de Conexões e usa o fluxo de criação nomeado; não gera IDs automáticos.
- O dialog de QR não cria instâncias silenciosas quando recebe nome vazio.
- Respostas de requisições QR antigas são descartadas ao fechar o dialog ou trocar a instância.
- Falhas de leitura de `whatsapp_instances` retornam erro explícito em vez de uma lista vazia enganosa.
- Evidência atual: `npm test` 333/333; TypeScript, lint, auditoria estática e build passaram; Playwright isolado em Conexões passou sem erros.

## Limites de segurança

- Não há renomeação remota de instância Evolution: isso poderia desassociar histórico, webhook e mensagens.
- O teste real de QR/webhook/recebimento continua dependente de Evolution e Supabase Staging autorizados.
- Não executar envio de mensagem durante QA; usar apenas instância/número de teste explicitamente autorizado.
