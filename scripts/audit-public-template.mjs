import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [".env.example", "README.md", "LICENSE", "docs/OPEN_SOURCE_SETUP.md"];

const forbiddenTracked =
  /(^|\/)(?:\.env(?:\.[^/]+)?|\.dev\.vars|\.vercel|dist|node_modules)(?:\/|$)/i;
const sensitiveKeys = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "EVOLUTION_API_KEY",
  "RESEND_API_KEY",
  "GROQ_API_KEY",
  "AUTH_CRYPTO_SECRET",
  "INTEGRATION_VAULT_KEY",
  "HEALTHCHECK_SECRET",
  "CRON_SECRET",
];
const placeholder = /(?:YOUR_|REPLACE|CHANGE_ME|PROJECT|example|^$)/i;
const browserSecretPattern =
  /(?:SUPABASE_SERVICE_ROLE_KEY|EVOLUTION_API_KEY|RESEND_API_KEY|GROQ_API_KEY|AUTH_CRYPTO_SECRET|INTEGRATION_VAULT_KEY)/;
const privateReferencePatterns = [
  {
    pattern: /(?:^|[^a-z])(?:bopdgnmifuohuoftjexs|aczstooavclxhmgtsobg)(?:[^a-z]|$)/i,
    label: "Supabase project reference",
  },
  { pattern: /(?:https?:\/\/)?(?:www\.)?inboxos\.cloud(?:\b|\/)/i, label: "production domain" },
  { pattern: /ackleynicolas@gmail\.com/i, label: "operator email" },
  { pattern: /WhatsApp_1665/i, label: "real Evolution instance" },
  { pattern: /(?:\.gemini|\.tempmediaStorage|C:\\\\Users\\\\)/i, label: "private machine path" },
];
const textExtensions =
  /\.(?:md|mdx|txt|json|ya?ml|toml|mjs|cjs|js|ts|tsx|css|html|sql|sh|ps1|example)$/i;
const strictPrivateReferenceAudit =
  process.argv.includes("--strict") ||
  process.env.AUDIT_PUBLIC_TEMPLATE_STRICT === "1" ||
  !existsSync(".git");

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    const ignored = new Set([".git", "node_modules", "dist", ".vercel", ".tanstack"]);
    const walk = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (ignored.has(entry.name)) return [];
        const fullPath = join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath.replaceAll("\\", "/")];
      });
    return walk(".").map((file) => file.replace(/^\.\//, ""));
  }
}

const files = trackedFiles();
const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`arquivo obrigatório ausente: ${file}`);
}

for (const file of files) {
  if (forbiddenTracked.test(file) && file !== ".env.example") {
    failures.push(`arquivo sensível/artefato versionado: ${file}`);
  }

  if (
    file === "scripts/audit-public-template.mjs" ||
    !strictPrivateReferenceAudit ||
    !textExtensions.test(file) ||
    !existsSync(file)
  )
    continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { pattern, label } of privateReferencePatterns) {
    if (pattern.test(content)) failures.push(`${file}: ${label} detected`);
  }
}

for (const file of [".env.example"]) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !sensitiveKeys.includes(match[1])) continue;
    const value = match[2].trim();
    if (value && !placeholder.test(value)) {
      failures.push(`${file}: valor real detectado em ${match[1]}`);
    }
  }
}

const browserSources = [
  "src/components",
  "src/features",
  "src/routes/auth",
  "src/routes/index.tsx",
  "src/routes/__root.tsx",
];
for (const root of browserSources) {
  if (!existsSync(root)) continue;
  const candidates = files.filter((file) => file === root || file.startsWith(`${root}/`));
  for (const file of candidates) {
    if (!/\.(?:[cm]?[jt]sx?|vue|svelte)$/i.test(file) || !existsSync(file)) continue;
    if (browserSecretPattern.test(readFileSync(file, "utf8"))) {
      failures.push(`segredo server-side referenciado em código de navegador: ${file}`);
    }
  }
}

if (failures.length) {
  console.error("FAIL audit:public");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS audit:public (${files.length} arquivos rastreados; templates sem credenciais)`);
