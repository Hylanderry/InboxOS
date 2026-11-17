import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAgentConversationPrompt,
  buildAgentInstructions,
  redactPiiText,
  normalizeAgentRuntimeConfig,
  shouldRequestHumanHandover,
} from "../src/server/product/agent-personalization.ts";

test("agent conversation prompt is scoped by caller and bounded to recent turns", () => {
  const prompt = buildAgentConversationPrompt("  dúvida atual  ", [
    { sender: "client", text: "Olá" },
    { sender: "agent", text: "Como posso ajudar?" },
  ]);
  assert.match(prompt, /HISTÓRICO RECENTE/);
  assert.match(prompt, /Atendente: Como posso ajudar/);
  assert.match(prompt, /MENSAGEM ATUAL\ndúvida atual/);
  assert.ok(prompt.length <= 12_000);
});

test("agent conversation prompt includes only bounded pending follow-up context", () => {
  const prompt = buildAgentConversationPrompt(
    "mensagem",
    [],
    [
      {
        title: "Retornar proposta",
        note: "Confirmar prazo",
        dueAt: "2026-10-13T12:00:00.000Z",
        priority: "high",
        leadName: "Cliente de teste",
        leadPhone: "+5511999999999",
      },
    ],
  );
  assert.match(prompt, /FOLLOW-UPS PENDENTES DO CLIENTE/);
  assert.match(prompt, /Cliente de teste/);
  assert.match(prompt, /Retornar proposta/);
});

test("agent knowledge context is explicit, bounded and workspace-oriented", () => {
  const prompt = buildAgentConversationPrompt("Qual é o prazo?", [], [], {}, [
    { title: "Prazos", content: "Responder com o prazo oficial do workspace." },
  ]);
  assert.match(prompt, /BASE DE CONHECIMENTO AUTORIZADA/);
  assert.match(prompt, /Prazos/);
  assert.match(prompt, /prazo oficial/);

  const config = normalizeAgentRuntimeConfig({ objective: "Atender", includeKnowledgeBase: true });
  assert.equal(config.includeKnowledgeBase, true);
  assert.equal(normalizeAgentRuntimeConfig({ objective: "Atender" }).includeKnowledgeBase, false);
});

test("guided agent personalization compiles into deterministic instructions", () => {
  const config = normalizeAgentRuntimeConfig({
    objective: "Qualificar novos interessados",
    audience: "Clientes de pequenas empresas",
    personality: "Consultiva e objetiva",
    tone: "friendly",
    greeting: "Olá! Como posso ajudar?",
    rules: ["Nunca inventar preços", "Confirmar o nome antes de avançar"],
    forbiddenTopics: ["Política partidária"],
    handoffEnabled: true,
    handoffTriggers: ["falar com humano", "atendente"],
  });
  const instructions = buildAgentInstructions(config);
  assert.match(instructions, /Qualificar novos interessados/);
  assert.match(instructions, /Consultiva e objetiva/);
  assert.match(instructions, /Nunca inventar preços/);
  assert.match(instructions, /Política partidária/);
  assert.match(instructions, /Olá! Como posso ajudar\?/);
  assert.equal(shouldRequestHumanHandover(config, "Quero falar com um HUMANO agora"), true);
  assert.equal(shouldRequestHumanHandover(config, "Qual é o horário?"), false);
});

test("agent personalization normalizes lists, limits size and rejects empty objective", () => {
  assert.throws(() => normalizeAgentRuntimeConfig({ objective: "   " }), /objetivo/i);
  const config = normalizeAgentRuntimeConfig({
    objective: "Atender",
    rules: ["  Regra A ", "Regra A", "", "Regra B"],
    handoffTriggers: "humano, atendente, humano",
  });
  assert.deepEqual(config.rules, ["Regra A", "Regra B"]);
  assert.deepEqual(config.handoffTriggers, ["humano", "atendente"]);
});

test("agent prompt redaction removes direct contact identifiers", () => {
  const redacted = redactPiiText(
    "Fale com ana@example.com ou +55 11 99999-9999; CPF 123.456.789-09.",
  );
  assert.doesNotMatch(redacted, /ana@example\.com|\+55 11 99999-9999|123\.456\.789-09/);
  assert.match(redacted, /\[email\]/);
  assert.match(redacted, /\[telefone\]/);
  assert.match(redacted, /\[cpf\]/);
});

test("agent prompt redaction removes credentials accidentally pasted into context", () => {
  const redacted = redactPiiText(
    "Bearer abcdefghijklmnopqrstuvwxyz token=super-secret-value api_key: sk-test-12345678 " +
      "eyJhbGciOiJIUzI1NiJ9.payload.signature",
  );
  assert.doesNotMatch(
    redacted,
    /abcdefghijklmnopqrstuvwxyz|super-secret-value|sk-test-12345678|eyJhbGci/,
  );
  assert.match(redacted, /Bearer \[token\]/);
  assert.match(redacted, /token: \[redacted\]/);
  assert.match(redacted, /api_key: \[redacted\]/);
  assert.match(redacted, /\[jwt\]/);
});

test("agent API persists runtime_config and automatic runtime evaluates human handoff", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /runtime_config/);
  assert.match(server, /shouldRequestHumanHandover/);
  assert.match(server, /from\("handover_requests"\)/);
  assert.match(server, /ai_paused/);
  assert.match(server, /workspace_knowledge_documents/);
  assert.match(server, /includeKnowledgeBase/);
  assert.match(server, /from\("chats"\)[\s\S]{0,220}\.eq\("instance_id", input\.instanceId\)/);
});

test("automatic agent excludes the trigger message from duplicated history context", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /select\("id,sender,text,created_at"\)/);
  assert.match(server, /filter\(\(message\) => message\.id !== input\.messageId\)/);
});

test("automatic agent outbox status writes remain scoped to workspace and instance", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  const matches =
    server.match(
      /\.eq\("id",\s*outbox\.id\)\s*\.eq\("workspace_id",\s*input\.workspaceId\)\s*\.eq\("instance_id",\s*input\.instanceId\)/g,
    ) ?? [];
  assert.equal(matches.length, 2);
});

test("automatic agent run deduplication and completion remain scoped to workspace and chat", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    server,
    /from\("automation_agent_runs"\)\s*\.select\("id,status"\)\s*\.eq\("workspace_id",\s*input\.workspaceId\)\s*\.eq\("agent_id",\s*agent\.id\)\s*\.eq\("chat_id",\s*input\.chatId\)/,
  );
  assert.match(
    server,
    /\.eq\("id",\s*run\.id\)\s*\.eq\("workspace_id",\s*input\.workspaceId\)\s*\.eq\("agent_id",\s*agent\.id\)\s*\.eq\("chat_id",\s*input\.chatId\)/,
  );
});

test("AI runtime fails closed when privacy policy is missing and redacts provider prompts", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /if \(!privacyPolicy\.available\)/);
  assert.match(server, /privacyPolicy\.redact \? redactPiiText/);
  assert.match(server, /content: redactPii \? redactPiiText\(agent\.instructions\)/);
  assert.match(server, /select\("ai_enabled,pii_redaction_enabled"\)/);
});

test("AI provider and model selection are server-side allowlisted", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  const vault = readFileSync(
    new URL("../src/server/admin/integration-vault.server.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../supabase/migrations/20261020103000_controlled_ai_providers.sql", import.meta.url),
    "utf8",
  );
  assert.match(server, /type AiProvider = "groq" \| "openrouter"/);
  assert.match(server, /configuredModelList/);
  assert.match(server, /Modelo de IA não está autorizado pelo administrador/);
  assert.match(server, /resolveManagedIntegration\(provider\)/);
  assert.match(vault, /"openrouter"/);
  assert.match(vault, /https:\/\/openrouter\.ai\/api\/v1\/models/);
  assert.match(migration, /automation_agents_provider_check/);
  assert.match(migration, /allowed_models/);
});

test("agent runtime revalidates its model after the administrator changes the catalog", () => {
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /const selection = await validateAiSelection\(provider, agent\.model\)/);
  assert.match(
    server,
    /\$\{agent\.id\}:\$\{selection\.provider\}:\$\{selection\.model\}:\$\{prompt\}/,
  );
  assert.match(server, /model: selection\.model/);
});
