# Live mode notes: what was reused from teammates

Custody model of the live demo: **Safe 2-of-3 smart account (not MPC)**, Base Sepolia (84532). Design of record: `docs/prompts/live/01-safe-live.md`.

## Step 0: reuse (copy of files, no merge, no history rewrite)

Source: `origin/aaron/logic` (fetched). Files were copied into `sq-mock/`; the branch itself was not merged.

| Reused from `origin/aaron/logic` | Why it is independent of the custody mode |
|---|---|
| `sq-mock/src/shared/hmac.ts` + test | Server to server HMAC and replay nonces |
| `sq-mock/lib/{http,errors,config,runtime,types,store,store.supabase,audit,passwords,seed,testkit,console}.ts` and tests | Route wrapper, Store interface (memory and Supabase), hash-chained audit log, console data |
| `sq-mock/lib/recovery.ts` + test | Identity check, delay, cancel, `releaseBlock` (the P3 signing condition) |
| `sq-mock/lib/{services,chain}.ts`, `sq-mock/app/api/*` | Simulated Swissquote login/KYC/bank, USDC transfer from the demo wallet, ownership proof |
| `sq-mock/{package.json,tsconfig.json,next.config.ts,vitest.config.ts,scripts/seed.ts}` | Same exact versions as the root (Next 16.4.0, webpack, port 3002) |

Result: 52 unit tests and the typecheck pass in `sq-mock/` as copied.

| Skipped | Reason |
|---|---|
| `shared/mpc-node/*`, `lib/mpc/*`, `spike/http-harness`, `spike/s1..s5` (MPC) | DKLs23 is not claimed as implemented; plan B is a Safe |
| `/dev/mpc-check` and the other MPC pages | Same |

`origin/theotime/sq` adds only the lawyer and console mocks already present on `teo/ui`; its `sq-mock/` holds only the files `teo/ui` already has. Nothing to reuse.

## To adapt (next steps)
- Replace the `gas/drip` model by the sponsored paths of Slice A (`gas/deploy`, `gas/exec`).
- Add the P3 owner key routes and `node/sign` using `releaseBlock`.

## Step 3 (sq-mock, Slice A): decisions
- HMAC format: the tested scheme of Aaron's `shared/hmac.ts` is kept (headers `x-sq-ts` ISO timestamp, `x-sq-nonce`, `x-sq-sig`; MAC over method, path with query, timestamp, nonce and body hash; 60 s skew; nonces claimed in the store). It replaces the `ts.METHOD.path.bodyhash` string of the design doc: same protection (authentication, freshness, replay), already implemented and tested.
- `hmac.ts` was moved to the source folder `shared/` and synced; new shared files: `shared/safe.ts` (Safe address, EIP-712 hash, transfer and swapOwner builders, signature packing; checked against the chain by `spike/verify-shared.ts`) and `shared/share-crypto.ts` (AES-256-GCM sealing of owner keys, bound to the account by the AAD).
- Recovery status is polled with `GET /api/recovery/status?recoveryId=` (no `/api/recovery/{id}` route).
- P3 learns the lawyer approved from P2's signature over the swapOwner hash, so no second server-to-server secret between the lawyer and sq-mock is needed.
- Cancel after P3 signed cannot revoke a signature already handed out: the delay is the protection, cancellation works during the delay.
- The bank only sends to the client's own Safe, and requires the (simulated) identity check. Limit: 10 USDC per transfer, `BANK_MAX_TRANSFERS_PER_DAY` (default 10) per client.
