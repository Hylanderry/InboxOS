import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  instanceWebhookToken,
  isInstanceTokenShape,
  matchWebhookCredential,
} from "../src/server/evolution/instance-webhook-token.ts";

const MASTER = "master-secret-for-tests-0123456789";

test("token por instância é determinístico, hex de 64 e distinto entre instâncias", () => {
  const a = instanceWebhookToken(MASTER, "inst-a");
  assert.equal(a, instanceWebhookToken(MASTER, "inst-a"));
  assert.ok(isInstanceTokenShape(a));
  assert.notEqual(a, instanceWebhookToken(MASTER, "inst-b"));
  assert.notEqual(a, instanceWebhookToken("outro-mestre", "inst-a"));
});

test("token de uma instância NÃO autoriza eventos de outra", () => {
  const tokenA = instanceWebhookToken(MASTER, "inst-a");
  const base = { masterSecrets: [MASTER], allowLegacy: true };
  assert.equal(
    matchWebhookCredential({ ...base, provided: tokenA, instanceName: "inst-a" }),
    "instance",
  );
  assert.equal(matchWebhookCredential({ ...base, provided: tokenA, instanceName: "inst-b" }), null);
});

test("segredo global legado só vale enquanto a migração permitir", () => {
  const base = { masterSecrets: [MASTER], provided: MASTER, instanceName: "inst-a" };
  assert.equal(matchWebhookCredential({ ...base, allowLegacy: true }), "legacy");
  assert.equal(matchWebhookCredential({ ...base, allowLegacy: false }), null);
});

test("credencial vazia, nome vazio ou sem mestre nunca autoriza", () => {
  assert.equal(
    matchWebhookCredential({
      provided: "",
      instanceName: "x",
      masterSecrets: [MASTER],
      allowLegacy: true,
    }),
    null,
  );
  assert.equal(
    matchWebhookCredential({
      provided: MASTER,
      instanceName: " ",
      masterSecrets: [MASTER],
      allowLegacy: true,
    }),
    null,
  );
  assert.equal(
    matchWebhookCredential({
      provided: MASTER,
      instanceName: "x",
      masterSecrets: [undefined, ""],
      allowLegacy: true,
    }),
    null,
  );
});

test("S0/I4: rota verifica o token da instância antes de limitar cota e consultar o banco", () => {
  const route = readFileSync("src/routes/api/public/webhooks/evolution.ts", "utf8");
  const verify = route.indexOf("verifyInstanceWebhookRequest(request, instanceName)");
  const rateLimit = route.indexOf("consumeEvolutionWebhookRateLimit(request)");
  const dbLookup = route.indexOf('.from("whatsapp_instances")');
  assert.ok(verify > 0 && rateLimit > verify && dbLookup > verify);
  assert.match(route, /await isValidManagedWebhookRequest\(request\)/);
});

test("S0/I4: replay interno carrega e valida workspace_id/instance_id gravados", () => {
  const inbox = readFileSync("src/server/evolution/event-inbox.ts", "utf8");
  const route = readFileSync("src/routes/api/public/webhooks/evolution.ts", "utf8");
  assert.match(inbox, /"x-inbox-workspace-id"/);
  assert.match(inbox, /"x-inbox-instance-id"/);
  assert.match(route, /instance-identity-changed/);
});

test("S0/I4: webhook é configurado com o token derivado da instância", () => {
  const lib = readFileSync("src/lib/evolution.server.ts", "utf8");
  assert.match(lib, /const secret = instanceWebhookToken\(masterSecret, instanceName\)/);
});
