// Real-browser smoke of the lawyer portal in live mode (in-memory store, no Supabase, no chain): invitation -> passkey account ->
// session -> sign out -> sign in with the passkey -> policy change confirmed by a passkey assertion. Uses Chrome and a CDP virtual
// authenticator (user verification on). Secrets are random per run and never printed.
// Run: node scripts/smoke-lawyer-browser.mjs
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const PORT = 3101;
const ORIGIN = `http://localhost:${PORT}`;
const env = {
  ...process.env,
  PORT: String(PORT),
  LAWYER_ORIGIN: ORIGIN,
  NEXT_PUBLIC_LAWYER_MODE: "live",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  LAWYER_SHARE_ENC_KEY: randomBytes(32).toString("hex"),
  LAWYER_SHARE_ENC_KEY_VERSION: "1",
  APP_TO_LAWYER_SECRET: randomBytes(32).toString("hex"),
  APP_URL: "http://localhost:3999",
};

function hmacHeaders(method, path, body) {
  const ts = new Date().toISOString();
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  const sig = createHmac("sha256", env.APP_TO_LAWYER_SECRET).update([method, path, ts, nonce, bodyHash].join("\n"), "utf8").digest("hex");
  return { "x-sq-ts": ts, "x-sq-nonce": nonce, "x-sq-sig": sig };
}

if (await fetch(`${ORIGIN}/login`).then(() => true, () => false)) throw new Error(`port ${PORT} is already in use`);
const server = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], { cwd: "lawyer", env, shell: true, stdio: "ignore" });
const stop = () => { try { process.platform === "win32" ? spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" }) : server.kill(); } catch {} };
process.on("exit", stop);

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${ORIGIN}/login`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("portal did not start");
}

const step = (s) => console.log(`\n== ${s}`);
const failures = [];
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

async function main() {
  await waitUp();
  const token = randomBytes(24).toString("base64url");
  const sqRef = crypto.randomUUID();
  const body = JSON.stringify({ sqRef, tokenHash: createHash("sha256").update(token).digest("hex"), displayName: "Léa Martin" });
  const reg = await fetch(`${ORIGIN}/api/invite/register`, { method: "POST", body, headers: { "content-type": "application/json", ...hmacHeaders("POST", "/api/invite/register", body) } });
  check("client app announces the invitation (HMAC)", reg.ok, String(reg.status));

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("response", (r) => { if (r.status() === 404 || r.status() === 401) console.log("  (" + r.status() + ": " + r.url().replace(ORIGIN, "") + ")"); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|401 (Unauthorized)/.test(m.text())) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  step("Invitation page");
  await page.goto(`${ORIGIN}/invite/${token}`);
  await page.getByText("Invited by", { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
  check("the invitation is shown", (await page.getByText("Léa Martin").count()) > 0);
  await page.getByRole("button", { name: "Continue" }).click();

  step("Create account and passkey");
  await page.getByLabel("Your name").fill("Maître Dupont");
  await page.getByLabel("Firm").fill("Étude Dupont");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create passkey and accept" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30000 });
  check("signed in after creating the account", (await page.request.get(`${ORIGIN}/api/portal/me`)).ok);
  const me = await (await page.request.get(`${ORIGIN}/api/portal/me`)).json();
  check("the portal knows the lawyer and the client", me.displayName === "Maître Dupont" && me.clients === 1, JSON.stringify(me));
  check("no 'Simulated lawyer' strip in live mode", (await page.getByText("Simulated lawyer").count()) === 0);
  const again = await page.request.post(`${ORIGIN}/api/invite/inspect`, { data: { token }, headers: { origin: ORIGIN } });
  check("the invitation cannot be used twice", (await again.json()).valid === false);

  step("Sign out, sign in with the passkey");
  await page.request.post(`${ORIGIN}/api/webauthn/logout`, { data: {}, headers: { origin: ORIGIN } });
  check("no session after sign out", (await page.request.get(`${ORIGIN}/api/portal/me`)).status() === 401);
  await page.goto(`${ORIGIN}/login`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  check("signed in with the passkey", (await page.request.get(`${ORIGIN}/api/portal/me`)).ok);

  step("Policy change confirmed by a passkey assertion");
  const clients = await (await page.request.get(`${ORIGIN}/api/portal/clients`)).json();
  const clientId = clients[0].id;
  const policy = await (await page.request.get(`${ORIGIN}/api/portal/policy?clientId=${clientId}`)).json();
  check("default policy", policy.perTxCap === "5.00" && policy.dailyCap === "10.00" && policy.version === 1, JSON.stringify(policy));
  await page.goto(`${ORIGIN}/clients/${clientId}/policy`);
  const perTx = page.getByLabel("Per transfer");
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "5.00"), null, { timeout: 30000 });
  await perTx.fill("8");
  await page.getByRole("button", { name: "Review and save" }).click();
  await page.getByRole("button", { name: "Save with passkey" }).click();
  let after = policy;
  for (let i = 0; i < 40 && after.version !== 2; i++) {
    await page.waitForTimeout(1000); // first calls compile the routes in dev mode
    after = await (await page.request.get(`${ORIGIN}/api/portal/policy?clientId=${clientId}`)).json();
  }
  check("policy v2 saved with the new per-transfer limit", after.version === 2 && after.perTxCap === "8.00", JSON.stringify(after));
  const journal = await (await page.request.get(`${ORIGIN}/api/portal/journal`)).json();
  check("journal has LOGIN and POLICY_CHANGED, chain intact", journal.entries.some((e) => e.type === "POLICY_CHANGED") && journal.entries.some((e) => e.type === "LOGIN") && journal.integrity.ok);

  check("no console or page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
}

main()
  .catch((e) => { console.error("SMOKE CRASHED:", e instanceof Error ? e.message : e); failures.push("crash"); })
  .finally(() => {
    stop();
    console.log(failures.length ? `\nFAILED: ${failures.join(", ")}` : "\nLAWYER BROWSER SMOKE OK");
    process.exit(failures.length ? 1 : 0);
  });
