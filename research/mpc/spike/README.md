# spike/
> Moved from `spike/` on branch `aaron/logic` to `research/mpc/spike/`. **Research only: the live demo is a Safe 2-of-3 smart account and does not use any of this.** Paths below were updated for the new location; measurements are the original ones. See `../README.md` for what is and is not proven.

M0 test (Aaron): real 2-of-3 threshold ECDSA (DKLs23) outside the app. Disposable. Testnet only.

Proves that three parties can create one key, that any two of them can sign, and that the result is a normal Ethereum signature accepted by Base Sepolia. Steps S1 to S5 run in one process. The HTTP harness (below) runs the same protocol between separate processes. A browser check (`/dev/mpc-check`) existed on branch `aaron/logic` only; that page is not in this branch. Still open: a real Vercel deployment of a node (CDC 15.2 S4, S5 server side), PRF on the phone (S6), lost share recovery (S7).

## Run
```
cd research/mpc
npm ci
npm run s1             # keygen, saves key shares under spike/.local/ (git-ignored, never printed)
npm run s2             # sign with pairs (0,1), (0,2), (1,2)
npm run s3             # negative tests, on a throwaway wallet
npm run s4             # prints the wallet address and balances, sends nothing
npm run s4 -- --send   # sends 1 USDC on Base Sepolia (optional: --to 0x...)
npm run s4 -- --verify 0x<tx hash>   # re-checks a mined transfer, sends nothing
npm run s5             # timing
npm run harness        # P2 and P3 as separate processes on ports 4002 and 4003, P1 here
```
`s1.ts` does not replace an existing wallet unless you pass `--force`.

## How the scripts map to a stateless node
`lib.ts` keeps every session as bytes. Each round does `fromBytes()`, one library call, `toBytes()`, `free()`. Messages travel as plain `{ from, to, payload }` and are rebuilt with `new Message(payload, from, to)` for each recipient, because `handleMessages` consumes the objects it receives.

## CDC says / library does
Versions: `@silencelaboratories/dkls-wasm-ll-node` 1.2.0, `viem` 2.57.4, `@noble/curves` 2.4.0.

| Topic | CDC says | Library does |
|---|---|---|
| DKG round order (3.5) | createFirstMessage, handleMessages x4, commitments passed in round 4 | Same. Confirmed with serialization between every round. |
| `commitments` shape (3.5, to validate) | "array of the 3 commitments, indexed by party id" | Plain JS array of three 32-byte `Uint8Array`, index = party id. `calculateChainCodeCommitment()` is called after round 2. |
| `to_id` (3.5, to validate) | To be interpreted | The keyshare party id of the recipient. `undefined` means broadcast (deliver to every other party). |
| Party ids when signing (3.5, 15.2 S3) | Maybe renumbered 0 to t-1 | NOT renumbered. `from_id`, `to_id` are the keyshare party ids: pair (0,2) talks as 0 and 2, pair (1,2) as 1 and 2. No mapping needed. |
| `banParty` value | Library README: "in the range [0 .. threshold-1]" | Observed: the keyshare party id of the sender (2 for party 2 in pairs (0,2) and (1,2)). |
| Abort error (3.5) | Error `AbortProtocolAndBanParty` | A plain `Error` (name `Error`), message `Abort the protocol and ban the party N`, with a `banParty` property. Detect it with `"banParty" in err`, not by name. |
| Other tampering errors | Not listed | Measured on round 2 messages: a flipped bit in the last byte always gives `banParty`; elsewhere about half of the flips give a plain `CBOR decode` error. So not every corruption gives `banParty`: round 1 gives `Invalid final_session_id`, some payloads give `CBOR decode`, a bad last message makes `combine()` throw `k256 error: signature error`. Treat any throw as "session failed, never retry". |
| `free()` after an error (3.5) | Free WASM objects on error | `free()` can itself throw after a failed `handleMessages` and hide the real error. Wrap it in its own try/catch. |
| Pre-signature single use (3.5) | Never reuse, never persist after `lastMessage` | The library blocks `lastMessage()` twice on one session (`invalid state`) and any call after `combine()`. It does NOT block restoring the same serialized pre-signature bytes twice: the node must delete the stored session before calling `lastMessage`. |
| `lastMessage` then `combine` (3.5) | Rounds 5 and 6 | `toBytes()` still works after `lastMessage`, and the restored session refuses a second `lastMessage`. The spike keeps the session in memory between the two calls. |
| Low S (3.5, 15.2 S8) | Normalise if S > n/2 | Every signature observed was already low S. The normalisation is kept as a guard. |
| Address derivation (3.6) | `secp256k1.ProjectivePoint.fromHex(pk).toHex(false)` | `@noble/curves` 2.4.0 has no `ProjectivePoint`: use `secp256k1.Point.fromBytes(pk).toBytes(false)`, imported from `@noble/curves/secp256k1.js`. |
| `publicKeyToAddress` (3.6) | `viem.publicKeyToAddress` | Exported from `viem/accounts`, not from `viem`. |
| WASM init (3.4) | Call the WASM init first (web package) | The node package is CommonJS and loads its `.wasm` from disk at import. No init call. Works on Windows with plain `npx tsx`, no bundler. |
| Extra API | Not listed | `SignSessionOTVariant` and `session.error()` exist. Not used. |

## Results (2026-10-11, Windows 11 x64, Node 24.21.0, one process, no network between parties)
| Step | Result | Detail |
|---|---|---|
| S1 keygen | PASS | 3 parties, threshold 2, same public key for all, about 2.3 s |
| S2 signing | PASS | pairs (0,1), (0,2), (1,2) all produce a valid signature, about 150 ms each |
| S3 negative tests | PASS | wrong hash rejected, tampered messages abort, consumed session refused |
| S4 real transfer | PASS | 1 USDC sent by P1 + P2, signed in 183 ms, block 47950792 |
| S5 timing and Windows | PASS | plain `npx tsx`, no bundler |

Wallet `0xd52C3b0e3C79Fa92e0bdEE4B932E1514A2ac8e99`, transaction https://sepolia.basescan.org/tx/0x8b980054c7157fb0e8b57f0d8b4c103d7d9b9dcdf02b91eb9ce48bd19cb791d4

Chain note for the app: a `latest` balance read right after the receipt returned the old balance on the first run (lagging RPC node). Read at the receipt block number, or rely on the Transfer event in the receipt.

## HTTP harness (2026-10-11)
`http-harness/run.ts` starts two node servers as separate processes (P2 on 4002, P3 on 4003), both built on `research/mpc/shared/mpc-node` with in-memory stores, and plays P1 plus the orchestrator. One JSON request per node and per round, every request signed with the repository's `shared/hmac.ts` (secret from `HARNESS_HMAC_SECRET`, or random for the run). All checks PASS: keygen, signature (P1, P2), signature (P2, P3), second last message refused, replayed nonce, missing headers, wrong secret and wrong body rejected.

Latency per round on localhost (compute dominates, the network adds almost nothing here):

| Protocol | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 | Round 6 / commit | Total |
|---|---|---|---|---|---|---|---|
| Keygen, 3 parties | 47 ms | 552 ms | 956 ms | 309 ms | 67 ms | 20 ms | about 2.0 s |
| Sign P1 + P2 | 60 ms | 103 ms | 120 ms | 79 ms | 17 ms | 11 ms (P1 combines locally) | about 0.4 s |
| Sign P2 + P3 | 37 ms | 60 ms | 89 ms | 45 ms | 18 ms | 19 ms | about 0.3 s |

Sizes measured (they drive limits and storage):

| What | Size |
|---|---|
| Largest JSON body in keygen (one node, one round) | about 190 KB |
| Largest JSON body in signing | about 126 KB |
| Stored session record, keygen | up to about 333 KB |
| Stored session record, signing | up to about 457 KB |
| One encrypted key share | about 247 KB |

## Browser check (2026-10-11, branch `aaron/logic` only)
Not reproducible from this branch: the page `/dev/mpc-check` was not brought over, and `research/mpc/lib/mpc/client.ts` is kept as a reference file that only passes the typecheck here.

`/dev/mpc-check` (root app) loads `@silencelaboratories/dkls-wasm-ll-web` through `lib/mpc/client.ts` and runs a full 3-party keygen in the tab with the same round code as the nodes (`lib/shared/mpc-node/protocol.ts`). `npm run build` (webpack) passes with no extra configuration beyond `asyncWebAssembly`, already in `next.config.ts`. Checked in headless Chrome against `next start`: PASS, 5 of 5 rounds, WASM load about 150 ms, keygen about 2.6 s, no console error. The `.wasm` is emitted as `/_next/static/media/dkls-wasm-ll-web_bg.<hash>.wasm`: 641,683 bytes, about 225 KB gzipped, served as `application/wasm`. Not yet checked on a phone or on the production URL.

## Node rules
These are enforced by `shared/mpc-node` and must survive any change to it.

1. **Stateless.** A node keeps nothing in memory between two requests. Each step restores the session from the store, runs one round, stores the new state.
2. **One round, one time.** The record of the previous round is deleted before the round runs (`get`, then `delete`, then compute, then `put`). A round can never run twice; a replay or a skipped round gets `SESSION_NOT_FOUND`.
3. **Pre-signatures are single use.** The stored sign session is deleted BEFORE `lastMessage` is called, and `lastMessage` only runs if this request is the one that deleted it. The library itself accepts the same serialized pre-signature twice, so this is our job.
4. **`SessionStore.delete` must be atomic** and return true only to the caller that removed the row (SQL: `delete ... returning`). Rule 3 depends on it. Never restore `node_sessions` from a backup.
5. **A failed step ends the session.** Whatever the error, nothing is left to retry. Start a new session.
6. **The node chooses the hash.** `signStart` receives the 32-byte hash that the node computed from the transaction or message it validated (CDC 8.3) and stores it encrypted with the session. `signFinish` takes no hash.
7. **Everything at rest is encrypted** with AES-256-GCM (`node:crypto`), a fresh random nonce per record, and a key version. The key comes from the environment of that node only and is passed in as a parameter. Session records are bound to party, session id, round and protocol; shares are bound to party and public key.
8. **`free()` never hides an error.** After a failed round `free()` can throw: every call goes through `safeFree`. Message objects are always consumed by `handleMessages`.
9. **Stable error codes.** `ABORT_BAN_PARTY` (with `banParty`, the key share id of the cheater), `PROTOCOL_ERROR`, `SESSION_NOT_FOUND`, `BAD_REQUEST`, `STORAGE_ERROR`. `message` is safe for an API response; `detail` is for server logs only and holds no key material.
10. **Party ids are the key share ids** (0 client, 1 lawyer, 2 Swissquote) in every message and in `signers`. No renumbering.
11. **Who combines.** The first signer calls `signFinish` with no argument and only returns its last message. The second signer calls it with `peerLast` and gets `[R, S]`. For P1 + P2 the node is first and the browser combines; for P2 + P3 one node combines and returns the signature to the orchestrator.
12. **Authenticate first.** A route verifies the HMAC (and replay) before it parses the body or touches a session. The orchestrator forwards to a node only the messages that node must handle.
13. **Nothing secret is logged or returned**: no share, no session bytes, no key, no HMAC secret.

## Using the node core
```ts
import * as dkls from "@silencelaboratories/dkls-wasm-ll-node";
import { keygenStart, keygenStep, keygenFinish, signStart, signStep, signFinish, singleKeyRing } from "./shared/mpc-node/index.ts"; // path inside research/mpc

const ctx = { lib: dkls, store, keys: singleKeyRing(keyVersion, keyBytes), partyId: 1 }; // 2 for sq-mock
```
- `store` implements `SessionStore` (3 methods) on `node_sessions`. `MemorySessionStore` is for tests only.
- `keygenFinish` returns `{ partyId, publicKey, share: { keyVersion, nonce, ciphertext } }`: write it to `shares` as is and pass the same object back to `signStart`.
- `http-harness/node-server.ts` is a complete example of the five routes.
- Next.js on Vercel: Node runtime only (`node:crypto`, and the package reads its `.wasm` from disk), add the package to `serverExternalPackages` and its `.wasm` to `outputFileTracingIncludes`. Not yet verified on Vercel.
- The browser uses `lib/mpc/client.ts` and `lib/shared/mpc-node/protocol.ts`, never `index.ts` (it pulls `node:crypto`).
