// npm run check-live: is the live setup (Safe 2-of-3 on Base Sepolia) ready? Reads each project's .env.local (and the process
// environment, which wins) and prints only names and OK/FAIL, never a value. Exit code 1 if anything FAILs.
// Usage: npm run check-live            all three projects
//        npm run check-live -- sq-mock only one project (app | lawyer | sq-mock)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

type Project = {
  id: "app" | "lawyer" | "sq-mock";
  dir: string;
  required: string[];
  supabaseUrl: string;
  supabaseKey: string;
  /** table(optional column) pairs: the column proves that 002_safe_live.sql was run. */
  tables: [string, string][];
  sqlFile: string;
};

const ROOT = process.cwd();
const projects: Project[] = [
  {
    id: "app", dir: ROOT, supabaseUrl: "SUPABASE_URL", supabaseKey: "SUPABASE_SERVICE_ROLE_KEY", sqlFile: "sql/002_safe_live.sql",
    required: ["NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_EXPLORER_URL", "NEXT_PUBLIC_SQKEYS_MODE", "NEXT_PUBLIC_LAWYER_MODE", "NEXT_PUBLIC_LAWYER_URL", "RPC_URL", "USDC_ADDRESS",
      "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "LAWYER_URL", "SQ_URL", "APP_TO_LAWYER_SECRET", "APP_TO_SQ_SECRET"],
    tables: [["accounts", "p1_address"], ["devices", "owner_address"], ["tx_requests", "safe_tx_hash"], ["recoveries", "swap_tx_hash"], ["invitations", "token_hash"]],
  },
  {
    id: "lawyer", dir: join(ROOT, "lawyer"), supabaseUrl: "SUPABASE_URL", supabaseKey: "SUPABASE_SERVICE_ROLE_KEY", sqlFile: "lawyer/sql/002_safe_live.sql",
    required: ["NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_LAWYER_MODE", "LAWYER_ORIGIN", "APP_URL", "RPC_URL", "USDC_ADDRESS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
      "SESSION_SECRET", "LAWYER_SHARE_ENC_KEY", "LAWYER_SHARE_ENC_KEY_VERSION", "APP_TO_LAWYER_SECRET"],
    tables: [["lawyers", "webauthn_user_id"], ["clients", "sq_ref"], ["approval_requests", "safe_tx_hash"], ["policy_versions", "version"], ["shares", "keyshare_enc"], ["audit_log", "entry_hash"]],
  },
  {
    id: "sq-mock", dir: join(ROOT, "sq-mock"), supabaseUrl: "SQ_SUPABASE_URL", supabaseKey: "SQ_SUPABASE_SERVICE_ROLE_KEY", sqlFile: "sq-mock/sql/002_safe_live.sql",
    required: ["SQ_SUPABASE_URL", "SQ_SUPABASE_SERVICE_ROLE_KEY", "APP_TO_SQ_SECRET", "SQ_SHARE_ENC_KEY", "SQ_SHARE_ENC_KEY_VERSION", "SQ_GAS_PRIVATE_KEY",
      "SQ_DEMO_WALLET_PRIVATE_KEY", "RPC_URL", "CHAIN_ID", "USDC_ADDRESS", "RECOVERY_DELAY_SECONDS", "CONSOLE_PASSWORD", "SQ_URL", "SQ_DEMO_PASSWORD", "SQ_DEMO_BANKING_ANSWER"],
    tables: [["clients", "sq_ref"], ["safe_accounts", "safe_address"], ["sponsor_actions", "tx_hash"], ["operator_actions", "action"], ["identity_checks", "safe_tx_hash"], ["shares", "keyshare_enc"]],
  },
];

// Safe v1.4.1 canonical deployments and USDC. Must have code on 84532.
const CONTRACTS: [string, Address][] = [
  ["Safe proxy factory", "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67"],
  ["Safe singleton L2", "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762"],
  ["Safe fallback handler", "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"],
];

let failures = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const warn = (m: string) => console.log(`  WARN  ${m}`);
const fail = (m: string) => { failures++; console.log(`  FAIL  ${m}`); };

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].replace(/\s+#.*$/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const envOf = (p: Project): Record<string, string> => {
  const merged = { ...parseEnvFile(join(p.dir, ".env.local")) };
  return merged;
};
const digest = (s: string | undefined) => (s ? createHash("sha256").update(s).digest("hex") : null);

async function checkSupabase(p: Project, env: Record<string, string>) {
  const url = env[p.supabaseUrl];
  const key = env[p.supabaseKey];
  if (!url || !key) return fail(`Supabase: ${p.supabaseUrl} / ${p.supabaseKey} missing, tables not checked`);
  for (const [table, column] of p.tables) {
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${table}?select=${column}&limit=0`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) ok(`table ${table}.${column} reachable`);
      else if (res.status === 401 || res.status === 403) fail(`table ${table}: access denied (is ${p.supabaseKey} the service role key?)`);
      else fail(`table ${table}.${column} not found (HTTP ${res.status}): run sql/001_init.sql then ${p.sqlFile}`);
    } catch {
      fail(`table ${table}: Supabase unreachable (check ${p.supabaseUrl})`);
      return;
    }
  }
}

async function main() {
  const only = process.argv[2] as Project["id"] | undefined;
  const selected = projects.filter((p) => !only || p.id === only);
  const envs = new Map<string, Record<string, string>>();

  for (const p of selected) {
    console.log(`\n[${p.id}]`);
    const env = envOf(p);
    envs.set(p.id, env);
    const file = existsSync(join(p.dir, ".env.local")) ? ".env.local found" : ".env.local missing (checking the process environment only)";
    console.log(`  ${file}`);
    const missing = p.required.filter((n) => !(process.env[n] || env[n]));
    for (const n of p.required) if (!missing.includes(n)) ok(`${n} is set`);
    for (const n of missing) fail(`${n} is missing`);
    for (const n of Object.keys(env)) if (n.startsWith("NEXT_PUBLIC_") && /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD/.test(n)) fail(`${n} is a secret exposed through NEXT_PUBLIC_`);
    if (p.id !== "sq-mock") {
      const mode = env[p.id === "app" ? "NEXT_PUBLIC_SQKEYS_MODE" : "NEXT_PUBLIC_LAWYER_MODE"];
      if (mode === "live") ok(`${p.id === "app" ? "NEXT_PUBLIC_SQKEYS_MODE" : "NEXT_PUBLIC_LAWYER_MODE"} = live`);
      else warn(`${p.id === "app" ? "NEXT_PUBLIC_SQKEYS_MODE" : "NEXT_PUBLIC_LAWYER_MODE"} is not "live" (fine for local mock work; production must be live)`);
    }
    await checkSupabase(p, env);
  }

  // Pair secrets must be identical on both sides (compared by SHA-256, never printed).
  if (envs.size > 1) {
    console.log("\n[pair secrets]");
    const pair = (name: string, a: Project["id"], b: Project["id"]) => {
      const x = digest(envs.get(a)?.[name]);
      const y = digest(envs.get(b)?.[name]);
      if (!x || !y) return warn(`${name}: set on only one side`);
      x === y ? ok(`${name} identical in ${a} and ${b}`) : fail(`${name} differs between ${a} and ${b}`);
    };
    pair("APP_TO_SQ_SECRET", "app", "sq-mock");
    pair("APP_TO_LAWYER_SECRET", "app", "lawyer");
  }

  console.log("\n[chain]");
  const sq = envs.get("sq-mock") ?? envOf(projects[2]);
  const rpc = sq.RPC_URL || process.env.RPC_URL || "https://sepolia.base.org";
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  try {
    const id = await pub.getChainId();
    id === 84532 ? ok(`RPC answers on chain 84532 (host ${new URL(rpc).host})`) : fail(`RPC answers on chain ${id}, expected 84532`);
    const usdc = (sq.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as Address;
    for (const [name, address] of [...CONTRACTS, ["USDC", usdc] as [string, Address]]) {
      const code = await pub.getCode({ address });
      code && code !== "0x" ? ok(`${name} ${address} has code`) : fail(`${name} ${address} has NO code on Base Sepolia`);
    }
    const minWei = BigInt(sq.SPONSOR_MIN_BALANCE_WEI || "5000000000000000");
    const key = (n: string) => (/^0x[0-9a-fA-F]{64}$/.test(sq[n] ?? "") ? (sq[n] as Hex) : null);
    const gas = key("SQ_GAS_PRIVATE_KEY");
    if (!gas) fail("SQ_GAS_PRIVATE_KEY is missing or not a 32-byte hex key");
    else {
      const a = privateKeyToAccount(gas).address;
      const bal = await pub.getBalance({ address: a });
      bal >= minWei ? ok(`sponsor ${a} holds ${formatEther(bal)} ETH (minimum ${formatEther(minWei)})`) : fail(`sponsor ${a} holds ${formatEther(bal)} ETH, below the minimum ${formatEther(minWei)}: top it up`);
    }
    const demo = key("SQ_DEMO_WALLET_PRIVATE_KEY");
    if (!demo) fail("SQ_DEMO_WALLET_PRIVATE_KEY is missing or not a 32-byte hex key");
    else {
      const a = privateKeyToAccount(demo).address;
      const [eth, usdcBal] = await Promise.all([pub.getBalance({ address: a }), pub.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [a] })]);
      eth > 0n ? ok(`demo wallet ${a} holds ${formatEther(eth)} ETH (pays its own transfer gas)`) : fail(`demo wallet ${a} holds no ETH`);
      usdcBal > 0n ? ok(`demo wallet holds ${formatUnits(usdcBal, 6)} USDC`) : fail(`demo wallet ${a} holds no USDC (https://faucet.circle.com)`);
    }
  } catch (e) {
    fail(`chain check failed: ${e instanceof Error ? e.message.split("\n")[0] : "unknown error"}`);
  }

  console.log(failures ? `\nNOT READY: ${failures} check(s) failed.` : "\nREADY: every check passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("check-live crashed:", e instanceof Error ? e.message.split("\n")[0] : "unknown error");
  process.exit(1);
});
