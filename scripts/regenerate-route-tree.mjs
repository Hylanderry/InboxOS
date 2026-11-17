// Offline fallback for route type tree. Official TanStack Router plugin may regenerate this at build time.
// Parses only first-party createFileRoute paths; fails on missing/duplicate file routes.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
const root = resolve("src/routes");
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.(tsx?|jsx?)$/.test(name) && name !== "__root.tsx"
        ? [p]
        : [];
  });
}
const paths = walk(root)
  .sort()
  .map((file) => {
    const src = readFileSync(file, "utf8");
    const match = src.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    if (!match) throw Error(`Missing createFileRoute in ${file}`);
    return {
      importPath:
        "./routes/" +
        relative(root, file)
          .replaceAll("\\", "/")
          .replace(/\.(tsx?|jsx?)$/, ""),
      route: match[1],
    };
  });
const found = new Set();
for (const p of paths) {
  if (found.has(p.route)) throw Error("Duplicate route " + p.route);
  found.add(p.route);
}
const entries = paths.map((p, i) => ({
  ...p,
  key: `R${String(i + 1).padStart(3, "0")}`,
  to: p.route === "/" ? "/" : p.route.replace(/\/$/, ""),
}));
const code = [];
const out = (line) => code.push(line);
out("/* eslint-disable */");
out("// @ts-nocheck");
out("// Generated deterministically from createFileRoute() sources.");
out("// TanStack Router will replace this file on a successful official build.");
out("import { Route as rootRouteImport } from './routes/__root'");
for (const e of entries) out(`import { Route as ${e.key}RouteImport } from '${e.importPath}'`);
out("");
for (const e of entries) {
  out(`const ${e.key}Route = ${e.key}RouteImport.update({`);
  out(`  id: '${e.route}',`);
  out(`  path: '${e.route}',`);
  out("  getParentRoute: () => rootRouteImport,");
  out("} as any)");
  out("");
}
for (const [iface, getKey] of [
  ["FileRoutesByFullPath", (e) => e.route],
  ["FileRoutesByTo", (e) => e.to],
  ["FileRoutesById", (e) => e.route],
]) {
  out(`export interface ${iface} {`);
  for (const e of entries) out(`  '${getKey(e)}': typeof ${e.key}Route`);
  out("}");
  out("");
}
out("export interface FileRouteTypes {");
out("  fileRoutesByFullPath: FileRoutesByFullPath");
out("  fullPaths:");
for (const e of entries) out(`    | '${e.route}'`);
out("  fileRoutesByTo: FileRoutesByTo");
out("  to:");
for (const e of entries) out(`    | '${e.to}'`);
out("  id:");
out("    | '__root__'");
for (const e of entries) out(`    | '${e.route}'`);
out("  fileRoutesById: FileRoutesById");
out("}");
out("");
out("export interface RootRouteChildren {");
for (const e of entries) out(`  ${e.key}Route: typeof ${e.key}Route`);
out("}");
out("");
out("declare module '@tanstack/react-router' {");
out("  interface FileRoutesByPath {");
for (const e of entries) {
  out(`    '${e.route}': {`);
  out(`      id: '${e.route}'`);
  out(`      path: '${e.route}'`);
  out(`      fullPath: '${e.route}'`);
  out(`      preLoaderRoute: typeof ${e.key}RouteImport`);
  out("      parentRoute: typeof rootRouteImport");
  out("    }");
}
out("  }");
out("}");
out("");
out("const rootRouteChildren: RootRouteChildren = {");
for (const e of entries) out(`  ${e.key}Route: ${e.key}Route,`);
out("}");
out("");
out("export const routeTree = rootRouteImport");
out("  ._addFileChildren(rootRouteChildren)");
out("  ._addFileTypes<FileRouteTypes>()");
out("");
out("import type { getRouter } from './router.tsx'");
out("import type { startInstance } from './start.ts'");
out("declare module '@tanstack/react-start' {");
out("  interface Register {");
out("    ssr: true");
out("    router: Awaited<ReturnType<typeof getRouter>>");
out("    config: Awaited<ReturnType<typeof startInstance.getOptions>>");
out("  }");
out("}");
writeFileSync("src/routeTree.gen.ts", code.join("\n") + "\n");
console.log(
  `Generated ${entries.length} routes (including ${entries.filter((e) => e.route.startsWith("/api/")).length} API routes)`,
);
