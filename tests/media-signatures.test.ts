import test from "node:test";
import assert from "node:assert/strict";
import { isNewsletterMediaSignatureValid as valid } from "../src/server/admin/media-signatures.ts";
import { readFileSync } from "node:fs";

const enc = new TextEncoder();
const concat = (...parts: Uint8Array[]) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)));
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const jpeg = Uint8Array.from([255, 216, 255, 224, 0]);
const gif = enc.encode("GIF89a........");
const webp = concat(enc.encode("RIFF"), Uint8Array.from([8, 0, 0, 0]), enc.encode("WEBPVP8 "));
const mp4 = concat(
  Uint8Array.from([0, 0, 0, 24]),
  enc.encode("ftyp"),
  enc.encode("isom"),
  enc.encode("00000000"),
);
const webm = concat(
  Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
  enc.encode("webm"),
);

test("accepts basic signatures of supported newsletter media", () => {
  for (const [type, bytes] of [
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/gif", gif],
    ["image/webp", webp],
    ["video/mp4", mp4],
    ["video/webm", webm],
  ] as const)
    assert.equal(valid(type, bytes), true, type);
  assert.equal(valid("image/gif", enc.encode("GIF87a0000")), true);
});

test("rejects spoofed, truncated, unsupported and image-only ISO brands", () => {
  const html = enc.encode("<html><script>alert(1)</script></html>");
  const types = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
  for (const type of types) {
    assert.equal(valid(type, html), false, type);
    assert.equal(valid(type, new Uint8Array()), false, type);
    assert.equal(valid(type, Uint8Array.from([0, 1, 2])), false, type);
  }
  assert.equal(valid("image/svg+xml", png), false);
  assert.equal(
    valid("video/mp4", concat(Uint8Array.from([0, 0, 0, 16]), enc.encode("ftypheic0000"))),
    false,
  );
  assert.equal(valid("video/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])), false);
  assert.equal(
    valid(
      "video/webm",
      concat(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), enc.encode("webm without a DocType")),
    ),
    false,
  );
  assert.equal(
    valid(
      "video/webm",
      concat(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88]), enc.encode("matroska")),
    ),
    false,
  );
  assert.equal(valid("image/png", jpeg), false);
});

test("newsletter upload validates bytes before the public storage upload", () => {
  const source = readFileSync(
    new URL("../src/server/admin/newsletter.server.ts", import.meta.url),
    "utf8",
  );
  const a = source.indexOf("isNewsletterMediaSignatureValid(file.type, signature)");
  const b = source.search(/storage\s*\.from\(\s*["']newsletter-media["']\s*\)\s*\.upload\(/);
  assert.ok(a >= 0 && b > a);
});
