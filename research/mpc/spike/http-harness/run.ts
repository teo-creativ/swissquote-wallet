// HTTP harness runner: starts P2 (port 4002) and P3 (port 4003) as SEPARATE processes, then
// runs the client (P1 and orchestrator) in this one.
// Run from spike/: npx tsx http-harness/run.ts
// The HMAC secret comes from env HARNESS_HMAC_SECRET; if it is not set, a random one is
// generated for this run and passed to the children through their environment. Never printed.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runHarness } from "./client.ts";
import type { Target } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const secret = process.env.HARNESS_HMAC_SECRET || randomBytes(32).toString("hex");
const p2: Target = { name: "P2 lawyer", partyId: 1, url: "http://127.0.0.1:4002" };
const p3: Target = { name: "P3 Swissquote", partyId: 2, url: "http://127.0.0.1:4003" };

function start(t: Target): ChildProcess {
  const port = new URL(t.url).port;
  // Plain node with the tsx loader: a real separate process, no shell in between.
  return spawn(process.execPath, ["--import", "tsx", join(here, "node-server.ts"), String(t.partyId), port], { cwd: join(here, ".."), env: { ...process.env, HARNESS_HMAC_SECRET: secret }, stdio: ["ignore", "inherit", "inherit"] });
}

async function waitUntilUp(t: Target): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${t.url}/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${t.name} did not start`);
}

const children = [start(p2), start(p3)];
let ok = false;
try {
  await Promise.all([waitUntilUp(p2), waitUntilUp(p3)]);
  console.log(`P1 and orchestrator: pid ${process.pid}; P2: pid ${children[0].pid}; P3: pid ${children[1].pid}`);
  ok = await runHarness(secret, p2, p3);
} catch (err) {
  console.log(`FAIL  ${(err as Error).message}`);
} finally {
  for (const child of children) child.kill();
}
console.log(ok ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(ok ? 0 : 1);
