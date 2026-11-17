#!/usr/bin/env node
/**
 * Starts an isolated local Vite server, runs the HTTP integration suite and
 * tears the server down. No external services or credentials are contacted.
 */
import { spawn, execFile } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const port = Number.parseInt(process.env.INBOXOS_INTEGRATION_PORT ?? "4182", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("INBOXOS_INTEGRATION_PORT must be an integer between 1024 and 65535");
  process.exit(2);
}

const viteEntry = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteEntry)) {
  console.error("Vite is not installed. Run npm install before local integration tests.");
  process.exit(2);
}

const server = spawn(
  process.execPath,
  [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: process.cwd(),
    env: { ...process.env, CI: "true" },
    stdio: "ignore",
    windowsHide: true,
  },
);

let stopped = false;
async function stopServer() {
  if (stopped || !server.pid) return;
  stopped = true;
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/pid", String(server.pid), "/t", "/f"]);
    } catch {
      // The process may already have exited; there is nothing left to clean up.
    }
  } else {
    server.kill("SIGTERM");
  }
}

async function waitForServer() {
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok || response.status >= 300) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`local server did not become ready at ${url}`);
}

try {
  await waitForServer();
  const result = await new Promise((resolve) => {
    const testProcess = spawn(
      process.execPath,
      ["--experimental-strip-types", "--test", "tests/integration.test.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_BASE_URL: `http://127.0.0.1:${port}`,
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    testProcess.on("close", (code, signal) => resolve({ code: code ?? 1, signal }));
    testProcess.on("error", () => resolve({ code: 1, signal: null }));
  });
  await stopServer();
  process.exitCode = result.code;
} catch (error) {
  console.error(error instanceof Error ? error.message : "local integration setup failed");
  await stopServer();
  process.exitCode = 1;
}
