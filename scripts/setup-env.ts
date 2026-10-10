// LOCAL-ONLY convenience: creates root, lawyer/ and sq-mock/ .env.local from .env.example and fills every empty
// generated secret. Never prints a value (CDC rule 2). Never overwrites a value that is already set.
// Pair secrets (APP_TO_LAWYER_SECRET, APP_TO_SQ_SECRET) are generated ONCE and written identically to both sides:
// this is fine on one dev machine; hand them to teammates / Vercel in person only, never by chat or e-mail.
// Supabase URL + secret key are NOT generated: paste them yourself in each project's .env.local.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const hex = () => randomBytes(32).toString("hex");
const b64 = () => randomBytes(32).toString("base64");
const pwd = () => randomBytes(12).toString("base64url");
const pairs = { APP_TO_LAWYER_SECRET: hex(), APP_TO_SQ_SECRET: hex() };

type Gen = () => string;
const targets: { dir: string; gen: Record<string, Gen> }[] = [
  { dir: ".", gen: { SESSION_SECRET: hex, APP_TO_LAWYER_SECRET: () => pairs.APP_TO_LAWYER_SECRET, APP_TO_SQ_SECRET: () => pairs.APP_TO_SQ_SECRET, CONSOLE_PASSWORD: pwd } },
  { dir: "lawyer", gen: { SESSION_SECRET: hex, LAWYER_SHARE_ENC_KEY: b64, APP_TO_LAWYER_SECRET: () => pairs.APP_TO_LAWYER_SECRET } },
  { dir: "sq-mock", gen: { APP_TO_SQ_SECRET: () => pairs.APP_TO_SQ_SECRET, SQ_SHARE_ENC_KEY: b64, CONSOLE_PASSWORD: pwd } },
];
const keys = ["SQ_GAS_PRIVATE_KEY", "SQ_DEMO_WALLET_PRIVATE_KEY"];

for (const { dir, gen } of targets) {
  const local = `${dir}/.env.local`;
  const example = `${dir}/.env.example`;
  if (!existsSync(example)) { console.log(`${dir}: no .env.example, skipped`); continue; }
  let text = existsSync(local) ? readFileSync(local, "utf8") : readFileSync(example, "utf8");
  const filled: string[] = [];
  const setIfEmpty = (name: string, value: string) => {
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = text.match(re);
    if (m && m[1].trim() !== "") return false;
    text = m ? text.replace(re, () => `${name}=${value}`) : text.replace(/\n?$/, `\n${name}=${value}\n`);
    filled.push(name);
    return true;
  };
  for (const [k, g] of Object.entries(gen)) setIfEmpty(k, g());
  const addresses: string[] = [];
  if (dir === "sq-mock")
    for (const k of keys) { const pk = generatePrivateKey(); if (setIfEmpty(k, pk)) addresses.push(`${k} -> ${privateKeyToAccount(pk).address}`); }
  writeFileSync(local, text);
  console.log(`${dir}/.env.local: ${existsSync(local) ? "ok" : "?"}; filled (values hidden): ${filled.length ? filled.join(", ") : "nothing"}`);
  for (const a of addresses) console.log(`  public address to fund: ${a}`);
}
console.log("\nStill to paste by hand: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (root, lawyer), SQ_SUPABASE_URL + SQ_SUPABASE_SERVICE_ROLE_KEY (sq-mock), SQ_URL if empty.");
