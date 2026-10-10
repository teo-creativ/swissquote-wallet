# spike/
M0 test (Aaron): real 2-of-3 threshold ECDSA (DKLs23) outside the app. Disposable. Testnet only.

Proves that three parties can create one key, that any two of them can sign, and that the result is a normal Ethereum signature accepted by Base Sepolia. Everything runs in one process: the HTTP transport, the browser WASM build and Vercel are NOT covered here (CDC 15.2 S1 transport, S4 latency on Vercel, S5, S6, S7 stay open).

## Run
```
cd spike
npm i
npx tsx s1.ts          # keygen, saves key shares under .local/ (git-ignored, never printed)
npx tsx s2.ts          # sign with pairs (0,1), (0,2), (1,2)
npx tsx s3.ts          # negative tests, on a throwaway wallet
npx tsx s4.ts          # prints the wallet address and balances, sends nothing
npx tsx s4.ts --send   # sends 1 USDC on Base Sepolia (optional: --to 0x...)
npx tsx s5.ts          # timing
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
| Other tampering errors | Not listed | Not every corruption gives `banParty`: round 1 gives `Invalid final_session_id`, some payloads give `CBOR decode`, a bad last message makes `combine()` throw `k256 error: signature error`. Treat any throw as "session failed, never retry". |
| `free()` after an error (3.5) | Free WASM objects on error | `free()` can itself throw after a failed `handleMessages` and hide the real error. Wrap it in its own try/catch. |
| Pre-signature single use (3.5) | Never reuse, never persist after `lastMessage` | The library blocks `lastMessage()` twice on one session (`invalid state`) and any call after `combine()`. It does NOT block restoring the same serialized pre-signature bytes twice: the node must delete the stored session before calling `lastMessage`. |
| `lastMessage` then `combine` (3.5) | Rounds 5 and 6 | `toBytes()` still works after `lastMessage`, and the restored session refuses a second `lastMessage`. The spike keeps the session in memory between the two calls. |
| Low S (3.5, 15.2 S8) | Normalise if S > n/2 | Every signature observed was already low S. The normalisation is kept as a guard. |
| Address derivation (3.6) | `secp256k1.ProjectivePoint.fromHex(pk).toHex(false)` | `@noble/curves` 2.4.0 has no `ProjectivePoint`: use `secp256k1.Point.fromBytes(pk).toBytes(false)`, imported from `@noble/curves/secp256k1.js`. |
| `publicKeyToAddress` (3.6) | `viem.publicKeyToAddress` | Exported from `viem/accounts`, not from `viem`. |
| WASM init (3.4) | Call the WASM init first (web package) | The node package is CommonJS and loads its `.wasm` from disk at import. No init call. Works on Windows with plain `npx tsx`, no bundler. |
| Extra API | Not listed | `SignSessionOTVariant` and `session.error()` exist. Not used. |

## Results
See the final report of the spike session for PASS/FAIL per step, durations and the transaction hash.
