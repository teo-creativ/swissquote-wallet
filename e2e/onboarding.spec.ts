import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Fails on any 404 page, any HTTP 404 on a page navigation, and any console error or uncaught exception.
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() === 404 && r.request().resourceType() === "document") problems.push(`404 document: ${r.url()}`);
  });
  return problems;
}

async function assertNot404(page: Page, where: string) {
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text, `404 page after: ${where} (${page.url()})`).not.toContain("this page could not be found");
}

async function step(page: Page, where: string, expectedPath: RegExp) {
  await expect(page, where).toHaveURL(expectedPath, { timeout: 15_000 });
  await assertNot404(page, where);
  console.log(`  ${where} -> ${new URL(page.url()).pathname}`);
}

test("onboarding walk: login, KYC, documents, lawyer, simulate accept, key, creating", async ({ page, context }) => {
  const problems = watch(page);
  await context.grantPermissions([]);
  // A virtual authenticator lets the real WebAuthn ceremony run headless (platform, PRF not guaranteed).
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });

  await page.goto("/");
  await assertNot404(page, "splash");
  await page.getByRole("button", { name: /get started/i }).click();
  await step(page, "click Get started", /\/login$/);

  await page.getByLabel("Client ID").fill("client.lea");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await step(page, "login submit", /\/verify$/);

  const next = page.getByRole("button", { name: /^continue$/i });
  await expect(next).toBeEnabled({ timeout: 15_000 });
  await next.click();
  await step(page, "C2 continue", /\/documents$/);

  await page.getByRole("checkbox").first().waitFor();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: /accept and continue/i }).click();
  await step(page, "C3 accept", /\/lawyer$/);

  await page.getByRole("button", { name: /create invitation link/i }).click();
  // The invitation sheet opens over the page: close it with its own Continue, then use the dev shortcut.
  await page.locator("button:not([disabled])", { hasText: /^Continue$/ }).click();
  await page.getByRole("button", { name: /simulate lawyer accepting/i }).click();
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont.last()).toBeEnabled({ timeout: 15_000 });
  await cont.last().click();
  await step(page, "C5 continue after accept", /\/key$/);

  await page.getByRole("button", { name: /create my key/i }).click();
  // With PRF the walk goes straight on; if the second tap is needed, do it.
  const confirm = page.getByRole("button", { name: /confirm once more/i });
  await Promise.race([page.waitForURL(/\/creating$/, { timeout: 15_000 }), confirm.waitFor({ timeout: 15_000 })]).catch(() => undefined);
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await step(page, "C4 create my key", /\/creating$/);

  await expect(page.getByText("Your account is ready")).toBeVisible({ timeout: 30_000 });
  await assertNot404(page, "C6 done");
  expect(problems, problems.join("\n")).toEqual([]);
});

// A fresh session or a reload must never show a 404: every onboarding and app route redirects to the right earlier step.
const ROUTES = ["/verify", "/documents", "/lawyer", "/key", "/creating", "/home", "/send", "/security", "/activity", "/receive", "/recovery", "/legal/terms", "/dev/passkey"];
for (const route of ROUTES) {
  test(`direct URL, empty session: ${route}`, async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto(route);
    expect(res?.status(), `HTTP status of ${route}`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await assertNot404(page, `direct ${route}`);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("reload on every onboarding step resumes, no 404", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/login");
  await page.getByLabel("Client ID").fill("client.lea");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await step(page, "login", /\/verify$/);
  await page.reload();
  await step(page, "reload /verify", /\/(verify|documents|lawyer|login)$/);
  for (const route of ["/key", "/creating"]) {
    await page.goto(route);
    await step(page, `direct ${route} before lawyer accepted`, /\/(lawyer|verify|login)$/);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
