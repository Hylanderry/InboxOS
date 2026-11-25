import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("S0/I5: envio sem instanceName só infere conexão quando há exatamente uma aberta", () => {
  const send = read("src/routes/api/messages/send.ts");
  assert.match(send, /\.limit\(2\)/);
  assert.match(send, /Escolha a conexão de WhatsApp/);
  // o fallback "primeira conexão aberta" não pode voltar
  assert.equal((send.match(/\.eq\("status", "open"\)/g) ?? []).length, 1);
  // a posse da instância continua validada contra o workspace do usuário
  assert.match(send, /Conexão não pertence a este workspace/);
});

test("S0/I5: valor do usuário não entra cru em filtro PostgREST .or()", () => {
  const send = read("src/routes/api/messages/send.ts");
  assert.match(send, /const safeRawJid = rawPhone\.replace\(/);
  assert.doesNotMatch(send, /remote_jid\.eq\.\$\{rawPhone\}/);
});

test("S0/I5: mídia casa o caminho literalmente (sem ilike com curingas)", () => {
  const media = read("src/routes/api/media/$.ts");
  assert.doesNotMatch(media, /\.ilike\("media_url"/);
  assert.match(media, /\.like\("media_url"/);
  // o escape usado precisa neutralizar % _ e a própria barra
  const escape = (path: string) => path.replace(/[\%_]/g, "\$&");
  assert.equal(escape("chat/a_b%c"), "chat/a\_b\%c");
});

test("S0/I6: lista de conexões limpa e descarta respostas antigas ao trocar de workspace", () => {
  const hook = read("src/features/instances/hooks/useInstances.ts");
  assert.match(hook, /inboxos:workspace-change/);
  assert.match(hook, /epoch !== epochRef\.current/);
  assert.match(hook, /removeEventListener\("inboxos:workspace-change"/);
});

test("S0/I1: migration trava o workspace padrão e remove o auto-membership", () => {
  const sql = read("supabase/migrations/20261125120000_lock_legacy_default_workspace.sql");
  assert.match(sql, /create trigger guard_default_workspace_membership/);
  assert.match(sql, /before insert or update of workspace_id, user_id on public\.workspace_members/);
  assert.match(sql, /drop trigger if exists bootstrap_first_workspace_owner on auth\.users/);
  // allowlist privada e inacessível por clientes
  assert.match(sql, /revoke all on private\.legacy_workspace_owners from public, anon, authenticated/);
  assert.match(sql, /set search_path = ''/);
  // nunca recriar o trigger de concessão automática
  assert.doesNotMatch(sql, /create trigger bootstrap_first_workspace_owner/);
});

test("S0: nenhuma migration nova volta a conceder membership a todo usuário", () => {
  const sql = read("supabase/migrations/20261125120000_lock_legacy_default_workspace.sql");
  assert.doesNotMatch(sql, /from auth\.users/i);
});
