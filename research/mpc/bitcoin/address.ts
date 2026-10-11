// Prints the P2WPKH address (tb1q...) of the research wallet and exits.
// Creates the wallet with a 3-party key generation when there is none yet.
// Run: npm run btc:address
import { NETWORK_NAME, loadOrCreateWallet } from "./lib.ts";

const { wallet, created } = await loadOrCreateWallet();
if (created) console.log("No wallet yet: ran a 3-party DKLs23 key generation (shares saved under bitcoin/.local, git-ignored).");
console.log(`Network:    ${NETWORK_NAME} (native SegWit, P2WPKH)`);
console.log(`Public key: ${Buffer.from(wallet.publicKey).toString("hex")}`);
console.log(`Address:    ${wallet.address}`);
process.exit(0);
