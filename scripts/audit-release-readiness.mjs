/** Static release preflight. Offline-safe; does not contact production systems.
 * This does NOT replace lint, tsc, build or real HTTP/E2E tests.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { validatePackageLock } from "./lib/release-validation.mjs";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const checks = [];
const add = (name, passed, detail, extra = []) => checks.push({ name, passed, detail, extra });

const lockIssues = validatePackageLock(pkg, lock);
add(
  "package-lock integrity for direct dependencies",
  lockIssues.length === 0,
  lockIssues.length
    ? `${lockIssues.length} issue(s)`
    : "root specifications, resolved entries and integrity consistent",
  lockIssues,
);

let ts;
try {
  ts = require("typescript");
} catch {
  try {
    ts = require(
      join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "typescript"),
    );
  } catch {
    ts = null;
  }
}

function visitDir(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? visitDir(path)
      : /\.(?:tsx?|mts)$/.test(name)
        ? [path]
        : [];
  });
}
const files = visitDir(join(root, "src"));
if (!ts) {
  add("TypeScript parser", false, "Install dev dependencies or typescript globally");
} else {
  const failures = [];
  const importsMissing = [];
  for (const file of files) {
    const code = readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
    for (const diagnostic of source.parseDiagnostics)
      failures.push(
        `${relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      );
    function walk(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text.split("?", 1)[0];
        let candidate;
        if (spec.startsWith("@/")) candidate = join(root, "src", spec.slice(2));
        if (spec.startsWith("./") || spec.startsWith("../"))
          candidate = resolve(dirname(file), spec);
        if (
          candidate &&
          ![
            candidate,
            ...[".ts", ".tsx", ".mts", ".js", ".json"].map((x) => candidate + x),
            join(candidate, "index.ts"),
            join(candidate, "index.tsx"),
          ].some(existsSync)
        ) {
          importsMissing.push(`${relative(root, file)} -> ${spec}`);
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  add(
    "TypeScript/TSX/MTS source parsing",
    !failures.length,
    `${files.length} files; ${failures.length} parse errors`,
    failures,
  );
  add(
    "Relative and @/ import resolution",
    !importsMissing.length,
    `${importsMissing.length} unresolved imports`,
    importsMissing,
  );
}

const treeFile = join(root, "src", "routeTree.gen.ts");
const routePaths = visitDir(join(root, "src", "routes")).filter((x) => !x.endsWith("__root.tsx"));
const tree = existsSync(treeFile) ? readFileSync(treeFile, "utf8") : "";
const routesMissing = routePaths
  .filter((file) => {
    const match = readFileSync(file, "utf8").match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    return !match || !tree.includes(`'${match[1]}'`);
  })
  .map((file) => relative(root, file));
add(
  "File routes represented in routeTree",
  !!tree && !routesMissing.length,
  `${routePaths.length} routes; ${routesMissing.length} unmatched`,
  routesMissing,
);

const billFlag = readFileSync(join(root, "src", "server", "product", "billing-flag.ts"), "utf8");
const browserFlag = readFileSync(join(root, "src", "features", "inbox", "billing-flag.ts"), "utf8");
add(
  "Billing guarded behind explicit true flags",
  /===\s*["']true["']/.test(billFlag) && /===\s*["']true["']/.test(browserFlag),
  "Core Billing stays OFF unless explicitly opted in",
);

for (const c of checks) console.log(`${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
const blockers = checks.filter((c) => !c.passed);
if (blockers.length) {
  for (const c of blockers)
    for (const line of (c.extra ?? []).slice(0, 20)) console.log(`  ${line}`);
  console.error(`Preflight blocked: ${blockers.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(
    "Static checks passed. Runtime build and live integration validation remain separate gates.",
  );
}
