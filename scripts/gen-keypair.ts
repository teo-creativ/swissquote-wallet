// Generates an EVM keypair and writes the PRIVATE KEY into .env.local under --name, printing only the PUBLIC address.
// Usage: npm run gen-keypair -- --name SQ_GAS_PRIVATE_KEY   (run it in the project folder that owns the key)
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const name = process.argv[process.argv.indexOf("--name") + 1];
if (!name || name.startsWith("--")) { console.error("Missing --name VAR_NAME"); process.exit(1); }
const file = ".env.local";
if (existsSync(file) && new RegExp(`^${name}=.+`, "m").test(readFileSync(file, "utf8"))) { console.error(`${name} already set. Refusing to overwrite.`); process.exit(1); }
const pk = generatePrivateKey();
appendFileSync(file, `${name}=${pk}\n`);
console.log(`${name} written to ${file} (value hidden). Public address to fund on Base Sepolia: ${privateKeyToAccount(pk).address}`);
