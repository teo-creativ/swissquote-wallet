// npm run test:live: plays the CDC demo script END TO END against the three apps in live mode: client app, lawyer portal and Swissquote mock,
// with REAL passkey ceremonies (Chrome virtual authenticators with PRF), a real Safe 2-of-3 on Base Sepolia and real USDC.
// Context 1 = the client's phone (mobile viewport), context 2 = the lawyer's laptop, context 3 = an attacker's phone, context 4 = the new phone.
// It fails loudly on the first step that does not behave as live: any "Simulated" label other than the three allowed ones
// (Swissquote login, identity check, bank account), any mock artefact, any console error.
//
//   npm run test:live                     starts the three apps itself (dev servers on ports 3200, 3201, 3202, in-memory databases)
//   LIVE_CLIENT_URL=... LIVE_LAWYER_URL=... LIVE_SQ_URL=... CONSOLE_PASSWORD=... npm run test:live   plays against deployed apps instead
//
// Needs: sq-mock/.env.local with the funded sponsor and demo wallets (read by sq-mock itself, never by this script). Writes
// docs/LIVE_TEST_REPORT.md. Prints addresses, hashes and Basescan links only; secrets are random per run and never printed.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Address } from "viem";
import { baseSepolia } from "viem/chains";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const external = Boolean(process.env.LIVE_CLIENT_URL);
const CLIENT = process.env.LIVE_CLIENT_URL ?? "http://localhost:3200";
const LAWYER = process.env.LIVE_LAWYER_URL ?? "http://localhost:3201";
const SQ = process.env.LIVE_SQ_URL ?? "http://localhost:3202";
const hex = () => randomBytes(32).toString("hex");
const CONSOLE_PASSWORD = process.env.CONSOLE_PASSWORD ?? hex();
const DEMO_PASSWORD = process.env.LIVE_DEMO_PASSWORD ?? "demo1234";
const BANKING_ANSWER = process.env.LIVE_BANKING_ANSWER ?? "blue";
const RECOVERY_DELAY = process.env.RECOVERY_DELAY_SECONDS ?? "8";
const FUND_USDC = "9";
const RPC = process.env.LIVE_RPC_URL ?? "https://sepolia.base.org";

const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const safeAbi = parseAbi(["function getOwners() view returns (address[])"]);

// ---------------------------------------------------------------------------------------------------------------- report
type Row = { name: string; ok: boolean; seconds: number; note?: string };
const rows: Row[] = [];
const links: { label: string; url: string }[] = [];
const started = new Date();
let safeAddress = "";
const log = (s: string) => console.log(s);

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  log(`\n== ${name}`);
  try {
    const out = await fn();
    rows.push({ name, ok: true, seconds: Math.round((Date.now() - t0) / 100) / 10 });
    log(`   OK (${rows.at(-1)!.seconds}s)`);
    return out;
  } catch (e) {
    const note = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 300);
    rows.push({ name, ok: false, seconds: Math.round((Date.now() - t0) / 100) / 10, note });
    log(`   FAIL: ${note}`);
    throw e;
  }
}
const link = (label: string, url: string | null | undefined) => {
  if (!url) throw new Error(`missing Basescan link: ${label}`);
  if (!/^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-fA-F]{64}$/.test(url)) throw new Error(`not a real transaction link for ${label}: ${url}`);
  links.push({ label, url });
  log(`   ${label}: ${url}`);
};

function writeReport(ok: boolean, failure?: string) {
  const lines = [
    "# Live test report",
    "",
    `Run: ${started.toISOString()} (${external ? "deployed apps" : "local dev servers"}). Result: **${ok ? "PASSED" : "FAILED"}**.${failure ? ` First failure: ${failure}` : ""}`,
    "",
    "Custody model: Safe 2-of-3 smart account on Base Sepolia (not MPC). Real: passkeys, keys, Safe, USDC, gas sponsoring, lawyer approvals, recovery, console state.",
    "Simulated (labelled on screen): Swissquote login, identity check, bank account (CHF).",
    "",
    safeAddress ? `Wallet: ${safeAddress} (https://sepolia.basescan.org/address/${safeAddress})` : "",
    "",
    "| Step | Result | Seconds | Note |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.ok ? "OK" : "FAIL"} | ${r.seconds} | ${r.note ?? ""} |`),
    "",
    "## Transactions on Basescan",
    "",
    ...(links.length ? links.map((l) => `- ${l.label}: ${l.url}`) : ["- none"]),
    "",
    "Two virtual authenticators with PRF (Chrome, CDP) stand in for the phone and the laptop. Face ID on a real iPhone is tested by hand: see the final report.",
    "",
  ];
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/LIVE_TEST_REPORT.md", lines.join("\n"));
}

// ---------------------------------------------------------------------------------------------------------------- servers
const children: ChildProcess[] = [];
function start(cwd: string, port: number, env: Record<string, string>): void {
  const child = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd, env: { ...process.env, ...env, PORT: String(port) }, shell: true, stdio: "ignore" });
  children.push(child);
}
function stopAll() {
  for (const c of children) {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill();
    } catch { /* already gone */ }
  }
}
process.on("exit", stopAll);

async function waitUp(url: string, label: string) {
  for (let i = 0; i < 180; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not start`);
}

async function startApps() {
  for (const [port, label] of [[3200, "client"], [3201, "lawyer"], [3202, "sq-mock"]] as const) {
    if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) throw new Error(`port ${port} (${label}) is already in use: stop the dev server first`);
  }
  const pairSq = hex();
  const pairLawyer = hex();
  start("sq-mock", 3202, {
    SQ_SUPABASE_URL: "", SQ_SUPABASE_SERVICE_ROLE_KEY: "", APP_TO_SQ_SECRET: pairSq, SQ_DEMO_PASSWORD: DEMO_PASSWORD, SQ_DEMO_BANKING_ANSWER: BANKING_ANSWER,
    RECOVERY_DELAY_SECONDS: RECOVERY_DELAY, CONSOLE_PASSWORD, SQ_URL: SQ, BANK_MAX_TRANSFERS_PER_DAY: "20",
  });
  start("lawyer", 3201, {
    LAWYER_ORIGIN: LAWYER, APP_URL: CLIENT, NEXT_PUBLIC_LAWYER_MODE: "live", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", APP_TO_LAWYER_SECRET: pairLawyer, SESSION_SECRET: hex(),
    LAWYER_SHARE_ENC_KEY: hex(), LAWYER_SHARE_ENC_KEY_VERSION: "1", REQUEST_TTL_SECONDS: "900", LAWYER_DECISION_TTL_SECONDS: "900", AUTO_DECISION_TTL_SECONDS: "120", EXIT_DELAY_SECONDS: "10",
    NEXT_PUBLIC_LAWYER_DEMO_OPERATED: "false",
  });
  start(".", 3200, {
    NEXT_PUBLIC_SQKEYS_MODE: "live", NEXT_PUBLIC_LAWYER_MODE: "live", NEXT_PUBLIC_LAWYER_URL: LAWYER, SQ_URL: SQ, LAWYER_URL: LAWYER, APP_TO_SQ_SECRET: pairSq, APP_TO_LAWYER_SECRET: pairLawyer,
    SESSION_SECRET: hex(), SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", CONSOLE_PASSWORD, ALLOW_NO_PRF: "false", NEXT_DIST_DIR: ".next-live",
  });
  await Promise.all([waitUp(`${SQ}/api/health`, "sq-mock"), waitUp(`${LAWYER}/login`, "lawyer portal"), waitUp(`${CLIENT}/login`, "client app")]);
}

// ---------------------------------------------------------------------------------------------------------------- browser helpers
type Ctx = { context: BrowserContext; page: Page; problems: string[] };

async function newPhone(browser: Browser, name: string): Promise<Ctx> {
  const context = await browser.newContext({ baseURL: CLIENT, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return withAuthenticator(context, name);
}
async function newLaptop(browser: Browser): Promise<Ctx> {
  const context = await browser.newContext({ baseURL: LAWYER, viewport: { width: 1280, height: 900 } });
  return withAuthenticator(context, "lawyer");
}
async function withAuthenticator(context: BrowserContext, name: string): Promise<Ctx> {
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${name}: uncaught ${e.message}`));
  page.on("console", (m) => {
    // 4xx on API calls are expected in negative steps; everything else is a real error.
    if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push(`${name}: console error ${m.text()}`);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  return { context, page, problems };
}

/** Live means honest: only the Swissquote login, the identity checks and the bank account may say "Simulated". */
const ALLOWED_SIMULATED = [/^Simulated Swissquote login$/i, /^Simulated identity check$/i, /^Simulated$/i, /^You are verified \(simulated\)\.$/i];
async function assertHonest(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  const bad = text.split("\n").map((l) => l.trim()).filter((l) => /simulat/i.test(l) && !ALLOWED_SIMULATED.some((re) => re.test(l)));
  if (bad.length) throw new Error(`${where}: still simulated: "${bad[0]}"`);
  if (/this page could not be found/i.test(text)) throw new Error(`${where}: 404 page`);
}

const addressIn = (text: string) => text.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(what: string, read: () => Promise<T | null | undefined | false>, ms = 90_000, every = 2000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await read().catch(() => null);
    if (v) return v;
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function usdcOf(address: string): Promise<bigint> {
  return pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(address)] });
}
async function ownersOf(address: string): Promise<Address[]> {
  return [...(await pub.readContract({ address: getAddress(address), abi: safeAbi, functionName: "getOwners" }))];
}
const toBase = (v: string) => BigInt(Math.round(Number(v) * 1_000_000));

async function login(p: Page) {
  await p.goto("/login");
  await p.getByLabel("Client ID").fill("client.lea");
  await p.getByLabel("Password").fill(DEMO_PASSWORD);
  await p.getByRole("button", { name: /^sign in$/i }).click();
}

/** Types a transfer and taps through to the passkey. Resolves where the app went: the result page (instant) or the waiting page (lawyer). */
async function send(p: Page, to: string, amount: string): Promise<"instant" | "lawyer" | { error: string }> {
  await p.goto("/send");
  await p.getByLabel("Recipient address").fill(to);
  await p.getByLabel("Amount (USDC)").fill(amount);
  const next = p.getByRole("button", { name: /^continue$/i });
  await next.waitFor();
  await waitFor("send form ready", async () => (await next.isEnabled()) || null, 30_000, 500);
  await next.click();
  await p.waitForURL(/\/send\/review/);
  const confirm = p.getByRole("button", { name: /Confirm with|Ask my lawyer/ });
  await waitFor("review ready", async () => (await confirm.isEnabled()) || null, 30_000, 500);
  await confirm.click();
  const outcome = await Promise.race([
    p.waitForURL(/\/send\/result\//, { timeout: 120_000 }).then(() => "instant" as const),
    p.waitForURL(/\/send\/waiting\//, { timeout: 120_000 }).then(() => "lawyer" as const),
    p.getByText(/does not control the wallet|Something went wrong. Nothing was sent|Your wallet changed since|Finish or cancel your pending|did not match what you entered|passkey prompt was cancelled/i).first().waitFor({ timeout: 120_000 }).then(async () => ({ error: (await p.locator("body").innerText()).slice(0, 400) })),
  ]);
  return outcome;
}

async function explorerLink(p: Page): Promise<string | null> {
  const a = p.getByRole("link", { name: /explorer/i }).first();
  return (await a.getAttribute("href").catch(() => null)) ?? null;
}

/** The lawyer decides the newest pending request of a kind, with a real passkey assertion. */
async function lawyerDecides(lawyer: Page, kind: "transfer" | "recovery" | "exit", decision: "approve" | "decline", opts: { addRecipient?: boolean } = {}) {
  const id = await waitFor(`a pending ${kind} request`, async () => {
    const list = (await (await lawyer.request.get(`${LAWYER}/api/portal/requests?status=pending`)).json()) as { id: string; kind: string }[];
    return list.find((r) => r.kind === kind)?.id ?? null;
  }, 60_000, 1500);
  await lawyer.goto(`/requests/${id}`);
  if (opts.addRecipient) await lawyer.getByLabel(/Add this recipient to known recipients/).check();
  const name = kind === "transfer" ? (decision === "approve" ? /Approve with passkey/ : /Decline with passkey/) : decision === "approve" ? /^Approve$/ : /^Decline$/;
  await lawyer.getByRole("button", { name }).click();
  await waitFor("the decision to be recorded", async () => {
    const s = (await (await lawyer.request.get(`${LAWYER}/api/portal/request?id=${id}`)).json()) as { status: string };
    return s.status !== "pending" ? s.status : null;
  }, 60_000, 1000);
  return id;
}

const sqConsole = (path: string, body?: unknown) =>
  fetch(`${SQ}${path}`, { method: body ? "POST" : "GET", headers: { "x-console-password": CONSOLE_PASSWORD, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }).then((r) => r.json() as Promise<any>);

// ---------------------------------------------------------------------------------------------------------------- the demo script
async function main() {
  if (!external) await step("Start the three apps (client 3200, lawyer 3201, Swissquote mock 3202)", startApps);
  else await step("Reach the deployed apps", async () => { await Promise.all([waitUp(`${SQ}/api/health`, "sq-mock"), waitUp(`${LAWYER}/login`, "lawyer"), waitUp(`${CLIENT}/login`, "client")]); });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const phone = await newPhone(browser, "phone");
  const laptop = await newLaptop(browser);
  const recipient = getAddress(`0x${randomBytes(20).toString("hex")}`);
  const stranger = getAddress(`0x${randomBytes(20).toString("hex")}`);
  let recipientTotal = 0n;
  const extraPhones: [string, Ctx][] = [];

  try {
    // ------------------------------------------------------------------ create
    await step("1. Sign in with Swissquote (simulated login, labelled) and pass the identity check (simulated, labelled)", async () => {
      await login(phone.page);
      await phone.page.waitForURL(/\/verify$/);
      await assertHonest(phone.page, "verify");
      const next = phone.page.getByRole("button", { name: /^continue$/i });
      await waitFor("identity check to finish", async () => (await next.isEnabled()) || null, 60_000, 1000);
      await next.click();
      await phone.page.waitForURL(/\/documents$/);
    });

    await step("2. Accept the four documents", async () => {
      await phone.page.getByRole("checkbox").first().waitFor();
      for (const box of await phone.page.getByRole("checkbox").all()) await box.check();
      await phone.page.getByRole("button", { name: /accept and continue/i }).click();
      await phone.page.waitForURL(/\/lawyer$/);
    });

    const inviteUrl = await step("3. Invite the lawyer: a deployed-style https link built from NEXT_PUBLIC_LAWYER_URL, no localhost fallback", async () => {
      await phone.page.getByRole("button", { name: /create invitation link/i }).click();
      const field = phone.page.getByLabel("Invitation link");
      await field.waitFor();
      const url = await field.inputValue();
      if (!url.startsWith(`${LAWYER}/invite/`)) throw new Error(`invitation link does not use the lawyer portal URL: ${url.slice(0, 60)}`);
      if (!external && /localhost/.test(url) && process.env.NODE_ENV === "production") throw new Error("localhost link in production");
      await assertHonest(phone.page, "lawyer invite");
      if ((await phone.page.getByRole("button", { name: /simulate lawyer accepting/i }).count()) > 0) throw new Error("the mock shortcut 'Simulate lawyer accepting' is visible in live mode");
      return url;
    });

    await step("4. The lawyer opens the link on their laptop, creates an account and a passkey (real WebAuthn)", async () => {
      await laptop.page.goto(inviteUrl);
      await laptop.page.getByRole("button", { name: "Continue" }).click();
      await laptop.page.getByLabel("Your name").fill("Maître Dupont");
      await laptop.page.getByLabel("Firm").fill("Étude Dupont");
      await laptop.page.getByRole("checkbox").check();
      await laptop.page.getByRole("button", { name: "Create passkey and accept" }).click();
      await laptop.page.waitForURL((u) => !u.pathname.includes("/invite/"));
      await assertHonest(laptop.page, "lawyer portal");
    });

    await step("5. The client app notices the acceptance (polling)", async () => {
      // The sheet over the page is closed by its own Continue; the footer Continue becomes enabled once the lawyer accepted.
      const sheetContinue = phone.page.locator("button:not([disabled])", { hasText: /^Continue$/ });
      if (await sheetContinue.count()) await sheetContinue.first().click().catch(() => undefined);
      await waitFor("Your lawyer accepted.", async () => (await phone.page.getByText("Your lawyer accepted.").isVisible()) || null, 60_000, 1000);
      await phone.page.getByRole("button", { name: /^continue$/i }).last().click();
      await phone.page.waitForURL(/\/key$/);
    });

    const walletTx = await step("6. One tap: passkey, key P1 in the browser, P2 + P3 addresses, Safe deployed by the sponsor, three real share cards", async () => {
      await phone.page.getByRole("button", { name: /create my key/i }).click();
      const again = phone.page.getByRole("button", { name: /confirm once more/i });
      await Promise.race([phone.page.waitForURL(/\/creating$/, { timeout: 30_000 }), again.waitFor({ timeout: 30_000 })]).catch(() => undefined);
      if (await again.isVisible().catch(() => false)) await again.click();
      await phone.page.waitForURL(/\/creating$/);
      await phone.page.getByText("Your account is ready").waitFor({ timeout: 180_000 });
      const body = await phone.page.locator("body").innerText();
      safeAddress = getAddress(addressIn(body) ?? (() => { throw new Error("no wallet address shown"); })());
      await assertHonest(phone.page, "creating");
      const owners = await waitFor("the Safe on chain", async () => { const o = await ownersOf(safeAddress); return o.length === 3 ? o : null; }, 60_000);
      if (new Set(owners.map((o) => o.toLowerCase())).size !== 3) throw new Error("the three owners are not distinct");
      const tx = await phone.page.getByRole("link", { name: /Wallet creation transaction/ }).getAttribute("href", { timeout: 30_000 });
      return tx;
    });
    link("Safe 2-of-3 deployment (gas by the sponsor, owners hold no ETH)", walletTx);
    await step("6b. The owners hold no ETH (gas is sponsored)", async () => {
      for (const o of await ownersOf(safeAddress)) if ((await pub.getBalance({ address: o })) !== 0n) throw new Error(`owner ${o} holds ETH`);
    });

    // ------------------------------------------------------------------ fund
    await step("7. Fund the wallet from the Swissquote account: a real USDC transfer from the bank mock (account is simulated, labelled)", async () => {
      await phone.page.getByRole("button", { name: /discover your wallet/i }).click();
      await phone.page.goto("/from-swissquote");
      await waitFor("the CHF balance", async () => { const t = await phone.page.locator("body").innerText(); return /CHF [\d.']+/.test(t) || null; }, 30_000, 500);
      await phone.page.getByLabel("Amount (USDC)").fill(FUND_USDC);
      await phone.page.getByRole("button", { name: /^transfer$/i }).click();
      await phone.page.getByText(/added to your wallet/).waitFor({ timeout: 120_000 });
      link("Bank transfer to the wallet", await explorerLink(phone.page));
      await waitFor(`${FUND_USDC} USDC on chain`, async () => ((await usdcOf(safeAddress)) >= toBase(FUND_USDC) ? true : null), 90_000, 3000);
    });

    await step("7b. The receive screen shows the real address, the real balance and the faucet help", async () => {
      await phone.page.goto("/receive");
      await phone.page.getByText(safeAddress).first().waitFor();
      await waitFor("balance on the receive screen", async () => ((await phone.page.locator("body").innerText()).includes(`${FUND_USDC}.00 USDC`) ? true : null), 30_000, 1500);
      await assertHonest(phone.page, "receive");
      if (!(await phone.page.getByText(/faucet\.circle\.com/).count())) throw new Error("faucet instructions missing");
    });

    // ------------------------------------------------------------------ send
    await step("8. Send to a NEW recipient: needs the lawyer. The lawyer approves with a passkey and adds the recipient", async () => {
      const where = await send(phone.page, recipient, "1.00");
      if (where !== "lawyer") throw new Error(`expected the lawyer to be asked, got ${JSON.stringify(where)}`);
      await assertHonest(phone.page, "waiting");
      await lawyerDecides(laptop.page, "transfer", "approve", { addRecipient: true });
      await phone.page.waitForURL(/\/send\/result\//, { timeout: 120_000 });
      await phone.page.getByText("Sent. View on the explorer.").waitFor({ timeout: 120_000 });
      link("Send 1.00 USDC to a new recipient (lawyer approved)", await explorerLink(phone.page));
      recipientTotal += toBase("1.00");
    });

    await step("9. Send UNDER the threshold to the now-known recipient: instant (AUTO), no lawyer", async () => {
      const where = await send(phone.page, recipient, "1.00");
      if (where !== "instant") throw new Error(`expected an instant transfer, got ${JSON.stringify(where)}`);
      await phone.page.getByText("Sent. View on the explorer.").waitFor({ timeout: 120_000 });
      link("Send 1.00 USDC under the threshold (AUTO)", await explorerLink(phone.page));
      recipientTotal += toBase("1.00");
    });

    await step("10. Send OVER the threshold (5.50 > 5.00): the lawyer must approve", async () => {
      const where = await send(phone.page, recipient, "5.50");
      if (where !== "lawyer") throw new Error(`expected the lawyer to be asked, got ${JSON.stringify(where)}`);
      await lawyerDecides(laptop.page, "transfer", "approve");
      await phone.page.waitForURL(/\/send\/result\//, { timeout: 120_000 });
      await phone.page.getByText("Sent. View on the explorer.").waitFor({ timeout: 120_000 });
      link("Send 5.50 USDC over the threshold (lawyer approved)", await explorerLink(phone.page));
      recipientTotal += toBase("5.50");
    });

    await step("11. The lawyer DECLINES a transfer to another new recipient: nothing is sent", async () => {
      const where = await send(phone.page, stranger, "1.00");
      if (where !== "lawyer") throw new Error(`expected the lawyer to be asked, got ${JSON.stringify(where)}`);
      await lawyerDecides(laptop.page, "transfer", "decline");
      await phone.page.getByText("Your lawyer declined this transfer. Nothing was sent.").waitFor({ timeout: 120_000 });
      if ((await usdcOf(stranger)) !== 0n) throw new Error("the declined transfer moved funds");
    });

    await step("12. On-chain check: the recipient received exactly what was approved", async () => {
      await waitFor("recipient balance", async () => ((await usdcOf(recipient)) === recipientTotal ? true : null), 90_000, 3000);
    });

    // ------------------------------------------------------------------ attacker
    const owner0 = (await ownersOf(safeAddress))[0];
    await step("13. ATTACKER with the stolen phone and e-mail: the console is set to 'check fails', the recovery ends refused", async () => {
      await sqConsole("/api/console/identity-outcome", { clientId: "client.lea", outcome: "fail" });
      const attacker = await newPhone(browser, "attacker");
      try {
        await login(attacker.page);
        await attacker.page.waitForURL(/\/home$/);
        await attacker.page.goto("/recovery");
        await attacker.page.getByRole("button", { name: /start recovery/i }).click();
        await attacker.page.waitForURL(/\/recovery\/.+\/verify$/);
        await attacker.page.getByLabel("Answer to the banking question").fill(BANKING_ANSWER);
        await attacker.page.getByRole("button", { name: /^verify$/i }).click();
        await attacker.page.getByText("We could not verify your identity. Your lawyer was alerted.").first().waitFor({ timeout: 60_000 });
        await assertHonest(attacker.page, "attacker recovery");
        if (attacker.problems.length) log(`   (attacker context: ${attacker.problems.length} console notes)`);
      } finally {
        await attacker.context.close();
      }
      const o = (await ownersOf(safeAddress))[0];
      if (o !== owner0) throw new Error("the client key changed after a refused recovery");
      const recoveries = (await sqConsole("/api/console/recoveries")).recoveries as { outcome: string | null; p3SignedAt?: string | null }[];
      if (!recoveries.some((r) => r.outcome === "fail")) throw new Error("the console does not show the failed check");
      if (recoveries.some((r) => r.p3SignedAt)) throw new Error("Swissquote signed for an attacker");
    });

    await step("14. The real owner still controls the wallet after the attack", async () => {
      const where = await send(phone.page, recipient, "0.50");
      if (where !== "instant") throw new Error(`expected an instant transfer, got ${JSON.stringify(where)}`);
      await phone.page.getByText("Sent. View on the explorer.").waitFor({ timeout: 120_000 });
      link("Send 0.50 USDC after the refused attack", await explorerLink(phone.page));
      recipientTotal += toBase("0.50");
    });

    // ------------------------------------------------------------------ recovery
    await sqConsole("/api/console/identity-outcome", { clientId: "client.lea", outcome: "pass" });
    const newPhoneCtx = await newPhone(browser, "new phone");
    extraPhones.push(["new-phone", newPhoneCtx]);
    let recoveryTx: string | null = null;
    await step("15. RECOVERY on a new phone: identity check, new passkey and key, lawyer approval, delay, swapOwner (same address)", async () => {
      const p = newPhoneCtx.page;
      await login(p);
      await p.waitForURL(/\/home$/);
      await p.goto("/recovery");
      await p.getByRole("button", { name: /start recovery/i }).click();
      await p.waitForURL(/\/recovery\/.+\/verify$/);
      await p.getByLabel("Answer to the banking question").fill(BANKING_ANSWER);
      await p.getByRole("button", { name: /^verify$/i }).click();
      await p.getByText("You are verified (simulated).").first().waitFor({ timeout: 60_000 });
      await p.getByRole("button", { name: /create my new key|confirm once more/i }).click();
      const again = p.getByRole("button", { name: /confirm once more/i });
      await Promise.race([p.waitForURL(/\/recovery\/[0-9a-f-]+$/, { timeout: 30_000 }), again.waitFor({ timeout: 30_000 })]).catch(() => undefined);
      if (await again.isVisible().catch(() => false)) await again.click();
      await p.waitForURL(/\/recovery\/[0-9a-f-]+$/, { timeout: 60_000 });
      await assertHonest(p, "recovery");
      await lawyerDecides(laptop.page, "recovery", "approve");
      const proceed = p.getByRole("button", { name: /^continue$/i });
      await waitFor("the recovery to be ready (lawyer approved, delay over)", async () => ((await proceed.isEnabled()) ? true : null), 180_000, 2000);
      await proceed.click();
      await p.getByText("Your new key now controls your wallet").waitFor({ timeout: 180_000 });
      recoveryTx = await explorerLink(p);
    });
    link("Recovery: swapOwner signed by the lawyer (P2) and Swissquote (P3)", recoveryTx);

    await step("16. The old key lost control, the wallet address and funds are unchanged, the new key works", async () => {
      const owners = await waitFor("the new owner on chain", async () => { const o = await ownersOf(safeAddress); return o[0] !== owner0 ? o : null; }, 90_000, 3000);
      if (owners.length !== 3) throw new Error("the owner count changed");
      if (owners.some((o) => o === owner0)) throw new Error("the old key is still an owner");
      const old = await send(phone.page, recipient, "0.10");
      const refused = typeof old === "object" && "error" in old && /does not control the wallet/.test(old.error);
      if (!refused) throw new Error(`the old phone was not refused: ${JSON.stringify(old).slice(0, 200)}`);
      const fresh = await send(newPhoneCtx.page, recipient, "0.20");
      if (fresh !== "instant") throw new Error(`expected the new phone to send instantly, got ${JSON.stringify(fresh)}`);
      await newPhoneCtx.page.getByText("Sent. View on the explorer.").waitFor({ timeout: 120_000 });
      link("Send 0.20 USDC from the new phone", await explorerLink(newPhoneCtx.page));
      recipientTotal += toBase("0.20");
      await waitFor("recipient balance after recovery", async () => ((await usdcOf(recipient)) === recipientTotal ? true : null), 90_000, 3000);
    });

    await step("17. The console and the lawyer journal show the real state", async () => {
      const recs = (await sqConsole("/api/console/recoveries")).recoveries as { outcome: string | null; p3SignedAt?: string | null; usedAt?: string | null }[];
      if (!recs.some((r) => r.p3SignedAt && r.usedAt)) throw new Error("the console does not show the completed recovery");
      const safes = (await sqConsole("/api/console/safes")).safes as { safeAddress: string }[];
      if (!safes.some((s) => s.safeAddress.toLowerCase() === safeAddress.toLowerCase())) throw new Error("the console does not list the wallet");
      const journal = (await (await laptop.page.request.get(`${LAWYER}/api/portal/journal?limit=100`)).json()) as { entries: { type: string }[]; integrity: { ok: boolean } };
      const types = new Set(journal.entries.map((e) => e.type));
      for (const t of ["LAWYER_DECIDED", "RECOVERY_DECIDED"]) if (!types.has(t)) throw new Error(`journal lacks ${t}`);
      if (!journal.integrity.ok) throw new Error("the journal chain is broken");
      const audit = (await (await laptop.page.request.post(`${LAWYER}/api/portal/audit/verify`, { data: {}, headers: { origin: LAWYER } })).json()) as { ok: boolean };
      if (!audit.ok) throw new Error("audit verification failed");
    });

    await step("18. Nothing mock leaked into the live build", async () => {
      for (const c of [phone, newPhoneCtx]) {
        const stored = await c.page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("sqkeys.mock")));
        if (stored.length) throw new Error(`mock state found in sessionStorage: ${stored.join(", ")}`);
      }
      const problems = [...phone.problems, ...laptop.problems, ...newPhoneCtx.problems];
      if (problems.length) throw new Error(`${problems.length} browser problem(s): ${problems[0]}`);
    });

    writeReport(true);
    log("\nLIVE TEST PASSED");
  } catch (e) {
    for (const [name, c] of [["phone", phone], ["laptop", laptop], ...(extraPhones as [string, Ctx][])] as [string, Ctx][]) {
      mkdirSync("test-results/live-e2e", { recursive: true });
      await c.page.screenshot({ path: `test-results/live-e2e/${name}.png` }).catch(() => undefined);
      log(`   ${name} was on: ${c.page.url()}`);
    }
    writeReport(false, e instanceof Error ? e.message.split("\n")[0] : String(e));
    throw e;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nLIVE TEST FAILED:", e instanceof Error ? e.message.split("\n")[0] : e);
    process.exit(1);
  })
  .finally(stopAll);
