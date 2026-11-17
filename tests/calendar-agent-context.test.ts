import test from "node:test";
import assert from "node:assert/strict";
import { splitNaturalMessage } from "../src/server/product/message-chunking.ts";
import {
  appointmentFitsCapacity,
  appointmentOverlaps,
  countBookedAppointments,
} from "../src/server/product/appointment-rules.ts";
import {
  buildAgentInstructions,
  buildAgentConversationPrompt,
  hasAgentCalendarPermission,
  normalizeAgentRuntimeConfig,
} from "../src/server/product/agent-personalization.ts";
import { estimateTypingDelayMs } from "../src/server/product/message-chunking.ts";
import { createGroqGuard } from "../src/server/product/groq-guard.ts";
import { extractCalendarDirective } from "../src/server/product/calendar-agent-action.ts";

test("calendar rejects an appointment that overlaps an active booking", () => {
  assert.equal(
    appointmentOverlaps(
      { startsAt: "2026-10-13T10:00:00.000Z", endsAt: "2026-10-13T11:00:00.000Z" },
      { startsAt: "2026-10-13T10:45:00.000Z", endsAt: "2026-10-13T11:30:00.000Z" },
    ),
    true,
  );
  assert.equal(
    appointmentOverlaps(
      { startsAt: "2026-10-13T10:00:00.000Z", endsAt: "2026-10-13T11:00:00.000Z" },
      { startsAt: "2026-10-13T11:20:00.000Z", endsAt: "2026-10-13T12:00:00.000Z" },
      30,
    ),
    true,
  );
});

test("calendar capacity ignores canceled appointments and blocks the next booking", () => {
  const appointments = [{ status: "scheduled" }, { status: "confirmed" }, { status: "canceled" }];
  assert.equal(countBookedAppointments(appointments), 2);
  assert.equal(appointmentFitsCapacity(appointments, 2), false);
});

test("message chunks end on natural boundaries and preserve all content", () => {
  const input = "Primeira frase com emoji 🙂. Segunda frase; com detalhes.\n\nÚltimo parágrafo.";
  const chunks = splitNaturalMessage(input, 32);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), input.replace(/\s+/g, " ").trim());
  assert.ok(chunks.every((chunk) => chunk.length <= 32));
  assert.ok(chunks.every((chunk) => !/[\p{L}\p{N}]$/.test(chunk) || !input.includes(`${chunk}x`)));
});

test("agent calendar context is opt-in and compiles explicit permissions", () => {
  const config = normalizeAgentRuntimeConfig({
    objective: "Agendar demonstrações",
    calendarEnabled: true,
    calendarId: "11111111-1111-4111-8111-111111111111",
    calendarPermissions: ["read", "create", "reschedule"],
    includeClientTags: true,
    includeFollowUps: true,
  });
  assert.equal(config.calendarEnabled, true);
  assert.deepEqual(config.calendarPermissions, ["read", "create", "reschedule"]);
  assert.match(buildAgentInstructions(config), /CALENDÁRIO/);
});

test("agent calendar mutations require explicit permission", () => {
  assert.equal(hasAgentCalendarPermission([], "create"), false);
  assert.equal(hasAgentCalendarPermission(["read"], "create"), false);
  assert.equal(hasAgentCalendarPermission(["create"], "create"), true);
});

test("agent prompt includes bounded client tags and next appointment only when supplied", () => {
  const prompt = buildAgentConversationPrompt("Quero remarcar", [], [], {
    clientName: "Cliente atual",
    tags: ["vip", "demo"],
    nextAppointment: { title: "Demonstração", startsAt: "2026-10-14T14:00:00.000Z" },
  });
  assert.match(prompt, /TAGS DO CLIENTE/);
  assert.match(prompt, /PRÓXIMO AGENDAMENTO/);
});

test("typing delay is bounded and grows with human-readable response length", () => {
  assert.ok(estimateTypingDelayMs("curta") >= 500);
  assert.ok(estimateTypingDelayMs("x".repeat(600)) > estimateTypingDelayMs("curta"));
  assert.equal(estimateTypingDelayMs("x".repeat(100000)), 4500);
});

test("Groq guard deduplicates concurrent requests and caches the short result", async () => {
  const guard = createGroqGuard({ ttlMs: 1000, maxConcurrent: 1 });
  let calls = 0;
  const run = () =>
    guard.run("workspace:agent:chat", async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "ok";
    });
  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first, "ok");
  assert.equal(second, "ok");
  assert.equal(calls, 1);
  assert.equal(await run(), "ok");
  assert.equal(calls, 1);
});

test("Groq guard rejects an unbounded queue instead of overloading the provider", async () => {
  const guard = createGroqGuard({ maxConcurrent: 1, maxQueued: 1, ttlMs: 1000 });
  const blocker = guard.run("busy", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  });
  const queued = guard.run("queued", async () => "ok");
  await assert.rejects(() => guard.run("overflow", async () => "never"), /groq_queue_saturated/);
  await Promise.all([blocker, queued]);
});

test("calendar directives are strict and removed before customer delivery", () => {
  const result = extractCalendarDirective(
    'Vou ajustar. <!--INBOXOS_CALENDAR {"action":"reschedule","appointmentId":"11111111-1111-4111-8111-111111111111","startsAt":"2026-10-14T14:00:00Z","endsAt":"2026-10-14T14:30:00Z"}-->',
  );
  assert.equal(result.directive?.action, "reschedule");
  assert.doesNotMatch(result.text, /INBOXOS_CALENDAR/);
  assert.equal(
    extractCalendarDirective('<!--INBOXOS_CALENDAR {"action":"reschedule"}-->').directive,
    null,
  );
});
