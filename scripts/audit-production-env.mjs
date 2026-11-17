#!/usr/bin/env node
/** Validates deployment runtime configuration, prints names only (never values). */
import { validateProductionEnvironment } from "./lib/release-validation.mjs";

const errors = validateProductionEnvironment(process.env);
if (errors.length) {
  for (const line of errors) console.error(`FAIL ${line}`);
  console.error(
    `Production ENV gate: ${errors.length} problema(s); nenhuma credencial foi exibida.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    "PASS Production ENV gate: configuração estrutural válida; serviços reais ainda exigem smoke tests.",
  );
}
