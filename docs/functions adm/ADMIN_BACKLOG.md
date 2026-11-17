# Backlog do control plane ADM

## Fase 1 — concluída nesta alteração

- Rota exclusiva `/admin` com redirecionamento de usuários sem sessão e bloqueio server-side preservado.
- Navegação do workspace não renderiza mais a tela administrativa dentro do Inbox; o botão ADM abre o control plane.
- Cabeçalho dedicado com papel atual, alternância de tema e saída segura.
- Documentação de RLS, chaves, limites de billing, newsletter e convites.

## Fase 2 — próxima implementação segura

- Adicionar uma tabela de permissões por workspace (ex.: `workspace_member_permissions`) com allowlist de módulos, `granted_by`, timestamps e auditoria.
- Definir matriz explícita para Atendimento, CRM, Clientes, Follow-up, Calendário, Agentes, Conexões, Newsletter e Billing.
- Exibir a matriz no convite e permitir alteração posterior sem mudar o papel base.
- Adicionar expiração, reenvio limitado e cancelamento de convite com rate limit por workspace.
- Criar filtros/paginação no control plane para não carregar listas grandes em uma única resposta.

## Fase 3 — billing (somente após contrato)

- Escolher provedor e planos.
- Modelar `subscriptions`, `entitlements` e eventos idempotentes.
- Validar assinatura do webhook e impedir downgrade destrutivo.
- Aplicar entitlement no servidor; UI apenas reflete o estado.
- Criar testes de renovação, cancelamento, atraso e webhook duplicado.

## Fase 4 — Edge Functions (opcional)

Só criar esta camada se houver uma necessidade clara de execução próxima ao banco. Cada função deverá ter autenticação, allowlist de origem, timeout, limite de payload, logs sem PII e segredo no ambiente do Supabase. Não duplicar regras já existentes nas rotas server sem um plano de migração.

## Melhorias de visualização já aplicadas

- ADM deixou de compartilhar o shell operacional e ganhou contexto visual próprio.
- O tema segue a preferência armazenada do sistema e mantém os contrastes existentes.
- A área continua responsiva; componentes administrativos permanecem reutilizáveis e sem mudanças na tipografia/paleta do produto.

## O que não deve ser feito

- Não liberar tabelas administrativas para `authenticated` “para facilitar a UI”.
- Não usar service-role no navegador.
- Não ativar billing, newsletter de produção ou Evolution real durante QA.
- Não apagar migrations aplicadas; correções devem ser aditivas e idempotentes.
