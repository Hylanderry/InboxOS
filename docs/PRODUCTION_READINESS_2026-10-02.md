# InboxOS — Preparação do release (02/10/2026)

**Classificação:** código revisto offline, **não homologado para produção**.
**Base:** `inboxos-phase2-2026-10-01.zip` + correções desta revisão.
Não aplicar migrations ou enviar mensagens com credenciais reais para validar um patch não homologado.

## O que foi corrigido nesta revisão

1. O formulário de newsletter tinha limite de 50 MiB, incompatível com o limite de **6 MiB de payload buffered da Netlify** (na prática aproximadamente 4,5 MiB binários). API e UI agora impõem **3 MiB** como margem para multipart/base64. Arquivos maiores devem ser enviados por um futuro fluxo direto e validado para o Storage ou hospedados em destino HTTPS confiável; não anunciar upload de vídeo de 50 MiB pelo endpoint atual. Fonte: https://docs.netlify.com/build/functions/configuration/ .
2. O upload de vídeo no ADM gerava bloco `video` sem miniatura; salva a URL de capa HTTPS disponível mais recente quando existe e, sem capa, impede salvar campanha inválida, pedindo a URL ao operador.
3. Auditoria completa do `package-lock.json`: versões diretas no pacote raiz, entradas resolvidas e integridade; detecta também dependências antigas que permaneceram no lock. **Não manipular hashes manualmente.**
4. Verificador da configuração de produção (`npm run audit:env`) sem revelar valores secretos: Supabase navegador/servidor, cofre de 32 bytes base64, APP URL, bootstrap desativado e Billing OFF.
5. Workflow manual `.github/workflows/staging-smoke.yml`: valida URL de Deploy Preview diferente da produção antes de realizar apenas smoke de acesso anônimo. Exige `vars.PRODUCTION_APP_URL` configurada no repositório. Não testa integrações com login.
6. Script `scripts/prepare-production-build.sh` prepara lockfile via npm com rede, instala, executa testes, auditoria, lint, tsc e build, sem modificar serviços remotos.
7. Restaurada localmente a migration `20261001134743_atomic_workspace_owner_transfer.sql`, que já consta no histórico do banco vivo. Ela deve ser revisada contra o DDL extraído antes de qualquer implantação em outro ambiente; não reaplicá-la no banco vivo.
8. Recuperação de senha: `startPasswordRecovery` agora verifica `allowed=true` do limitador antes de criar desafio/enviar OTP. `verifyPasswordRecovery` não trata mais `verified_at` isoladamente como prova de código; verifica o hash quando o desafio já estava confirmado.
9. Alterações autenticadas agora retornam 503 se o limitador de mutações do banco estiver indisponível; antes o código continuava em modo fail-open.

## Resultado dos testes neste executor

- `npm test`: **101/101 aprovados**, incluindo os testes novos de validação de upload, segurança de recuperação de senha, auditoria do lockfile, ENV e migration restaurada.
- `npm run audit:release`: 251 arquivos TypeScript/TSX/MTS sem erros de sintaxe, 0 imports internos ausentes, 83 rotas mapeadas, Billing guardado; **6 divergências** de lockfile impedem gate verde.
- `npm ci --offline`: falhou ENOTCACHED para o adaptador Netlify; `npm run lint` => eslint ausente, `tsc --noEmit` => definições vite/client ausentes, `npm run build` => vite ausente. **Nenhum desses testes foi aprovado**.
- Testes de autenticação, resposta de provedores e banco transacional em staging: ainda não executados.
- Database: consultas de inventário e Advisors foram somente leitura.

## Ordem obrigatória para fechar o release

**Passo 1 — em ambiente com npm registry liberado**

```bash
bash scripts/prepare-production-build.sh
# inspect git diff package-lock.json
npm run audit:release
```

**Passo 2 — preparar preview isolado**

- Separar projeto Supabase staging, Evolution de teste, Groq e Resend sandbox/segmento autorizado. Nenhuma chave ou webhook de produção nos previews públicos.
- Executar migrations em staging após reconciliar TODA a linha histórica. Testar duas sessões concorrentes, troca de owner, suspensão do último superadmin e políticas RLS.
- Usar `npm run audit:env` somente no ambiente de release configurado: ele falha intencionalmente quando faltam variáveis ou ainda há bootstrap global ativo. Não salvar as variáveis reais no ZIP.
- Publicar Netlify **Deploy Preview**, não produção. Configurar `PRODUCTION_APP_URL` como variável de repositório e rodar o workflow manual de smoke, informando o endereço do preview.
- Executar `npm run test:integration` com `TEST_BASE_URL` apontando ao preview.
- Testar fluxos reais 401/403/409 e 200/201, onboarding, OTP, suspensão, multi-tenant, Evolution QR/chat/transferência de mídia, Groq, Resend/newsletter opt-in e funções background. Fazer testes de responsividade de 320 px a desktop.

**Passo 3 — promoção**

- Apenas depois de build, typecheck, lint, E2E e smoke de provedores aprovados.
- Revisar quem pode fazer deploy na Netlify, proteger branch com status checks obrigatórios e definir plano de rollback com backups/restauração.
- Verificar novamente Security Advisor e Performance Advisor.
- Confirmar que `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` está vazia, cofre persistente e Billing explicitamente OFF.

## Limitações atuais

Esta revisão **não prova que o aplicativo compila**, não afirma que todos os 103 contratos HTTP funcionam e não certifica a infraestrutura externa. O registry npm não resolve DNS neste executor; também não há credenciais de staging nem um ambiente Netlify Preview associado para realizar os testes externos. O ZIP inclui código e testes, não arquivos `.env` de produção.
