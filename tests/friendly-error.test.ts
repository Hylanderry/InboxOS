import assert from "node:assert/strict";
import test from "node:test";
import { friendlyErrorText, GENERIC_LOAD_ERROR } from "../src/lib/friendly-error.ts";

test("mensagens técnicas de rede viram texto em português", () => {
  for (const raw of [
    "Failed to fetch",
    "HTTP 500",
    "TypeError: x",
    "NetworkError when attempting",
    "Load failed",
    "",
  ]) {
    assert.equal(friendlyErrorText(raw), GENERIC_LOAD_ERROR, raw);
  }
});

test("texto já escrito para pessoas é mantido e textos longos são cortados", () => {
  assert.equal(friendlyErrorText("Telefone inválido."), "Telefone inválido.");
  assert.equal(friendlyErrorText("a".repeat(300)).length, 178);
  assert.equal(friendlyErrorText("Failed to fetch", "Tente de novo."), "Tente de novo.");
});
