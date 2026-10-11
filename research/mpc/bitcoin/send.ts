// Spends one UTXO of the research wallet on Bitcoin testnet4, signed by two of the three parties.
// Run: npm run btc:send -- --txid <txid> --vout <n> --sats <amount of the UTXO in sats>
//        [--to tb1...]      recipient (default: the wallet address itself)
//        [--send <sats>]    amount for the recipient; the change returns to the wallet (default: everything minus the fee)
//        [--fee <sats>]     fixed fee (default 300 sats; there is no fee estimation)
//        [--pair 0,1]       which two parties sign the transaction that is output (default 0,1)
//        [--broadcast]      send it through mempool.space; without this flag nothing leaves the machine
// All three pairs sign and are verified locally; the raw transaction carries the signature of --pair.
import { DEFAULT_FEE_SATS, EXPLORER, MEMPOOL_API, NETWORK_NAME, PAIRS, buildSpend, checkRawTransaction, finalizeSpend, loadWallet, pairName, parseArgs, parsePair, signWithPair, toBitcoinSignature } from "./lib.ts";
import type { SpendRequest } from "./lib.ts";

// A network failure must say which host could not be reached, not just "fetch failed".
async function api(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${MEMPOOL_API}${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error(`could not reach ${new URL(MEMPOOL_API).host}: nothing was broadcast (check the connection, or set BTC_MEMPOOL_API)`);
  }
}

function sats(value: string | true | undefined, name: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new Error(`--${name} must be a whole number`);
  return BigInt(value);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.txid !== "string" || args.vout === undefined || args.sats === undefined) {
    throw new Error("usage: npm run btc:send -- --txid <txid> --vout <n> --sats <utxo amount> [--to tb1...] [--send <sats>] [--fee <sats>] [--pair 0,1] [--broadcast]");
  }
  const wallet = loadWallet();
  const pair = parsePair(args.pair);
  const req: SpendRequest = {
    publicKey: wallet.publicKey,
    utxo: { txid: args.txid.toLowerCase(), vout: Number(sats(args.vout, "vout")), amountSats: sats(args.sats, "sats") },
    to: typeof args.to === "string" ? args.to : wallet.address,
    feeSats: args.fee === undefined ? DEFAULT_FEE_SATS : sats(args.fee, "fee"),
    sendSats: args.send === undefined ? undefined : sats(args.send, "send"),
  };
  const spend = buildSpend(req);

  console.log(`${NETWORK_NAME}, wallet ${wallet.address}`);
  console.log(`Input:  ${req.utxo.txid}:${req.utxo.vout} (${req.utxo.amountSats} sats)`);
  for (const o of spend.outputs) console.log(`Output: ${o.amountSats} sats to ${o.address}`);
  console.log(`Fee:    ${req.feeSats} sats (fixed)`);

  // Every pair signs the same sighash; each signature is checked before anything is output.
  let chosen: ReturnType<typeof finalizeSpend> | null = null;
  for (const p of PAIRS) {
    const sig = toBitcoinSignature(await signWithPair(wallet, p, spend.sighash), spend.sighash, wallet.publicKey);
    const final = finalizeSpend(spend, wallet.publicKey, sig);
    const check = checkRawTransaction(final.hex, req);
    if (!check.ok) throw new Error(`pair ${pairName(p)}: ${check.problems.join("; ")}`);
    console.log(`PASS  pair ${pairName(p)}: signature verifies, raw transaction checks`);
    if (p === pair) chosen = final;
  }
  if (!chosen) throw new Error("no transaction was built");
  console.log(`Signed by pair ${pairName(pair)}, ${chosen.vsize} vB, ${(Number(req.feeSats) / chosen.vsize).toFixed(2)} sat/vB`);
  console.log(`Txid:   ${chosen.txid}`);
  console.log(`Raw transaction: ${chosen.hex}`);

  if (!args.broadcast) {
    console.log("Not broadcast. Add --broadcast to send it.");
    return;
  }

  // The signature commits to the amount of the UTXO: a wrong --sats gives an invalid transaction.
  // Check the UTXO against the explorer before sending.
  const seen = await api(`/tx/${req.utxo.txid}`);
  if (!seen.ok) throw new Error(`the funding transaction is not known to the explorer API (HTTP ${seen.status}): check --txid and the network`);
  const funding = (await seen.json()) as { vout?: Array<{ value: number; scriptpubkey_address?: string }> };
  const out = funding.vout?.[req.utxo.vout];
  if (!out || out.scriptpubkey_address !== wallet.address || BigInt(out.value) !== req.utxo.amountSats) {
    throw new Error("the given UTXO does not match the chain (wrong --vout, wrong --sats, or not paid to this wallet)");
  }

  const res = await api("/tx", { method: "POST", headers: { "content-type": "text/plain" }, body: chosen.hex });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error(`broadcast refused (HTTP ${res.status}): ${text.slice(0, 300)}`);
  if (text !== chosen.txid) console.log(`Note: the API answered ${text.slice(0, 80)}`);
  console.log(`Broadcast accepted: ${EXPLORER}/tx/${chosen.txid}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.log(`FAIL  ${(err as Error).message}`);
    process.exit(1);
  },
);
