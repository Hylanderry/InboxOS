import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const vercelDeployment = process.env["VERCEL"] === "1" || process.env["NITRO_PRESET"] === "vercel";
const vercelProduction =
  process.env["VERCEL"] === "1" && process.env["VERCEL_ENV"] === "production";
// Keep the production project binding outside the public template. Set this
// server-side variable in the hosting provider for the deployment you own.
const expectedProductionSupabaseRef = process.env["EXPECTED_SUPABASE_PROJECT_REF"]?.trim();
const extractJwtProjectRef = (value: unknown) => {
  const token = String(value ?? "").trim();
  if (!token.startsWith("eyJ")) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded?.ref === "string" ? decoded.ref : null;
  } catch {
    return null;
  }
};

if (vercelProduction) {
  if (!expectedProductionSupabaseRef) {
    throw new Error(
      "Production Vercel build blocked: EXPECTED_SUPABASE_PROJECT_REF is not configured.",
    );
  }
  const refs = [
    process.env["VITE_SUPABASE_PROJECT_ID"],
    process.env["VITE_SUPABASE_URL"]?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1],
    process.env["SUPABASE_URL"]?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1],
  ].filter(Boolean);
  if (refs.some((ref) => ref !== expectedProductionSupabaseRef)) {
    throw new Error(
      "Production Vercel build blocked: Supabase variables point to a non-production project.",
    );
  }
  const keyRefs = [
    extractJwtProjectRef(process.env["SUPABASE_PUBLISHABLE_KEY"]),
    extractJwtProjectRef(process.env["SUPABASE_SERVICE_ROLE_KEY"]),
  ].filter(Boolean);
  if (keyRefs.some((ref) => ref !== expectedProductionSupabaseRef)) {
    throw new Error(
      "Production Vercel build blocked: Supabase credentials belong to a different project.",
    );
  }
}

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), ...(vercelDeployment ? [nitro()] : []), viteReact()],
  build: {
    // Anti-RE: minificação agressiva + remoção de artefatos de debug
    minify: "esbuild",
    cssMinify: "esbuild",
    rollupOptions: {
      output: {
        // Hash nos filenames para dificultar mapeamento entre versões
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/"))
            return "vendor-react";
          if (id.includes("node_modules/@tanstack/")) return "vendor-tanstack";
          return undefined;
        },
      },
    },
  },
  esbuild: {
    // Remove console/debugger em produção para reduzir superfície de análise
    ...(vercelProduction ? { drop: ["console", "debugger"] as const } : {}),
    legalComments: "none",
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  } as Record<string, unknown>,
});
