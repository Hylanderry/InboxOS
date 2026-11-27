import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createViewSnapshots } from "../src/features/inbox/view-snapshot.ts";

test("guarda e devolve o último resultado de uma tela", () => {
  const snapshots = createViewSnapshots();
  snapshots.writer<string>("crm")("leads-A");
  assert.equal(snapshots.read("crm"), "leads-A");
});

test("troca de workspace/usuário apaga tudo e descarta respostas atrasadas", () => {
  const snapshots = createViewSnapshots();
  snapshots.writer<string>("crm")("leads-A");
  const late = snapshots.writer<string>("clients"); // pedido feito no workspace A
  snapshots.clear();
  assert.equal(snapshots.read("crm"), undefined);
  late("clientes-A");
  assert.equal(snapshots.read("clients"), undefined, "dado de A não pode entrar em B");
  snapshots.writer<string>("clients")("clientes-B");
  assert.equal(snapshots.read("clients"), "clientes-B");
});

test("drop remove só a tela que falhou", () => {
  const snapshots = createViewSnapshots();
  snapshots.writer<number>("crm")(1);
  snapshots.writer<number>("agents")(2);
  snapshots.drop("crm");
  assert.equal(snapshots.read("crm"), undefined);
  assert.equal(snapshots.read("agents"), 2);
});

test("resposta antiga não sobrescreve uma mais nova da mesma tela", () => {
  const snapshots = createViewSnapshots();
  const slow = snapshots.writer<string>("followUps");
  const recent = snapshots.writer<string>("followUps");
  recent("novo");
  slow("antigo");
  assert.equal(snapshots.read("followUps"), "novo");
});

test("pré-carregamento evita o CRM (leitura que grava) e edição exige dado novo", () => {
  const client = readFileSync("src/features/inbox/view-snapshot-client.ts", "utf8");
  const list = client.slice(
    client.indexOf("const PREFETCH"),
    client.indexOf("export function prefetchViews"),
  );
  assert.doesNotMatch(list, /"crm"/);
  const views = readFileSync("src/features/inbox/components/ProductViews.tsx", "utf8");
  assert.doesNotMatch(views, /useState\(first[^;]*canManage/);
  assert.match(views, /if \(staleGuard\(\)\) return;/);
  assert.match(
    readFileSync("src/lib/current-workspace.ts", "utf8"),
    /previous && next !== previous/,
  );
});

test("limpeza ligada a workspace e sessão; API continua sem cache", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const client = read("src/features/inbox/view-snapshot-client.ts");
  assert.match(client, /inboxos:workspace-change/);
  assert.match(client, /onAuthStateChange/);
  assert.doesNotMatch(read("src/features/inbox/workspace-product-api.ts"), /viewSnapshots/);
});
