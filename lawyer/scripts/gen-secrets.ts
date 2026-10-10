// Writes missing secrets into .env.local WITHOUT printing them (CDC rule 2).
// Pair secrets (APP_TO_*) are generated only with --pairs; the other side receives them IN PERSON, never by chat.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

const LOCAL: Record<string, () => string> = {
  SESSION_SECRET: () => randomBytes(32).toString("hex"),
  LAWYER_SHARE_ENC_KEY: () => randomBytes(32).toString("base64"),
};
const PAIRS = ["APP_TO_LAWYER_SECRET"];
const file = ".env.local";
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const has = (k: string) => new RegExp(`^${k}=.+`, "m").test(current);
if (!existsSync(file)) writeFileSync(file, "");
const added: string[] = [];
for (const [k, gen] of Object.entries(LOCAL)) if (!has(k)) { appendFileSync(file, `${k}=${gen()}\n`); added.push(k); }
if (process.argv.includes("--pairs"))
  for (const k of PAIRS) if (!has(k)) { appendFileSync(file, `${k}=${randomBytes(32).toString("hex")}\n`); added.push(k); }
console.log(added.length ? `Wrote (values hidden): ${added.join(", ")}` : "Nothing to add.");
