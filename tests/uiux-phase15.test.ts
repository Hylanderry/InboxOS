import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("F15/UI01: text submission is protected from double clicks and preserves newer draft", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /sendInFlightRef\.current = true/);
  assert.match(code, /sendInFlightRef\.current = false/);
  assert.match(
    code,
    /setText\(\(current\)\s*=>\s*\(?\s*current\.trim\(\)\s*===\s*clean\s*\?\s*""\s*:\s*current\s*\)?\s*\)/,
  );
});

test("F15/UI02: media send has try/catch/finally and guards concurrent sends", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /const sendMedia = async/);
  assert.match(code, /if \(sendInFlightRef\.current\) return;/);
  assert.match(code, /const ok = await onSendMessage\(payload\)/);
  assert.match(code, /finally \{\s*sendInFlightRef\.current = false;\s*setIsSending\(false\)/);
});

test("F15/UI03: empty files are rejected and microphone denial gets feedback", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /file\.size === 0/);
  assert.match(code, /Não foi possível acessar o microfone/);
  assert.match(code, /audioStopInFlightRef\.current/);
});

test("F15/UI04: recorded filename extension aligns with MIME type", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /res\.blob\.type\.includes\("ogg"\)/);
  assert.match(code, /res\.blob\.type\.includes\("mp4"\)/);
  assert.match(code, /fileName: `audio-\$\{Date\.now\(\)\}\.\$\{extension\}`/);
});

test("F15/UI05: media preview has keyboard trap, ESC and focus restoration", () => {
  const code = source("src/features/media/components/MediaPreviewModal.tsx");
  assert.match(code, /role="dialog"/);
  assert.match(code, /aria-modal="true"/);
  assert.match(code, /e\.key\s*===\s*["']Escape["']/);
  assert.match(code, /e\.key\s*!==\s*["']Tab["']/);
  assert.match(code, /previouslyFocused\?\.isConnected/);
});

test("F15/UI06: import modal announces title, tabs and rejects large local files", () => {
  const code = source("src/features/inbox/components/ImportExportModal.tsx");
  assert.match(code, /aria-labelledby="import-export-dialog-title"/);
  assert.match(code, /aria-pressed=\{tab === "import"\}/);
  assert.match(code, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(code, /reader\.onerror/);
});

test("F15/UI07: mobile dock announces unread count once", () => {
  const code = source("src/features/inbox/components/MobileDock.tsx");
  assert.match(code, /aria-label=\{\s*id\s*===\s*"inbox"/);
  assert.match(code, /aria-hidden="true" className="mobile-dock-badge"/);
});

test("F15/UI08: QR and import dialogs restore focus and trap Tab", () => {
  for (const path of [
    "src/features/instances/components/QrCodeDialog.tsx",
    "src/features/inbox/components/ImportExportModal.tsx",
  ]) {
    const code = source(path);
    assert.match(code, /const\s+previouslyFocused\s*=\s*document\.activeElement/);
    assert.match(code, /event\.key !== "Tab"/);
    assert.match(code, /dialogRef\.current\?\.querySelectorAll/);
    assert.match(code, /previouslyFocused\?\.isConnected/);
    assert.match(code, /ref=\{dialogRef\}/);
  }
});

test("F15/UI09: QR dialog close action has a screen-reader label", () => {
  assert.match(
    source("src/features/instances/components/QrCodeDialog.tsx"),
    /aria-label="Fechar conexão WhatsApp"/,
  );
});

test("F15/UI10: import result announced and pasted contacts named", () => {
  const code = source("src/features/inbox/components/ImportExportModal.tsx");
  assert.match(code, /role="status"\s+aria-live="polite"/);
  assert.match(code, /aria-label="Contatos para importar em formato CSV ou JSON"/);
});
