import assert from "node:assert/strict";
import test from "node:test";

import { classifyViewport } from "../src/hooks/use-responsive-viewport.ts";

test("classifies width, height, and orientation for compact through desktop layouts", () => {
  assert.deepEqual(classifyViewport({ width: 320, height: 640 }), {
    horizontal: "compact",
    vertical: "regular",
    orientation: "portrait",
    isDesktop: false,
  });
  assert.deepEqual(classifyViewport({ width: 768, height: 540 }), {
    horizontal: "tablet",
    vertical: "short",
    orientation: "landscape",
    isDesktop: false,
  });
  assert.deepEqual(classifyViewport({ width: 1440, height: 900 }), {
    horizontal: "desktop",
    vertical: "tall",
    orientation: "landscape",
    isDesktop: true,
  });
});
