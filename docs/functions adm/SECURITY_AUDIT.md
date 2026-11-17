# Auditoria de segurança — ADM, RLS, APIs e chaves

## Estado confirmado no código

### Autorização

- `src/server/admin/admin-auth.server.ts` exige sessão válida e consulta `system_admins` no banco.
- Os papéis globais são `superadmin`, `operator`, `support` e `auditor`, com permissões distintas.
- O bootstrap inicial exige identidade Auth confirmada, e-mail allowlisted e RPC atômica `claim_system_admin_bootstrap`.
- Usuário suspenso não deve conseguir continuar usando a sessão: `requireAuth` consulta `system_user_controls` e as mutações revogam sessões ativas.
- As rotas administrativas não dependem de RLS para autorização; RLS é uma segunda barreira. Isso é correto porque o service-role é usado somente no servidor.

### RLS e banco

As migrations aplicam RLS e retiram grants de `anon`/`authenticated` nas tabelas de controle, sessões, convites, integrações, newsletter e eventos internos. As tabelas de produto possuem políticas de leitura por workspace e grants restritos.

O arquivo `rls-audit.sql` contém consultas somente leitura para confirmar isso no projeto conectado. Execute-o no SQL Editor de staging e guarde o resultado; não altere políticas manualmente sem uma migration versionada.

### Segredos

- Chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são públicas por definição.
- Todas as demais chaves devem ser server-only e cadastradas como Secret na Vercel.
- O service-role que foi compartilhado anteriormente em conversa deve ser rotacionado no Supabase e na Vercel. Depois disso, revalidar Evolution, Resend e o cofre de integrações.
- `system_integration_secrets` guarda ciphertext/IV/tag; GET administrativo retorna apenas metadados e máscara.

## Lacunas reais (não são suposições)

1. **Não há Edge Functions no repositório.** Se o objetivo for usar Supabase Edge Functions, elas ainda precisam ser criadas, receber autenticação própria e entrar no pipeline. Hoje não existe código para auditar nessa camada.
2. **Billing está desligado.** Não existe motivo seguro para ativá-lo apenas pela UI: faltam provedor, catálogo de planos, webhook assinado, reconciliação idempotente e enforcement de entitlement.
3. **Permissões de workspace são coarse-grained.** O modelo atual é `owner/admin/agent`; convites administrativos aceitam `admin` ou `agent`. Departamentos e permissões por módulo ainda não são persistidos.
4. **Newsletter usa bucket público por design.** Isso é aceitável somente para assets publicáveis; nunca coloque segredos ou dados de clientes nesse bucket. Se a política mudar, migrar para bucket privado e URLs assinadas.
5. **Auditoria de IP usa headers fornecidos pelo proxy.** Em produção, aceitar apenas o header definido pelo provedor de borda configurado; não tratar `x-forwarded-for` arbitrário como prova forense.

## Fluxo seguro de funcionário

1. Dono/gerente escolhe workspace, e-mail e papel permitido.
2. O servidor cria convite de uso único com token opaco armazenado somente como hash.
3. Resend envia template com empresa, cargo, expiração e link HTTPS.
4. O funcionário confirma o e-mail, escolhe a própria senha e conclui o cadastro.
5. A associação ao workspace é criada com o papel autorizado.
6. Alterações posteriores de papel/status são auditadas e não podem remover o último owner.

Não implementar “senha completa criada pelo ADM” armazenada ou exibida pelo sistema. Se for necessário um acesso temporário, usar token de primeiro acesso de uso único e exigir redefinição imediata.

## Checklist de validação

- [ ] `/api/admin/me/` sem sessão responde 401/404 conforme a política pública.
- [ ] Usuário autenticado sem `system_admins` recebe 403 e não recebe dados.
- [ ] System Admin suspenso não acessa endpoints nem mantém sessões ativas.
- [ ] RLS nega leitura direta de tabelas administrativas para `anon` e `authenticated`.
- [ ] Nenhuma resposta contém ciphertext, service-role, API key ou token de convite.
- [ ] Convite expirado, revogado, duplicado ou com e-mail divergente é rejeitado.
- [ ] Newsletter só envia com confirmação literal e estado `draft`.
- [ ] Logs não registram tokens, senhas ou payloads de segredo.
