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

## Step 4 (lawyer portal and P2 node, Slice B): what is real, decisions
Real (nothing simulated in the lawyer portal): invitation with a single-use token (only its SHA-256 is stored, 7 days), WebAuthn registration and sign-in with @simplewebauthn (rpID and origin from `LAWYER_ORIGIN`, user verification required, resident key, stable `user.id` so no duplicate credential, one-time challenges that expire after 5 minutes, counter checked), session cookie (jose HS256, HttpOnly, SameSite=Strict, `__Host-` prefix on https, same-origin check on POST), the P2 owner key (AES-256-GCM with `LAWYER_SHARE_ENC_KEY`, bound to the client by the AAD), the policy engine on the server (`shared/policy.ts`, vectors T1 to T13 tested through the API, T10 with a per-client lock), approvals by passkey assertion, per-client thresholds edited with a passkey (versioned, journaled), recovery approval, exit, and the hash-chained journal (`/api/portal/audit/verify`).
- Challenge binding: the lawyer's assertion signs `SHA-256("sqkeys-approval-v1|requestId|intentHash|approve|refuse")`. The server recomputes it from the stored request; `intentHash` is the SHA-256 of the canonical intent (transfer: safe, to, amount, nonce, safeTxHash; recovery: recoveryId, safe, old owner read from the chain, new owner). Policy changes bind `(clientId, new version, canonical policy)`.
- The node signs only hashes it built: for a transfer it rebuilds the Safe transaction from `{safe, to, amount, nonce}`, compares with the client's hash, checks on chain that it is the second owner of a 2-of-3 Safe and that the nonce is current. The old owner in a recovery is read from the chain (position 0 of the owner list), never taken from the client.
- Server to server: HMAC `APP_TO_LAWYER_SECRET` with replay protection in `seen_nonces`. Browsers only call `/api/invite/inspect`, `/api/webauthn/*` and `/api/portal/*`.
- Found and fixed while testing: `generateAuthenticationOptions` base64url-encodes a string challenge a second time, so the assertion options receive the raw 32 bytes.
- Not done: a lawyer who is already signed in cannot attach a second client to the same account from the invitation link (each invitation creates a lawyer account). A policy evaluation lock exists per server instance only (documented limit; the database guard is the one-shot status change).
- Cancelling an approved recovery works until the client has used the P2 signature; the signature is produced fresh on every status call and is useless once the Safe nonce moved.
- The "Simulated lawyer" strip is removed in live mode. `NEXT_PUBLIC_LAWYER_DEMO_OPERATED=true` shows "Demo: this lawyer account is operated by a team member" only where that is true.
- Tests: `npm test` in `lawyer/` (node.test.ts, 41 tests with a software authenticator) and `node scripts/smoke-lawyer-browser.mjs` (Chrome with a virtual authenticator: invitation, account, sign-out, sign-in, policy change by passkey).
