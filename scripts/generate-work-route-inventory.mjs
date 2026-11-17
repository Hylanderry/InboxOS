// Internal one-off document helper: static inventory, not a runtime router.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const docPath = join(root, "docs/WORK_HANDOFF_EXAUSTIVO_FASE8_2026-10-02.md");
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}
const routes = walk(join(root, "src/routes/api")).sort();
const rows = [];
for (const f of routes) {
  const code = readFileSync(f, "utf8");
  const route = code.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1];
  if (!route) continue;
  let methods = [
    ...new Set(
      [
        ...code.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s*:\s*(?:async\s*)?(?:\(|\{|[a-zA-Z_$])/g),
      ].map((x) => x[1]),
    ),
  ];
  const normalized = route.replaceAll("|", "\\|").replaceAll("`", "\\`");
  rows.push(
    `| \`${normalized}\` | ${methods.length ? methods.join(", ") : "Conferir handler"} | \`${f.slice(root.length)}\` |`,
  );
}
let doc = readFileSync(docPath, "utf8");
const generated = `**${rows.length} arquivos API catalogados estaticamente.** Este inventário descreve caminhos e métodos potenciais, não comprova acesso HTTP real.\n\n| Rota file-based | Métodos observados | Arquivo de implementação |\n|---|---|---|\n${rows.join("\n")}\n`;
doc = doc.replace("<!-- AUTO_ROUTE_MATRIX -->", generated);
writeFileSync(docPath, doc);
console.log(
  `Appended ${rows.length} API route files; ${rows.reduce((sum, r) => sum + r.split("|")[2].split(",").length, 0)} method entries (possibly unverified)`,
);
