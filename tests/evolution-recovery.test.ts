import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideEvolutionRecovery,
  interleaveEvolutionRecovery,
  EVOLUTION_RECOVERY_BATCH_SIZE,
  type RecoverableEvolutionEvent,
} from "../src/server/evolution/recovery-policy.ts";
import { recoverEvolutionInbox } from "../src/server/evolution/recovery.server.ts";
import {
  evolutionBackgroundSignature,
  verifyEvolutionBackgroundSignature,
} from "../src/server/evolution/background-dispatch.ts";

const NOW = Date.parse("2026-10-02T15:00:00.000Z");
const iso = (offset: number) => new Date(NOW + offset).toISOString();
function event(
  id: string,
  status: RecoverableEvolutionEvent["status"],
  opts: Partial<RecoverableEvolutionEvent> = {},
): RecoverableEvolutionEvent {
  return {
    id,
    status,
    attempts: 0,
    received_at: iso(-60_000_000),
    processing_at: null,
    next_attempt_at: iso(-1_000),
    ...opts,
  };
}

function memoryDb(source: RecoverableEvolutionEvent[], onCas?: (id: string) => void) {
  const rows = structuredClone(source);
  const queries: string[] = [];
  class Chain {
    filters: Array<(row: RecoverableEvolutionEvent) => boolean> = [];
    operation: "select" | "update" = "select";
    patch: Partial<RecoverableEvolutionEvent> = {};
    orderBy = "received_at";
    ascending = true;
    constructor(table: string) {
      queries.push(table);
    }
    select(_cols: string) {
      return this;
    }
    update(patch: Partial<RecoverableEvolutionEvent>) {
      this.operation = "update";
      this.patch = patch;
      return this;
    }
    eq(key: keyof RecoverableEvolutionEvent, value: unknown) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    is(key: keyof RecoverableEvolutionEvent, value: null) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    lte(key: keyof RecoverableEvolutionEvent, value: string) {
      this.filters.push((row) => {
        const timestamp = row[key];
        return typeof timestamp === "string" && Date.parse(timestamp) <= Date.parse(value);
      });
      return this;
    }
    order(key: keyof RecoverableEvolutionEvent, { ascending = true } = {}) {
      this.orderBy = key;
      this.ascending = ascending;
      return this;
    }
    limit(limit: number) {
      const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
      matching.sort(
        (a, b) =>
          String(a[this.orderBy as keyof RecoverableEvolutionEvent]).localeCompare(
            String(b[this.orderBy as keyof RecoverableEvolutionEvent]),
          ) * (this.ascending ? 1 : -1),
      );
      return Promise.resolve({
        data: matching.slice(0, limit).map((row) => ({ ...row })),
        error: null,
      });
    }
    maybeSingle() {
      const candidate = rows.find((row) => this.filters.every((filter) => filter(row)));
      if (candidate && this.operation === "update") {
        onCas?.(candidate.id);
        // Simulate a concurrent transaction changing the record after scan.
        const fresh = rows.find(
          (row) => row.id === candidate.id && this.filters.every((filter) => filter(row)),
        );
        if (!fresh) return Promise.resolve({ data: null, error: null });
        Object.assign(fresh, this.patch);
        return Promise.resolve({ data: { id: fresh.id }, error: null });
      }
      return Promise.resolve({ data: candidate ? { id: candidate.id } : null, error: null });
    }
  }
  return {
    db: {
      from(table: string) {
        return new Chain(table);
      },
    },
    rows,
    queries,
  };
}

test("Evolution recovery applies minimum grace periods and never recovers a live worker", () => {
  assert.equal(
    decideEvolutionRecovery(event("1", "queued", { received_at: iso(-30_000) }), NOW),
    "skip",
  );
  assert.equal(
    decideEvolutionRecovery(event("2", "queued", { received_at: iso(-100_000) }), NOW),
    "dispatch",
  );
  assert.equal(
    decideEvolutionRecovery(event("3", "failed", { next_attempt_at: iso(90_000) }), NOW),
    "skip",
  );
  assert.equal(
    decideEvolutionRecovery(event("4", "failed", { next_attempt_at: iso(-100) }), NOW),
    "dispatch",
  );
  assert.equal(
    decideEvolutionRecovery(
      event("legacy", "failed", { next_attempt_at: null, received_at: iso(-100_000) }),
      NOW,
    ),
    "dispatch",
  );
  assert.equal(
    decideEvolutionRecovery(
      event("recent-legacy", "failed", { next_attempt_at: null, received_at: iso(-30_000) }),
      NOW,
    ),
    "skip",
  );
  assert.equal(
    decideEvolutionRecovery(event("5", "processing", { processing_at: iso(-14 * 60_000) }), NOW),
    "skip",
  );
  assert.equal(
    decideEvolutionRecovery(event("6", "processing", { processing_at: iso(-21 * 60_000) }), NOW),
    "reset-and-dispatch",
  );
  assert.equal(
    decideEvolutionRecovery(
      event("7", "processing", { processing_at: null, received_at: iso(-21 * 60_000) }),
      NOW,
    ),
    "reset-and-dispatch",
  );
  assert.equal(decideEvolutionRecovery(event("8", "failed", { attempts: 5 }), NOW), "dead-letter");
  assert.equal(decideEvolutionRecovery(event("9", "failed", { attempts: NaN }), NOW), "skip");
});

test("interleaving prevents starving queued events when stale/failed are numerous", () => {
  const groups = [
    Array.from({ length: 20 }, (_, i) => event(`stale-${i}`, "processing")),
    Array.from({ length: 20 }, (_, i) => event(`failed-${i}`, "failed")),
    Array.from({ length: 20 }, (_, i) => event(`queued-${i}`, "queued")),
  ];
  const actual = interleaveEvolutionRecovery(groups, 9);
  assert.equal(actual.length, 9);
  assert.equal(actual.filter((row) => row.status === "queued").length, 3);
  assert.equal(EVOLUTION_RECOVERY_BATCH_SIZE, 18);
});

test("scheduler re-dispatches due queued/failed and resets stale processing with atomic comparisons", async () => {
  const { db, rows } = memoryDb([
    event("queued", "queued"),
    event("failed", "failed", { attempts: 2 }),
    event("legacy-failed", "failed", {
      attempts: 1,
      next_attempt_at: null,
      received_at: iso(-500_000),
    }),
    event("stale", "processing", { attempts: 3, processing_at: iso(-25 * 60_000) }),
    event("old-no-timestamp", "processing", {
      processing_at: null,
      received_at: iso(-25 * 60_000),
    }),
    event("maxed", "processing", { attempts: 5, processing_at: iso(-26 * 60_000) }),
    event("still-working", "processing", { processing_at: iso(-8 * 60_000) }),
    event("not-due", "failed", { next_attempt_at: iso(60_000) }),
    event("recent", "queued", { received_at: iso(-10_000) }),
  ]);
  const sent: string[] = [];
  const result = await recoverEvolutionInbox(
    db as never,
    async (id) => {
      sent.push(id);
    },
    { now: NOW },
  );
  assert.deepEqual(
    new Set(sent),
    new Set(["queued", "failed", "legacy-failed", "stale", "old-no-timestamp"]),
  );
  assert.deepEqual(result, {
    examined: 6,
    dispatched: 5,
    reset: 2,
    deadLettered: 1,
    failedToDispatch: 0,
  });
  assert.equal(rows.find((x) => x.id === "stale")?.status, "failed");
  assert.equal(
    rows.find((x) => x.id === "stale")?.attempts,
    3,
    "scheduler must NOT increment worker attempts",
  );
  assert.equal(rows.find((x) => x.id === "maxed")?.status, "dead_letter");
  assert.equal(rows.find((x) => x.id === "still-working")?.status, "processing");
});

test("failed background dispatch is retried on next schedule without losing the durable event", async () => {
  const { db, rows } = memoryDb([event("requeue", "failed", { attempts: 1 })]);
  const result = await recoverEvolutionInbox(
    db as never,
    async () => {
      throw new Error("temporary network issue");
    },
    { now: NOW },
  );
  assert.equal(result.failedToDispatch, 1);
  assert.equal(result.dispatched, 0);
  assert.equal(rows[0]?.status, "failed");
  assert.equal(rows[0]?.attempts, 1);
});

test("stale reset does not overwrite completion by a competing worker", async () => {
  const { db, rows } = memoryDb(
    [event("concurrent", "processing", { processing_at: iso(-22 * 60_000) })],
    (id) => {
      const concurrent = rows.find((item) => item.id === id);
      if (concurrent) concurrent.status = "completed" as never;
    },
  );
  const sent: string[] = [];
  const report = await recoverEvolutionInbox(
    db as never,
    async (id) => {
      sent.push(id);
    },
    { now: NOW },
  );
  assert.equal(report.dispatched, 0);
  assert.equal(report.reset, 0);
  assert.deepEqual(sent, []);
  assert.equal(rows[0]?.status, "completed");
});

test("database query errors fail the recovery run closed, without dispatching anything", async () => {
  const failedDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          lte: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: "DB unavailable" } }),
            }),
          }),
          is: () => ({
            lte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: null, error: { message: "DB unavailable" } }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
  const sent: string[] = [];
  await assert.rejects(
    () =>
      recoverEvolutionInbox(
        failedDb as never,
        async (id) => {
          sent.push(id);
        },
        { now: NOW },
      ),
    /scan failed/,
  );
  assert.equal(sent.length, 0);
});

test("Vercel recovery requires explicit opt-in, bounded concurrency and authenticated background delivery", () => {
  const scheduler = readFileSync(
    new URL("../src/routes/api/cron/evolution-recover.ts", import.meta.url),
    "utf8",
  );
  const dispatcher = readFileSync(
    new URL("../src/server/evolution/background-dispatch.ts", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(scheduler, /ENABLE_EVOLUTION_RECOVERY/);
  assert.match(scheduler, /CRON_SECRET/);
  assert.match(scheduler, /recoverEvolutionInbox\(/);
  assert.match(scheduler, /maxBatch: 18, concurrency: 3/);
  assert.match(
    dispatcher,
    /x-inbox-background-signature.*evolutionBackgroundSignature\(eventId, sentAt\)/,
  );
  assert.match(dispatcher, /x-inbox-background-sent-at/);
  assert.match(worker, /MAX_QUEUE_ATTEMPTS = MAX_EVOLUTION_ATTEMPTS/);
});

test("background dispatch signature expires and binds event ID, unlike an indefinite bearer token", () => {
  const saved = process.env["AUTH_CRYPTO_SECRET"];
  process.env["AUTH_CRYPTO_SECRET"] = "local-ci-test-secret-at-least-32-characters-!";
  try {
    const id = "4f2086d7-e990-471e-83d0-0c71330a20c5";
    const now = 1_780_000_000_000;
    const at = String(now);
    const signature = evolutionBackgroundSignature(id, at);
    assert.equal(verifyEvolutionBackgroundSignature(id, at, signature, now), true);
    assert.equal(
      verifyEvolutionBackgroundSignature(id, at, signature, now + 15 * 60_000 + 1),
      false,
    );
    assert.equal(
      verifyEvolutionBackgroundSignature(id, at, signature, now - 15 * 60_000 - 1),
      false,
    );
    assert.equal(
      verifyEvolutionBackgroundSignature(
        "0f2086d7-e990-471e-83d0-0c71330a20c5",
        at,
        signature,
        now,
      ),
      false,
    );
    assert.equal(
      verifyEvolutionBackgroundSignature(id, String(now + 20_000), signature, now),
      false,
    );
    assert.equal(verifyEvolutionBackgroundSignature(id, at, "bad", now), false);
  } finally {
    if (saved === undefined) delete process.env["AUTH_CRYPTO_SECRET"];
    else process.env["AUTH_CRYPTO_SECRET"] = saved;
  }
});

test("background invocation sends a fresh short-lived signature with a small, authenticated event ID body", async () => {
  const originalFetch = globalThis.fetch;
  const previousSecret = process.env["AUTH_CRYPTO_SECRET"];
  process.env["AUTH_CRYPTO_SECRET"] = "local-ci-test-secret-at-least-32-characters-!";
  const deliveries: Array<{ endpoint: string; headers: Headers; body: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    deliveries.push({
      endpoint: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body),
    });
    return new Response("", { status: 202 });
  }) as typeof fetch;
  try {
    const { invokeVercelEvolutionBackground } =
      await import("../src/server/evolution/background-dispatch.ts");
    const id = "4f2086d7-e990-471e-83d0-0c71330a20c5";
    await invokeVercelEvolutionBackground(
      "https://preview.vercel.app",
      id,
      AbortSignal.timeout(5_000),
    );
    assert.equal(deliveries.length, 1);
    const delivery = deliveries[0]!;
    assert.equal(delivery.endpoint, "https://preview.vercel.app/api/internal/evolution-events");
    assert.deepEqual(JSON.parse(delivery.body), { eventId: id });
    const sentAt = delivery.headers.get("x-inbox-background-sent-at") || "";
    const signature = delivery.headers.get("x-inbox-background-signature") || "";
    assert.equal(verifyEvolutionBackgroundSignature(id, sentAt, signature), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env["AUTH_CRYPTO_SECRET"];
    else process.env["AUTH_CRYPTO_SECRET"] = previousSecret;
  }
});

test("scheduler recovery processes only a bounded batch per invocation", async () => {
  const rows = Array.from({ length: 150 }, (_, i) => event(`event-${i}`, "queued"));
  const { db } = memoryDb(rows);
  let delivered = 0;
  const report = await recoverEvolutionInbox(
    db as never,
    async () => {
      delivered++;
    },
    { now: NOW },
  );
  assert.equal(delivered, EVOLUTION_RECOVERY_BATCH_SIZE);
  assert.equal(report.examined, EVOLUTION_RECOVERY_BATCH_SIZE);
  assert.equal(report.dispatched, EVOLUTION_RECOVERY_BATCH_SIZE);
});

test("Vercel recovery cron is Hobby-compatible and remains opt-in", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(vercel.crons?.[0]?.path, "/api/cron/evolution-recover");
  assert.equal(vercel.crons?.[0]?.schedule, "0 3 * * *");
  const route = readFileSync(
    new URL("../src/routes/api/cron/evolution-recover.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /ENABLE_EVOLUTION_RECOVERY/);
});
