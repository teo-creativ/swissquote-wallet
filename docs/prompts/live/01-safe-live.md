# Prompt live/01: make the demo REAL with a Safe 2-of-3 smart account (CDC plan B, section 3.9)

Why. The deployed app is entirely mocked: wallet addresses are random, the lawyer account is simulated, recovery is simulated, nothing exists on chain. MPC (DKLs23) is not proven in time, so we switch to the CDC plan B: a **Safe 2-of-3 smart account on Base Sepolia**. The brief allows Safe. It gives a real address, real USDC, real transactions, real gasless sponsoring, and a real recovery. We label it honestly everywhere: "Safe 2-of-3 smart account (not MPC)". MPC DKLs23 stays documented as the target design and is NOT claimed as implemented.

Who runs what. One Claude Code session per slice, in parallel after Slice 0 passes: Slice 0 any session first; Slice A Théotime (sq-mock) or Aaron; Slice B Aaron or Téo (lawyer); Slice C Téo (client). Contract note: signatures of `lib/sqkeys.ts` and `lawyer/lib/lawyerApi.ts` may change ONLY if needed, with each change written in `docs/CONTRACT_CHANGE.md` and told to the other owners (Téo approved this because of the deadline). Rules for every slice: read `CLAUDE.md` first; English; never print or commit a secret (names only); service-role keys only in server code; no private key ever leaves the component that owns it; commit per step; before each commit run build, tests, typecheck and `npm run check-secrets` in the project you touched; do not deploy or push (Téo does).

## Architecture (the contract between the three projects)

Owners of the Safe (threshold 2): P1 = client key generated in the browser, P2 = lawyer node key generated on the lawyer server, P3 = Swissquote node key generated on the sq-mock server. Each private key is generated in its own component, stored there only (P1: AES-256-GCM encrypted in IndexedDB with a key derived by HKDF-SHA256 from the passkey PRF output, or the "Reduced protection" fallback already built; P2: AES-256-GCM encrypted with `LAWYER_SHARE_ENC_KEY` in the lawyer Supabase `shares` table; P3: same with `SQ_SHARE_ENC_KEY` in the sq-mock Supabase). Gas is paid by the sq-mock sponsor key (`SQ_GAS_PRIVATE_KEY`): owners hold no ETH (this is the real gasless bonus). Libraries only: `viem`, `@safe-global/protocol-kit` (or `viem` plus `@safe-global/safe-deployments` if the kit gives trouble in Next 16 webpack, decide within 30 minutes), `@simplewebauthn/server` and `/browser`, `jose`, Node `crypto`. No homemade cryptography.

Server-to-server calls use HMAC: headers `x-sq-ts` (unix seconds) and `x-sq-sig` = HMAC-SHA256(secret, ts + "." + METHOD + "." + path + "." + sha256hex(body)); reject if the timestamp is off by more than 60 s; secrets `APP_TO_LAWYER_SECRET` (client to lawyer and lawyer to client) and `APP_TO_SQ_SECRET` (client to sq-mock). Bodies at most 64 KB.

Wallet address = the counterfactual Safe address (`saltNonce` derived from the account's `sqRef`), deployed on chain by the sponsor at creation. Recovery = a Safe transaction `swapOwner` that replaces P1 by P1' and is signed by P2 and P3 (same address, funds stay put); this replaces the "new address and move funds" of the CDC and must be written in the README. Exit without Swissquote = P1 + P2 signature, manual lawyer approval.

Policy (R0 to R10 and vectors T1 to T13 from the CDC and the existing mock) lives in `shared/` and is run by the lawyer node only. A node never signs a hash it did not build: for a transfer, the lawyer node rebuilds the Safe transaction itself from `{safeAddress, to, amount, nonce}`, computes the hash, compares it with the client's, and shows exactly that to the lawyer.

## Slice 0: spike (gate, about 45 minutes)

In `spike/`, write `safe-spike.ts` (never print keys): load `SQ_GAS_PRIVATE_KEY` from `sq-mock/.env.local`; generate three throwaway owner keys in memory; check that the Safe factory and singleton exist on Base Sepolia (84532) with `getCode`; deploy a 2-of-3 Safe through the sponsor; fund it with a little USDC from `SQ_DEMO_WALLET_PRIVATE_KEY`; build a USDC transfer Safe transaction, sign with two owners, execute through the sponsor; verify the balance changed and print the two Basescan links; then execute a `swapOwner` signed by two other owners. If any step fails and cannot be fixed within the time box, stop and write the exact failure in `spike/RESULT.md`. Prerequisite for Téo: the sponsor address must hold some Base Sepolia ETH and the demo wallet some test USDC (`npm run check-chain -- <address>`).

## Slice A: sq-mock (P3 node, sponsor, bank, console data)

If `sq-mock/` has no app yet, scaffold a minimal Next.js app there (same versions as the root, port 3002, webpack) and tell Théotime. Routes, all HMAC (`APP_TO_SQ_SECRET`) and idempotent where noted:
- `POST /api/node/owner/create {sqRef}`: generate P3, store encrypted, return `{address}` (idempotent per `sqRef`).
- `POST /api/gas/deploy {sqRef, owners[3], threshold, saltNonce}`: sponsor deploys the Safe, returns `{address, txHash}`; caps per account and per day.
- `POST /api/gas/exec {safeAddress, safeTx, signatures}`: sponsor submits `execTransaction`, returns `{txHash}`.
- `POST /api/bank/transfer {sqRef, to, amountUsdc}`: send USDC from the demo wallet to the wallet address (a real transfer from the simulated bank).
- Recovery and console: tables for recovery requests and operator actions. `POST /api/recovery/open`, `GET /api/recovery/{id}`, operator endpoints used by the console in the client app (identity check pass or fail, "next check: fail" must really change the stored state), the recovery delay (`RECOVERY_DELAY_SECONDS`, 120 s in demo), `POST /api/node/sign {recoveryId, safeTxHash}` which signs with P3 ONLY if identity verified, delay elapsed, and the lawyer has approved; the client may cancel during the delay.
Everything simulated here (identity, bank account) carries the "Simulated" pill in its UI.

## Slice B: lawyer portal and P2 node (all REAL, nothing simulated)

- Invitation: `POST /api/invite/register` (HMAC), `POST /api/invite/inspect`, usage-once token (store SHA-256), 7 days. `/invite/[token]` shows the real invitation or a clear "invalid or expired" screen.
- Lawyer account: `webauthn/register/options` and `verify` with `@simplewebauthn/server`: `rpID` = portal hostname, `userVerification: "required"`, resident key, real `user.id` stability (no duplicate credentials), login by passkey, session cookie (`jose`). On accept: generate P2, store encrypted, callback to the client `POST {APP_URL}/api/internal/lawyer-accepted` (HMAC).
- `POST /api/node/owner/create {sqRef}` returns the P2 address.
- Transfers: `POST /api/node/transfer/request {sqRef, safeAddress, to, amount, nonce, safeTxHash}` (HMAC): run the policy; AUTO returns P2's signature at once; LAWYER stores a pending request. The lawyer dashboard shows it; approve or refuse with a WebAuthn assertion whose challenge is `SHA-256("sqkeys-approval-v1" || requestId || intentHash || "approve" | "refuse")`, verified server-side (signature, counter, origin, rpID, exact challenge), stored in the audit journal; on approve P2 signs and the client polls `GET /api/node/transfer/status`.
- Policy page: thresholds per client, changeable with a passkey assertion, versioned.
- Recovery: show the request, approve or refuse with a WebAuthn assertion whose challenge binds `(recoveryId, safeAddress, newOwnerAddress)`; on approve P2 signs the `swapOwner` hash it rebuilt itself.
- Exit: same pattern, always manual.

## Slice C: client app (live mode)

Implement the live bodies behind `lib/sqkeys.ts` in new files (`lib/live/*`, `app/api/**`), selected by `NEXT_PUBLIC_SQKEYS_MODE=live`; keep the mock for tests and for `/dev/mock`. Session cookie (`jose`), `accounts` row in the client Supabase, `GET /api/me`.
- Onboarding as already built (invite first, then key): real invitation to the lawyer, poll until accepted, then ONE tap: passkey (existing ceremony) and P1 generation in the browser, then creation: ask lawyer and sq-mock for P2 and P3 addresses, compute the Safe address, ask sq-mock to deploy it, show the three share cards with real states, then the real address and the real Basescan link of the deployment transaction.
- Receive: the real address, QR code, real balances read with `viem` (ETH not needed), faucet instructions for test USDC. "From Swissquote": calls `bank/transfer`.
- Send: build the Safe transaction, P1 signs after the passkey unlock, send to the lawyer node, wait for P2 (polling), then `gas/exec`; show the real transaction hash and link.
- Recovery on a new device: new passkey and P1', open the recovery at sq-mock, status screens polling the real state (identity check, lawyer approval, delay with a cancel button), then `swapOwner` executed; the old device key is no longer an owner. The attacker case: console "check fails" must make the recovery end refused.
- Console (`app/console`): reads and writes the real sq-mock state through HMAC instead of server memory.
- Remove every random address or hash. If a screen cannot be backed by a real action, hide it or mark it "Simulated".

## Final report (each slice)

What is real now, what is still simulated, environment variable NAMES to add on each Vercel project, tables or SQL changes (add to the existing `sql/` files), a two-device test script for Téo, and the README status table and custody section updated to say "Safe 2-of-3 smart account, not MPC".
