import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vinxi/**",
      ".tanstack/**",
      "**/.vercel/**",
      "**/.tmp-vercel-preview-*/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Guardrail: supabaseAdmin ignora RLS. Código novo deve usar scopedAdmin(workspaceId).
    // Usos cross-tenant legítimos (ADM, webhooks) devem justificar com eslint-disable.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/integrations/supabase/client.server.ts"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Identifier[name='supabaseAdmin']",
          message:
            "inboxos/no-unscoped-admin: supabaseAdmin ignora RLS. Use scopedAdmin(workspaceId) ou justifique o uso cross-tenant.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
