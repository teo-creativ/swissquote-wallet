# research/mpc: threshold ECDSA (DKLs23) research

**Research only. The live demo does not use any of this.** The demo uses a Safe 2-of-3 smart account because the MPC integration was not finished in time.

Testnet only. No real funds. Nothing here is built by the root app or deployed to Vercel (`/research` is in `.vercelignore` and excluded from the root `tsconfig.json`).

## What is in this folder
Copied from branch `aaron/logic` (not merged), imports fixed for the new location:

| Path | What it is |
|---|---|
| `shared/mpc-node/` | Node core: one function per HTTP round, state encrypted at rest between rounds, with its tests |
| `spike/s1.ts` to `s5.ts`, `spike/lib.ts` | Steps S1 to S5 in one process |
| `spike/http-harness/` | The same protocol between separate processes over HTTP with HMAC |
| `spike/README.md` | Original notes: library behaviour against the CDC, timings, sizes, node rules |
| `lib/mpc/client.ts` | Browser-side party P1 (reference file, see limits below) |
| `bitcoin/` | Bitcoin testnet4 signing with the same node core (see `bitcoin/README.md`) |

Library: `@silencelaboratories/dkls-wasm-ll-node` 1.2.0, under the Silence Laboratories Non-Commercial Use Licence (see `NOTICE` and `licenses/` at the repository root). Other versions: `viem` 2.57.4, `@noble/curves` 2.4.0, `@scure/btc-signer` 2.4.1.

## Run
```
cd research/mpc
npm ci
npm test            # node core tests (keygen, signing, tamper, replay, storage)
npm run typecheck
npm run s1          # 3-party keygen; key shares go to spike/.local/ (git-ignored, never printed)
npm run s2          # every pair signs
npm run s3          # tamper and reuse tests
npm run s4          # prints the wallet address and balances, sends nothing (-- --send to send 1 USDC)
npm run s5          # timing
npm run harness     # P2 and P3 as separate processes, P1 and the orchestrator in this one
```
`s1` creates a new wallet in `research/mpc/spike/.local/`. The wallet that made the transfer below lives in the old `spike/.local/` of the machine that ran it and was not copied.

## What was proven
1. **3-party key generation** (2-of-3): the three parties end with the same public key, with the session serialized between every round (S1, node core tests).
2. **Any pair signs**: (P1, P2), (P1, P3) and (P2, P3) each produce a valid ECDSA signature for the wallet (S2, node core tests).
3. **Real USDC transfer on Base Sepolia** signed by P1 + P2: 1 USDC, block 47950792, https://sepolia.basescan.org/tx/0x8b980054c7157fb0e8b57f0d8b4c103d7d9b9dcdf02b91eb9ce48bd19cb791d4 (S4, run once on 2026-10-11 from branch `aaron/logic`; not sent again from this folder).
4. **Two node processes over HMAC**: P2 and P3 run as separate OS processes on localhost; keygen and both signature paths go through JSON requests signed with the repository's `shared/hmac.ts`; replayed, unsigned and wrongly signed requests are rejected (harness).
5. **Tamper test**: a modified protocol message never yields a valid signature, a used pre-signature cannot be used again (S3, node core tests).

Re-run in this folder on 2026-10-11 (Windows 11, Node 24.21.0): `npm test` 19 of 19, S1, S2, S3, S5 and the harness all `RESULT: PASS`. The transfer of point 3 was checked on chain (receipt status `success`), not repeated.

## What was NOT done
- **Not integrated in the app.** No screen, route or node of the client app, the lawyer portal or sq-mock calls this code. The demo wallet is a Safe with three ordinary owner keys.
- **Not verified on Vercel.** The node core never ran in a deployed function; the processes of the harness all run on one machine, on localhost.
- No database store (only the in-memory `SessionStore`), no session expiry in SQL, no key rotation.
- The browser party (`lib/mpc/client.ts`) only passes the typecheck here. Its page ran on branch `aaron/logic`; it was not brought over and not tested on a phone.
- No lost-share recovery, no key refresh, no passkey-wrapped share on the phone.
- No security review. Key shares of these scripts sit in local git-ignored files; that is not a custody design.
