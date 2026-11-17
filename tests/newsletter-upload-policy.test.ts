import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_NEWSLETTER_FUNCTION_UPLOAD_BYTES as MAX,
  isAllowedNewsletterMedia,
} from "../src/lib/newsletter-upload-policy.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("Vercel Function upload stays below the request-body safety margin", () => {
  assert.equal(MAX, 3 * 1024 * 1024);
  for (const type of [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
  ]) {
    assert.equal(isAllowedNewsletterMedia(type, 1), true, type);
    assert.equal(isAllowedNewsletterMedia(type, MAX), true, type);
    assert.equal(isAllowedNewsletterMedia(type, MAX + 1), false, type);
  }
  for (const bytes of [0, -1, Infinity, NaN, 1.5])
    assert.equal(isAllowedNewsletterMedia("image/png", bytes), false);
  for (const type of ["application/pdf", "text/html", "image/svg+xml", "", "IMAGE/PNG"]) {
    assert.equal(isAllowedNewsletterMedia(type, 10), false, type);
  }
});

test("both upload paths enforce the same policy before their HTTP/storage operations", () => {
  const api = source("../src/server/admin/newsletter.server.ts");
  const ui = source("../src/features/inbox/components/SystemAdminView.tsx");
  assert.ok(/isAllowedNewsletterMedia\(\s*file\.type\s*,\s*file\.size\s*\)/.test(api));
  assert.ok(/isAllowedNewsletterMedia\(\s*file\.type,\s*file\.size\s*\)/.test(api));
  assert.ok(/storage\s*\.from\(\s*["']newsletter-media["']\s*\)\s*\.upload\(/.test(api));
  assert.ok(/isAllowedNewsletterMedia\(\s*assetFile\.type\s*,\s*assetFile\.size\s*\)/.test(ui));
  assert.ok(ui.includes("Informe a URL HTTPS de uma imagem de capa"));
});

test("newsletter media remains public-read but never public-write", () => {
  const migration = source(
    "../supabase/migrations/20261019130000_newsletter_media_write_boundary.sql",
  );
  assert.match(migration, /schemaname = 'storage'/i);
  assert.match(migration, /newsletter-media/i);
  assert.match(migration, /drop policy if exists newsletter_media_service_insert/i);
  assert.match(migration, /create policy newsletter_media_service_insert[\s\S]*to service_role/i);
  assert.match(migration, /create policy newsletter_media_service_update[\s\S]*to service_role/i);
  assert.match(migration, /create policy newsletter_media_service_delete[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /to (?:public|anon|authenticated)\s+(?:for|using|with)/i);
});
