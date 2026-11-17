/**
 * Fail-closed release gate for the Vercel deployment workflow.
 * A successful Vite compile is insufficient to promote untested code.
 * `--plan` prints command names only; it never reads or prints secrets.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const executable = process.platform === "win32" ? "npm.cmd" : "npm";
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

export function deploymentGateSteps(environment = "") {
  const steps = [
    { label: "unit-and-regression", command: executable, args: ["test"] },
    { label: "release-preflight", command: executable, args: ["run", "audit:release"] },
    { label: "eslint", command: executable, args: ["run", "lint"] },
    { label: "typescript", command: npxExecutable, args: ["--no-install", "tsc", "--noEmit"] },
  ];
  if (environment === "production") {
    steps.push({
      label: "production-environment",
      command: executable,
      args: ["run", "audit:env"],
    });
  }
  steps.push({ label: "vite-vercel-build", command: executable, args: ["run", "build"] });
  return steps;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const environment = process.env.VERCEL_ENV ?? "";
  const steps = deploymentGateSteps(environment);
  if (process.argv.includes("--plan")) {
    for (const item of steps) console.log(item.label);
  } else {
    for (const step of steps) {
      console.log(`[inboxos-release] ${step.label}`);
      const result = spawnSync(step.command, step.args, {
        cwd: resolve(import.meta.dirname, ".."),
        stdio: "inherit",
        env: process.env,
        shell: process.platform === "win32",
      });
      if (result.error || result.status !== 0) {
        console.error(`[inboxos-release] FAILED ${step.label}`);
        process.exit(result.status || 1);
      }
    }
    console.log(
      "[inboxos-release] Local release gates passed; external staging checks still required.",
    );
  }
}
