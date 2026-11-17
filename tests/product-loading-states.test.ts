import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveViewDataState } from "../src/features/inbox/view-data-state.ts";
import { progressiveRenderLimit } from "../src/features/inbox/product-surface.ts";

const source = readFileSync(
  new URL("../src/features/inbox/components/ProductViews.tsx", import.meta.url),
  "utf8",
);

test("distinguishes initial, refreshing, empty, error, and ready data states", () => {
  assert.equal(
    deriveViewDataState({ hasData: false, isLoading: true, hasError: false, isEmpty: false }),
    "initial",
  );
  assert.equal(
    deriveViewDataState({ hasData: true, isLoading: true, hasError: false, isEmpty: false }),
    "refreshing",
  );
  assert.equal(
    deriveViewDataState({ hasData: true, isLoading: false, hasError: false, isEmpty: true }),
    "empty",
  );
  assert.equal(
    deriveViewDataState({ hasData: false, isLoading: false, hasError: true, isEmpty: false }),
    "error",
  );
  assert.equal(
    deriveViewDataState({ hasData: true, isLoading: false, hasError: true, isEmpty: false }),
    "ready",
  );
});

test("dashboard and CRM use structural presentation states instead of literal blocking loading copy", () => {
  assert.match(source, /deriveViewDataState/);
  assert.match(source, /data-state="initial"/);
  assert.match(source, /data-state="refreshing"/);
  assert.match(source, /5: "grid-cols-2 lg:grid-cols-5"/);
  assert.match(source, /3: "grid-cols-2 md:grid-cols-3"/);
  assert.doesNotMatch(source, /grid-cols-\$\{columns\}/);
  assert.doesNotMatch(source, /Carregando indicadores/);
});

test("product surfaces keep long CRM lists progressive on compact screens", () => {
  assert.equal(progressiveRenderLimit("compact"), 24);
  assert.equal(progressiveRenderLimit("mobile"), 32);
  assert.equal(progressiveRenderLimit("tablet"), 48);
  assert.equal(progressiveRenderLimit("desktop"), 72);
  assert.match(source, /inboxos-product-surface/);
  assert.match(source, /visibleLeadCounts/);
  assert.match(source, /Mostrar mais/);
});

test("clients distinguish their first load from a real empty result", () => {
  assert.match(source, /const \[hasLoaded, setHasLoaded\] = useState\(false\)/);
  assert.match(source, /title="Clientes"/);
  assert.match(source, /Preparando clientes do workspace/);
  assert.match(source, /viewState === "empty"/);
});

test("follow-up, calendar, and agents keep an explicit initial data state", () => {
  for (const surface of ["FollowUpView", "CalendarView", "AgentsView"]) {
    const start = source.indexOf(`export function ${surface}`);
    const end = source.indexOf("export function ", start + 1);
    const segment = source.slice(start, end === -1 ? undefined : end);
    assert.match(segment, /const \[hasLoaded, setHasLoaded\] = useState\(false\)/);
    assert.match(segment, /const \[isLoading, setIsLoading\] = useState\(true\)/);
    assert.match(segment, /deriveViewDataState/);
    assert.match(segment, /inboxos-product-surface/);
    assert.match(segment, /DataSkeleton/);
  }
});
