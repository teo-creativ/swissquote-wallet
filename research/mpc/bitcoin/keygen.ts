// 3-party DKLs23 key generation for the Bitcoin testnet4 research wallet.
// Run: npm run btc:keygen            (refuses to replace an existing wallet)
//      npm run btc:keygen -- --force (replaces it: funds on the old address are lost)
// Shares go to bitcoin/.local (git-ignored) and are never printed.
import { NETWORK_NAME, generateWallet, parseArgs, saveWallet, walletExists } from "./lib.ts";

const args = parseArgs(process.argv.slice(2));
if (walletExists() && !args.force) {
  console.log("A wallet already exists in bitcoin/.local. Nothing was changed. Use --force to replace it.");
  process.exit(1);
}
const started = performance.now();
const wallet = await generateWallet();
saveWallet(wallet);
console.log(`3-party key generation done in ${((performance.now() - started) / 1000).toFixed(1)} s (threshold 2).`);
console.log(`Network: ${NETWORK_NAME}`);
console.log(`Address: ${wallet.address}`);
process.exit(0);
