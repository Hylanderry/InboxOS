import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const OUT_DIR = resolve("tests/e2e-artifacts/functional-audit-2026-10-13");
mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["Login", "/auth/login"],
  ["Cadastro", "/auth/register"],
  ["Recuperação", "/auth/forgot-password"],
  ["Termos", "/legal/terms"],
  ["Privacidade", "/legal/privacy"],
  ["Cookies", "/legal/cookies"],
  ["Uso aceitável", "/legal/acceptable-use"],
  ["Pagamentos", "/legal/payments"],
];

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function visibleSurface(page) {
  return page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        label: el.getAttribute("aria-label"),
      })),
    inputs: [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        type: el.getAttribute("type"),
        placeholder: el.getAttribute("placeholder"),
        label: el.getAttribute("aria-label"),
        name: el.getAttribute("name"),
      })),
    scroll: {
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      height: document.documentElement.scrollHeight,
    },
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  for (const [label, path] of targets) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const network = [];
    const consoleLogs = [];
    const pageErrors = [];
    page.on("console", (message) =>
      consoleLogs.push({ type: message.type(), text: message.text() }),
    );
    page.on("pageerror", (error) =>
      pageErrors.push({ message: error.message, stack: error.stack }),
    );
    page.on("requestfailed", (request) =>
      network.push({
        url: new URL(request.url()).pathname,
        method: request.method(),
        status: 0,
        error: request.failure()?.errorText || "requestfailed",
      }),
    );
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))
        network.push({
          url: url.pathname,
          method: response.request().method(),
          status: response.status(),
        });
    });
    await page.route("**/api/**", (route) =>
      route.fulfill(json({ success: true, documents: [], profile: null })),
    );
    await page.route("**/auth/v1/**", (route) => route.fulfill(json({ user: null })));
    await page.addInitScript(() => localStorage.setItem("inboxos:theme", "light"));
    let status = "PASS";
    let error = null;
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);
      const actions = [];
      if (label === "Login") {
        const toggle = page.getByRole("button", { name: /modo escuro|tema escuro|tema/i }).first();
        if ((await toggle.count()) && (await toggle.isVisible())) await toggle.click();
        const eye = page.getByRole("button", { name: /senha|visualizar|mostrar/i }).first();
        if ((await eye.count()) && (await eye.isVisible())) await eye.click();
        const remember = page.locator("#remember-device");
        if ((await remember.count()) && (await remember.isVisible())) {
          await remember.check();
          if (!(await remember.isChecked())) {
            throw new Error("Lembrar de mim nÃ£o permaneceu selecionÃ¡vel.");
          }
          actions.push("marcar lembrar de mim");
        }
      }
      if (label === "Cadastro") {
        const eye = page.getByRole("button", { name: /senha|visualizar|mostrar/i }).first();
        if ((await eye.count()) && (await eye.isVisible())) await eye.click();
        const legalRow = page.locator(".auth-legal-row");
        if ((await legalRow.count()) && (await legalRow.isVisible())) {
          await legalRow.click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor({ state: "visible" });
          await dialog.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          actions.push("abrir e fechar termos pelo aceite");
        }
      }
      const surface = await visibleSurface(page);
      if (surface.scroll.width > surface.scroll.viewport + 1) status = "WARN";
      await page.screenshot({
        path: join(OUT_DIR, `public-${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`),
        fullPage: false,
      });
      pages.push({
        label,
        path,
        status,
        actions,
        surface,
        network,
        console: consoleLogs,
        pageErrors,
      });
    } catch (caught) {
      status = "FAIL";
      error = String(caught);
      pages.push({
        label,
        path,
        status,
        error,
        surface: await visibleSurface(page).catch(() => null),
        network,
        console: consoleLogs,
        pageErrors,
      });
    }
    await context.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    isolation: "Playwright em contexto novo por rota; APIs locais mockadas; sem escrita externa.",
    pages,
    summary: {
      pagesPassed: pages.filter((page) => page.status === "PASS").length,
      pagesWarned: pages.filter((page) => page.status === "WARN").length,
      pagesFailed: pages.filter((page) => page.status === "FAIL").length,
      httpErrors: pages.flatMap((page) => page.network).filter((entry) => entry.status >= 400)
        .length,
      consoleErrors: pages.flatMap((page) => page.console).filter((entry) => entry.type === "error")
        .length,
      pageErrors: pages.flatMap((page) => page.pageErrors).length,
    },
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(OUT_DIR, "public-audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  await browser.close();
}

await main();
