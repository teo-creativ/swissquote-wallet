# research/mpc/bitcoin: Bitcoin testnet4 spend signed by two of three DKLs23 parties

**Research only. Not in the app.** The live demo is a Safe 2-of-3 smart account on Base Sepolia and has no Bitcoin feature. Testnet only (testnet4 coins have no value).

The same DKLs23 node core as the Ethereum research (`../shared/mpc-node`) produces one secp256k1 key held as three shares. Bitcoin sees an ordinary single-key address: native SegWit **P2WPKH** (`tb1q...`), ECDSA. This is not Taproot and not Schnorr.

## What the scripts do
| Step | Where |
|---|---|
| 3-party key generation, threshold 2, through the node core | `generateWallet` in `lib.ts` |
| Compressed public key to a `tb1q...` address | `addressFromPublicKey` |
| One input, one or two outputs, BIP143 sighash | `buildSpend` (`@scure/btc-signer` 2.4.1) |
| Two parties sign the sighash; pairs 0+1, 0+2 and 1+2 are all tried | `signWithPair` |
| Low S, DER, local verification against the public key | `toBitcoinSignature` (`@noble/curves` 2.4.0) |
| Witness, raw transaction hex, then decode it again and re-check it | `finalizeSpend`, `checkRawTransaction` |
| Broadcast, only with `--broadcast` | `send.ts`, `POST /testnet4/api/tx` on mempool.space |

No hand-written cryptography: scripts, sighash and encoding come from `@scure/btc-signer`; DER, low S and verification from `@noble/curves`; the threshold signature from `@silencelaboratories/dkls-wasm-ll-node`.

## Commands
Run from `research/mpc` after `npm ci`.
```
npm run btc:address     # prints the address and exits (creates the wallet on first use)
npm run btc:dryrun      # no funds needed: fake UTXO, all three pairs sign, everything checked locally
npm run btc:keygen      # explicit key generation; refuses to replace a wallet without -- --force
npm test                # includes bitcoin/btc.test.ts
```
Key shares are stored under `bitcoin/.local/` (git-ignored) and never printed. Deleting that folder, or `btc:keygen -- --force`, loses the address and anything sent to it.

## Fund the address and send a real transaction
1. `npm run btc:address` and copy the `tb1q...` address.
2. Get testnet4 coins from a faucet, for example https://mempool.space/testnet4/faucet (faucets change and may ask for a login or a captcha; any testnet4 faucet works).
3. Open `https://mempool.space/testnet4/address/<address>`, wait for the funding transaction, and note its **txid**, the **output index** paid to the address (vout) and the **amount in sats**.
4. Build and check the transaction without sending it:
   ```
   npm run btc:send -- --txid <txid> --vout <n> --sats <amount>
   ```
5. Send it:
   ```
   npm run btc:send -- --txid <txid> --vout <n> --sats <amount> --broadcast
   ```
   The script prints the explorer link `https://mempool.space/testnet4/tx/<txid>`.

Options: `--to tb1...` (default: back to the wallet address), `--send <sats>` (amount for the recipient, change returns to the wallet; default: everything minus the fee), `--fee <sats>` (default 300), `--pair 0,1 | 0,2 | 1,2` (whose signature goes in the transaction; default `0,1`). With `--broadcast` the script first asks the explorer API whether the UTXO exists with that amount for this address, because the signature commits to the amount. `BTC_MEMPOOL_API` can point to another instance of the mempool software if mempool.space cannot be reached.

## Status (2026-10-11)
- **Works, checked locally:** key generation, address, signature by each of the three pairs, low S and DER, verification against the public key, raw transaction decoded and re-checked. `btc.test.ts` also compares the transaction assembly byte for byte with the library's own signer (using an ordinary key).
- **Not done yet: no transaction was broadcast.** The address was not funded, so the Bitcoin network has not accepted a transaction from this code. The broadcast call itself is untested: mempool.space could not be reached from the machine that wrote this (connection timeout); only the UTXO check before it ran, against another instance of the same API.

## Honest limits
- Research only, not in the app, not on Vercel, no user interface.
- The three parties run in one process on one machine. Their shares, and the keys that encrypt them, sit in the same local folder. That shows the signing mathematics, not a custody setup.
- No fee estimation: the fee is the fixed `--fee` argument.
- No UTXO management: exactly one input, given by hand; no coin selection, no balance, no fee bumping (RBF, CPFP).
- One address, no derivation (no BIP32 or BIP84 paths), P2WPKH only. No Taproot, no multisig script, no PSBT exchange with other wallets.
- No policy check before signing: the script signs whatever spend it is asked for.
