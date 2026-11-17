import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("=== TESTANDO LOGIN ===");
  for (const theme of ["dark", "light"]) {
    await context.clearCookies();
    await page.goto("http://localhost:3001/auth/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    if (theme === "light") {
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    } else {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    }

    const checkbox = page.locator("#remember-device");
    await checkbox.setChecked(true);
    await page.waitForTimeout(100);

    const checkedStyles = await page.locator(".auth-check-box").evaluate((el) => {
      const s = window.getComputedStyle(el);
      const svg = el.querySelector("svg");
      const svgStyles = svg ? window.getComputedStyle(svg) : null;
      return {
        backgroundColor: s.backgroundColor,
        borderColor: s.borderColor,
        color: s.color,
        svgDisplay: svgStyles?.display,
        svgColor: svgStyles?.color,
      };
    });
    console.log(`Login ${theme} checked styles:`, checkedStyles);

    await page.screenshot({
      path: `tests/e2e-artifacts/screenshots-interactive/login-${theme}-checked-v2.png`,
    });
  }

  console.log("\n=== TESTANDO CADASTRO / REGISTER ===");
  for (const theme of ["dark", "light"]) {
    await page.goto("http://localhost:3001/auth/register", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    if (theme === "light") {
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    } else {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    }

    // Inspect "País" label contrast
    const countryLabelStyles = await page.locator(".auth-country-field > span").evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        text: el.textContent,
        color: s.color,
        fontWeight: s.fontWeight,
      };
    });
    console.log(`Register ${theme} "País" label:`, countryLabelStyles);

    // Click on terms box to test auto-open of modal
    console.log(`Clicking terms checkbox in ${theme}...`);
    const legalRow = page.locator(".auth-legal-row");
    await legalRow.scrollIntoViewIfNeeded();
    await legalRow.click();
    await page.waitForTimeout(300);

    const modalBackdrop = page.locator(".legal-dialog-overlay");
    const modalVisible = await modalBackdrop.isVisible();
    console.log(`Modal auto-opened on checkbox click (${theme}):`, modalVisible);

    const backdropStyles = await modalBackdrop.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        backgroundColor: s.backgroundColor,
        backdropFilter: s.backdropFilter || s.webkitBackdropFilter,
      };
    });
    console.log(`Modal backdrop styles (${theme}):`, backdropStyles);

    await page.screenshot({
      path: `tests/e2e-artifacts/screenshots-interactive/register-${theme}-modal-auto-v2.png`,
    });

    // Read the document to the end, enable the consent checkbox and confirm.
    console.log("Lendo e aceitando os termos...");
    const legalContent = page.locator(".legal-dialog-content");
    await legalContent.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    await page.locator(".legal-dialog-native-check").check();
    await page.locator(".legal-dialog-btn-primary").click();
    await page.waitForTimeout(200);

    const isCheckedAfter = await page.locator("#legal-consent").isChecked();
    console.log(`Checkbox is checked after accepting modal (${theme}):`, isCheckedAfter);

    await page.screenshot({
      path: `tests/e2e-artifacts/screenshots-interactive/register-${theme}-checked-v2.png`,
    });
  }

  await browser.close();
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
}

main().catch(console.error);
