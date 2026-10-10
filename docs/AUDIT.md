# AUDIT: what is mocked, and what must be reworked for a working live demo

Written 2026-10-10 around 23:15 (local) on branch `teo/ui`, after `git fetch`. Code freeze is tomorrow 08:30 (about 9 h 15 min away), submission 10:30.
Read-only audit: this file is the only thing written. No secret value was read or printed (variable NAMES only).

Sources read: `CLAUDE.md`, `docs/CDC_v3.1.md` (3.8, 3.9, 3.10, 7.4, 11 (the demo script, the prompt said "14" but section 14 is Sources), 12, annexes A to E), `docs/Swissquote_brief.md` (grep), all of `lib/`, `lawyer/lib/`, `app/`, `lawyer/app/`, the three SQL files, the three `.env.example`, `next.config.ts` files, `vercel.json` files. Tests: root 63 passed, lawyer 55 passed (all against mocks).

Method limits (read this before trusting a verdict):
- I can only see what is on `origin/*` and in this working tree. I cannot see Aaron's or Théotime's local, unpushed work. On every remote branch (`main`, `aaron/logic`, `theotime/sq`, `teo/ui`) there is **no** API route except `lawyer/app/api/node/health`, `spike/` and `sq-mock/` contain no code, `lib/mpc/client.ts` is a 7-line WASM load stub. If code exists elsewhere, it has to be pushed so this audit can be redone.
- Another session was writing `lib/passkey/webauthn.ts` and `app/api/public-config/route.ts` while I audited (both untracked, appeared between two of my reads). Section 4 reviews them as they were at 23:12.
- I did not click through the apps in a browser. Findings come from reading the code, the unit tests, and HTTP status codes of the production URLs.

---

## 0. One-page summary

**Headline: the repository contains a complete, polished front end running on in-browser mocks, and no backend at all.** No route handler (other than a build check), no Supabase call, no MPC, no chain call, no HMAC, no session, no WebAuthn ceremony wired to a screen. The three Supabase SQL files exist but nothing reads or writes a table. Because the client app, the lawyer portal and sq-mock are three different origins, **none of the journeys that involve two parties can work between two devices today.** The deployed sites are also out of date (see below).

| # | Journey (CDC 11.1 scene) | Single tab, mock mode | Two devices, deployed URLs | Verdict |
|---|---|---|---|---|
| J0 | Production URLs serve the current UI | n/a | Both prod sites return 404 on almost every route of the current UI (section 3.0) | **Blocked** (small fix: redeploy) |
| J1 | Create wallet (login, KYC, consents, passkey, invite lawyer, lawyer accepts, DKG, gas) | Runs end to end, but passkey is a timer, lawyer acceptance is an 8 s timer, address is random | Lawyer cannot accept a real invitation; no DKG | **Blocked** |
| J2 | Fund the wallet from Swissquote (needed before scene 1) | Balance arithmetic only | No sq-mock, no chain | **Blocked** |
| J3 | Scene 1: send 2 USDC under the threshold, instant | Runs (policy engine mock is faithful); hash and explorer link are fake | No signing, no broadcast | **Needs work** |
| J4 | Scene 2: 8 USDC, lawyer approves with passkey, confirmed | Runs only because a timer approves after 8 s | Request never reaches the lawyer portal; decision never returns | **Blocked** |
| J5 | Scene 3: lost phone, identity, approval, 2 min delay, sweep | Runs on timers | Three origins involved, none connected; no P2+P3 sweep | **Blocked** |
| J6 | Bonus: attacker refused, console "next check: fail" | Console toggle is not connected to the client | Cannot work | **Blocked** |
| J7 | Exit without Swissquote (`exit/`) | n/a | `exit/` has no code | **Blocked** (video fallback V4 only) |
| J8 | Swissquote console (C21) | Server memory of one serverless instance, seeded data | Resets on cold start, unrelated to client state | **Needs work** |
| J9 | Passkeys (client PRF, lawyer approvals) | Client screen uses a timer; new real layer exists but is not wired | Lawyer WebAuthn routes do not exist | **Needs work** |

Nothing is "demo-ready" for the stated goal (two devices, deployed, real). Scene 1 and the console are the closest.

**MPC risk: high, and the Safe fallback decision is overdue.** The CDC M0 decision point was 20:00 tonight. I see no spike result, no DKG code, no node code. Recommendation in section 6.3: Aaron reports S1/S2 status within 30 minutes; if both are not already proven on Base Sepolia, trigger the Safe 2-of-3 plan (CDC 3.9) no later than **00:30**. In parallel, build the shared state backend (section 7), because it is needed under either custody path and is the real blocker for every two-device scene.

Biggest single risks, in order: (1) no backend, (2) no on-chain signing path, (3) stale deployments, (4) fake explorer links and fake addresses shown to a jury (rule 7, honesty), (5) passkey on the Honor Magic untested (S6).

---

## 1. Inventory

Status legend: **REAL** works against a real backend or chain. **MOCK-LOCAL** in-memory or browser state. **MOCK-BACKEND** needs a server and a database to become real. **STUB** `NOT_IMPLEMENTED` or empty. **UI-ONLY** screen without logic.

### 1.1 Mode switches (the real values)

| Variable | Read in | Values | Effect |
|---|---|---|---|
| `NEXT_PUBLIC_SQKEYS_MODE` | `lib/sqkeys.mode.ts` | `live` -> live; anything else (default) -> `mock` | `mock`: every `lib/sqkeys.ts` function calls `lib/sqkeys.mock.ts`. `live`: **every one of the 28 functions throws `NOT_IMPLEMENTED`** ("Not implemented yet.") so every screen shows an error. Also gates `/dev/mock` (404 unless mock). |
| `NEXT_PUBLIC_LAWYER_MODE` | `lawyer/lib/lawyerApi.ts`, `lawyer/lib/passkey.ts` | default `mock`; `live` | `mock`: in-memory store in the browser tab. `live`: `acceptInvitation` and `login` run a real WebAuthn ceremony against `/api/webauthn/*` (**routes do not exist**, so HTTP 404 -> error); the other 10 functions throw `NOT_IMPLEMENTED`. **This variable is missing from `lawyer/.env.example` and `lawyer/.env.local`.** |

Both are `NEXT_PUBLIC_`: inlined at build time. Changing them in Vercel does nothing until the project is rebuilt with `npx vercel --prod`.

### 1.2 Routes

| Project | Route | Status | Note |
|---|---|---|---|
| client | `/` (splash), `/login`, `/verify`, `/documents`, `/key`, `/lawyer`, `/creating` (onboarding C1-C7) | MOCK-LOCAL | `Guard` redirects by `Account.status` from the mock |
| client | `/home`, `/send`, `/send/review`, `/send/waiting/[id]`, `/send/result/[id]`, `/receive`, `/from-swissquote`, `/activity` | MOCK-LOCAL | |
| client | `/security`, `/apps/allow`, `/recovery`, `/recovery/[id]`, `/recovery/[id]/verify` | MOCK-LOCAL | exit kit is a JSON blob with "no key material" |
| client | `/legal/[doc]` (terms, risk, recovery, privacy, cookies, notice), `/documents` consents | REAL (static markdown in `content/legal/`) | consents are not stored anywhere |
| client | `/dev/mock` | MOCK-LOCAL | control panel (auto lawyer, identity pass, PRF on/off, skip delay). Reachable in mock mode on the public URL |
| client | `/dev/ui` | UI-ONLY | kit showcase, public |
| console (inside client project) | `/console` (password gate), `/console/recoveries`, `/console/recoveries/[id]`, `/console/clients`, `/console/proofs`, `/console/alerts`, `/console/calls` | MOCK-LOCAL (server memory) | password check is real (`CONSOLE_PASSWORD`, HMAC cookie, fails closed); data is `globalThis` seed, per serverless instance |
| client API | `GET /api/public-config` | REAL | returns `{allowNoPrf}` from `ALLOW_NO_PRF`. Untracked file |
| client API | all of CDC A.1 (auth, me, kyc, account, device, lawyer, wallet, mpc, tx, swissquote, recovery, exit-kit, dapp, alerts) | **STUB (absent)** | zero of ~45 routes exist |
| lawyer | `/` , `/login`, `/invite/[token]`, `/invite/[token]/account` (L1-L3) | MOCK-LOCAL | any token is valid except `expired` and `used` |
| lawyer | `/dashboard`, `/requests`, `/requests/[id]`, `/clients`, `/clients/[id]/policy`, `/journal`, `/legal`, `/legal/[doc]` | MOCK-LOCAL | seeded: 2 clients, 7 requests, 20 journal entries, fixed "14 automatic decisions, 37.00 USDC" |
| lawyer | `/dev/ui` | UI-ONLY | |
| lawyer API | `GET /api/node/health` | REAL (build check) | only proves the WASM package resolves. Comment says remove it later |
| lawyer API | all of CDC A.2 (invite, webauthn, lawyer/*, policy/*, node/*, recovery/*, exit/*, audit/verify) | **STUB (absent)** | zero of ~40 routes exist |
| sq-mock | everything (A.3) | **STUB (absent)** | folder has `README.md`, `.env.example`, `sql/001_init.sql`, `src/shared/constants.ts` only |
| exit | `npm run exit` | **STUB (absent)** | README + shared constants only; no script, no `package.json` script |
| spike | M0 test | **STUB (absent)** | README only |

### 1.3 `lib/sqkeys.ts` (client contract, annex D.1): 28 functions + 2 helpers

Mock mode: MOCK-LOCAL for all (sessionStorage `sqkeys.mock.v1`, per tab). Live mode: STUB for all. "Needs" lists what the live body must call.

| Function | Mock does | Live needs (route, CDC A.1) |
|---|---|---|
| `loginSwissquote` | accepts one hard-coded demo client | `POST /auth/login` -> sq-mock `/login`, JWT cookie |
| `logout` | flag | `POST /auth/logout` |
| `runKyc` | 3 timed steps | `POST /kyc` -> sq-mock |
| `registerAccount` | checks 4 consents, stores in memory | `POST /account/register` |
| `createDevicePasskey` | **timer, no WebAuthn** | WebAuthn + PRF (`lib/passkey/webauthn.ts`) + `POST /device/register` |
| `inviteLawyer` | random token, **URL hard-coded `http://localhost:3001/invite/<token>`** | `POST /lawyer/invite` -> lawyer `/invite/register` (HMAC); URL from `LAWYER_ORIGIN` |
| `getLawyerStatus` | timer flips to accepted after 8 s | `GET /lawyer/status`; lawyer calls back `/internal/lawyer-accepted` |
| `createWallet` | 6 timed steps, random address | DKG (P1 in browser) + ownership proof + gas |
| `getAccount` | memory | `GET /me` |
| `getBalance` | memory | `GET /balance` (RPC) |
| `checkTransfer` | local `evaluatePolicy` | `POST /tx/check` (screen + `policy/preview`) |
| `sendUsdc` | local state machine, fake hash | propose, poll, sign (MPC), broadcast |
| `getTx`, `cancelTx` | memory | `GET /tx/{id}`, `POST /tx/{id}/cancel` |
| `getActivity`, `getAlerts` | memory | `GET /activity`, `GET /alerts` |
| `getSwissquoteAccount`, `transferFromSwissquote` | CHF arithmetic, fake hash | sq-mock `/bank-account`, `/transfer-to-wallet` |
| `simulateApp`, `approveApp` | two known fake apps | `POST /dapp/simulate` + same path as `sendUsdc` |
| `createExitKit` | JSON stub, no key material | build in browser from P1 + P2 data |
| `revokeDevice` | memory | route to add (not in A.1) |
| `startRecovery`, `verifyIdentity`, `createRecoveryWallet`, `getRecovery`, `cancelRecovery`, `executeRecovery` | timers; `executeRecovery` swaps the address field | A.1 recovery routes + sq-mock + lawyer + P2+P3 sweep |
| `toBase`, `fromBase` | pure, tested | already REAL |

### 1.4 `lawyer/lib/lawyerApi.ts` (annex D.2): 12 functions

Mock mode: MOCK-LOCAL (module-level object in the browser tab; **lost on every reload**). Live: first two are real WebAuthn calls to absent routes, the rest STUB.

| Function | Mock | Live needs |
|---|---|---|
| `inspectInvitation` | any token valid, always shows "Léa Martin" | `POST /invite/inspect` |
| `acceptInvitation` | 800 ms timer | `register/options` + `register/verify` (code in `lib/passkey.ts`, routes absent) |
| `login` | timer | `login/options` + `login/verify` (same) |
| `getMe`, `getClients`, `getRequests`, `getRequest` | seeded data | `GET /lawyer/*` |
| `decide` | timer "passkey", mutates local store | `requests/{id}/challenge` + passkey assertion + `/decide` |
| `getPolicy`, `updatePolicy` | local, version conflict logic | `GET/PUT /lawyer/clients/{id}/policy` + passkey |
| `getJournal`, `verifyAudit` | fake chained hashes, always `ok: true` | `GET /lawyer/journal`, `/audit/verify` (real hash chain, 8.6) |

### 1.5 Supabase tables the code actually reads or writes

| Project | Tables read or written by code today |
|---|---|
| client (`sq-keys-app`) | **none.** `@supabase/supabase-js` is a dependency; the only file mentioning "supabase" is `scripts/setup-env.ts` (env writer) |
| lawyer (`sq-keys-lawyer`) | **none** |
| sq-mock (`sq-keys-mock`) | **none** (no code) |

Schemas exist (`sql/001_init.sql` 9 tables, `lawyer/sql/001_init.sql` 17 tables, `sq-mock/sql/001_init.sql` 13 tables, RLS on, no policy). I could not check whether they were actually run in the Supabase projects. Also not implemented anywhere: HMAC (`shared/` contains only `constants.ts`), `seen_nonces` handling, JWT sessions (`jose` unused), `viem` (unused), `@simplewebauthn/server` (unused), the policy engine on a server (a faithful pure `evaluatePolicy` exists only in `lib/sqkeys.mock.policy.ts`, 96 lines, with 99 lines of tests: reusable).

---

## 2. The cross-origin problem

Three origins (`sq-keys`, `sq-keys-lawyer`, sq-mock) plus, in the client project, `/console`. In mock mode each keeps its state in a place the others cannot see: client = `sessionStorage` of **one tab**; lawyer = a JS object in **one tab**; console = memory of **one serverless instance**.

| Journey step | What it depends on today | Works between two devices? |
|---|---|---|
| Client opens the app in a second tab, or from a QR/share link | `sessionStorage` is per tab, so a new tab is a blank account | **No** (also breaks single-device flows that open a new tab) |
| Invitation created | token + `localhost:3001` URL in client `sessionStorage`. Lawyer `inspectInvitation` accepts any token | **No**: the link points to localhost; once fixed, the lawyer portal still never checks the token |
| Invitation accepted, client sees "Your lawyer accepted" | client-side 8 s timer (`autoLawyer`), nothing from the lawyer site | **No**: it "works" only by coincidence of the timer, and never if the panel switch is off |
| Transfer above threshold becomes a request on the lawyer screen | lawyer store is seeded (`req_01`..`req_07`); client requests are `req_<random>` in a different tab | **No** |
| Lawyer approves, client continues | client timer approves after 8 s; lawyer's `decide` mutates only the lawyer tab | **No** |
| Lawyer's own state (decisions, policy changes, journal) | JS object in the tab, reset on reload, not shared between two lawyer devices | **No** (even same device after reload) |
| Recovery request visible to lawyer, alert to the lawyer | lawyer sees seeded `req_03` only; client recovery lives in its tab | **No** |
| Identity check result (attacker scene) | client reads `panel.identityPass` from its own `sessionStorage`; console toggle writes a separate server-memory `Store` | **No**: toggling "next check: fail" in the console has no effect on the client |
| Console actions (send identity check, co-sign release) | `globalThis.__sqConsoleStore` seeded per instance; on Vercel each instance and each cold start has its own copy | **No** (and unreliable even for the console alone) |
| Recovery delay (2 min) | `releaseAfter` in client `sessionStorage`; mock P3 does not exist | **No** (works inside one tab only) |
| P1 stored in IndexedDB of the client site | not implemented yet; by design invisible to other sites | n/a (correct by design) |
| Time-driven progress (signing, expiry) | computed lazily from timestamps in the same tab, so reload-safe | works inside one tab only |

Conclusion: every scene that has a second actor (lawyer, Swissquote, console) is impossible between devices until a shared server holds the state (section 7).

---

## 3. Journey by journey

Format: works now / faked / broken / smallest change for live. Modes: `NEXT_PUBLIC_SQKEYS_MODE` (`mock` default, `live`), `NEXT_PUBLIC_LAWYER_MODE` (`mock` default, `live`).

### 3.0 Production URLs (HTTP status only, 2026-10-10 ~23:12)

| URL | Status | | URL | Status |
|---|---|---|---|---|
| `sq-keys-iota.vercel.app/` | 200 | | `sq-keys-lawyer.vercel.app/` | 200 |
| `/home` | 200 | | `/login` | 200 |
| `/login` | **404** | | `/invite/test` | **404** |
| `/key`, `/send`, `/lawyer`, `/security`, `/recovery`, `/legal/terms` | **404** | | `/dashboard`, `/requests`, `/clients`, `/journal`, `/legal` | **404** |
| `/console`, `/console/recoveries` | **404** | | `/invite/abc/account` | **404** |
| `/dev/mock`, `/dev/ui` | 404 | | `/api/node/health` | **404** |
| `/api/me`, `/api/public-config` | 404 | | `/api/invite/inspect` | 404 |

All of these routes exist in the current code, so **both deployments predate the UI work** (rule 9 says each step is deployed and checked on production before the next). `/api/node/health` returning 404 on the lawyer site also means the CDC spike item S5 (node WASM in a Vercel function) has not been verified in production. Which mode the last deploy was built with is unknown from here; check with `npx vercel env ls` (names only).

Smallest change: `npx vercel --prod` from the root and from `lawyer/` on the current branch, then curl the routes above. 30 minutes. `vercel.json` (`fra1`) is untracked in both folders: commit it.

### 3.1 J1 Create wallet

- Works (mock, one tab): login with the single hard-coded demo account, KYC steps, 4 consents, "passkey", invite, auto-accept, 6 wallet steps, active account with `0.0010` fake ETH.
- Faked: KYC, consents (not stored), passkey (timer), lawyer acceptance (timer), DKG (random 20-byte address), P1 saved (nothing saved), ownership proof, gas.
- Broken: invitation URL is `localhost:3001`; lawyer cannot accept a real invitation; `createWallet` has no MPC.
- Smallest change for live: (1) client `/api/auth/login`, `/me`, `/lawyer/invite`, `/lawyer/status`, `/internal/lawyer-accepted` and lawyer `/api/invite/register`, `/inspect`, `/webauthn/register/*` (section 7, slice S1); (2) wire `createDevicePasskey` to `lib/passkey/webauthn.ts`; (3) DKG: only after the MPC decision. Until DKG exists, `createWallet` must not invent an address: use the Safe address or show the step as Simulated.

### 3.2 J2 Fund from Swissquote

- Works: CHF/USDC arithmetic, 10 USDC and 3 per day limits (UI copy matches annex F.4).
- Faked: everything, including the tx hash and its `sepolia.basescan.org/tx/<hash>` link (**the link leads to "transaction not found" in front of a jury**).
- Smallest change: sq-mock `/api/login`, `/bank-account`, `/transfer-to-wallet` with a funded demo EOA (viem), env `SQ_DEMO_WALLET_PRIVATE_KEY` (name exists in `sq-mock/.env.example`). Needs a wallet address first, so it depends on J1. Interim: pre-fund the demo wallet address from a faucet and hide the CHF transfer, or label it Simulated and drop the explorer link.

### 3.3 J3 Scene 1: send 2 USDC, instant

- Works: policy preview and decision logic (`evaluatePolicy` mock, tests T1-T13 style), status machine `evaluating -> approved -> signing -> broadcast -> confirmed`.
- Faked: signing and broadcast, hash, explorer URL, balance change (subtracts in memory).
- Broken: needs a real signature and `eth_sendRawTransaction`.
- Smallest change: client `/api/tx/propose` + lawyer `/api/policy/request` returning `AUTO`, then the signing path (MPC P1+P2 or Safe). Without the signing path this scene cannot be shown on chain, which the Swissquote brief requires ("sign a transaction sent on the blockchain").

### 3.4 J4 Scene 2: 8 USDC, lawyer approves

- Works (one tab): `LAWYER` outcome, 8 s timer approves, flow continues.
- Faked: the lawyer. Lawyer portal shows unrelated seeded requests.
- Broken: request does not reach the lawyer; decision does not return; the lawyer's "passkey" is an 800 ms timer; no challenge bound to `intentHash` (CDC 5.4).
- Smallest change: slice S2 (section 7): `policy/request` creates `approval_requests` + `decisions`; lawyer lists from DB (5 s polling already in `usePolling`); `decide` verifies a WebAuthn assertion; client `GET /tx/{id}` (3 s) reads lawyer status over HMAC. Then the same signing path as J3.

### 3.5 J5 Scene 3: lost phone, recovery, delay, sweep

- Works (one tab): identity (switch in `/dev/mock`), lawyer auto-approval after 8 s, 120 s delay, address swap.
- Faked: all of it; no second key generation, no sweep.
- Broken: three origins unconnected; no `recoveries` rows; no P3.
- Smallest change: slice S3. Sweep itself needs MPC P2+P3 (6 rounds, `maxDuration = 60`) or, on the Safe path, `swapOwner` signed by the two node EOAs. This is the most expensive scene; see the cut order in 6.4.

### 3.6 J6 Bonus: attacker refused

- Works: console UI and `deriveRecovery` logic are tested; the toggle exists.
- Broken: console store is not the store the client reads (section 2). In the demo the presenter would toggle "fail" and nothing would change on the phone.
- Smallest change: `verifyIdentity` live calls sq-mock `/recovery/identity/verify`, whose result comes from `clients.identity_outcome`; the console writes the same column. Théotime owns sq-mock; the console UI keeps its pages but its `lib/console.mock.ts` functions become fetches to sq-mock `/api/console/*` (annex A.3, `CONSOLE_PASSWORD`). ~1.5 h once sq-mock exists.

### 3.7 J7 Exit

- `exit/` has no script. The CDC allows video V4 as fallback; recording needs a working kit and lawyer node, so realistically V4 is a pre-recorded screen of the script against the lawyer node, which depends on slice S4. Treat as P1; show honestly as "video".

### 3.8 J8 Console

- Mock data resets whenever Vercel starts a new instance. For the demo, move state to sq-mock tables (above). The password gate is correct and can stay.

---

## 4. Passkeys

Files reviewed: `lib/passkey/helpers.ts` (pure), `lib/passkey/webauthn.ts` (browser), `lib/passkey/helpers.test.ts`, `app/(mobile)/key/page.tsx`, `lawyer/lib/passkey.ts`, `app/api/public-config/route.ts`. State: new files, untracked, 23:11-23:12.

**The headline defect: nothing calls the new layer.** `app/(mobile)/key/page.tsx` still calls `createDevicePasskey` (mock timer). No file outside `lib/passkey/` imports `webauthn.ts`; `detectInAppBrowser`, `interpretCapabilities`, `rpIdProblem` are not used by any screen. The S6 test (PRF on the Honor Magic) has therefore not been exercised from the app.

What is correct (keep):
- User activation: `createPasskey` and `getPasskey` are deliberately non-async and call `navigator.credentials.*` first, with the challenge prepared on mount. This is the right pattern for Safari.
- `rpId = location.hostname` (not hard-coded); `userVerification: "required"`, `residentKey: "required"`, `authenticatorAttachment: "platform"`, ES256 + RS256, `attestation: "none"`, 60 s timeout, `excludeCredentials`.
- PRF flow handles the three outcomes (`ready`, `needs_second_tap`, `unsupported`); HKDF-SHA256 -> AES-256-GCM, non-extractable key; PRF bytes are never logged; `/api/public-config` exposes only a boolean for `ALLOW_NO_PRF`.

Defects and risks, most important first:

| # | Defect | Why it matters | Fix |
|---|---|---|---|
| W1 | `createDevicePasskey` / C4 not wired to `webauthn.ts`; no `POST /device/register` | no real passkey is ever created in the app | wire C4: probe on mount, tap -> `createPasskey`, then register device |
| W2 | `needs_second_tap`: no UI for the second tap | on platforms that return `prf.enabled` without `results` at creation, `get()` needs a fresh user gesture. If the code chains it automatically, Safari/Chrome reject (`NotAllowedError`) | show a second button ("Confirm again") |
| W3 | `userId` is `randomBytes(16)` on every `prepareChallenge()` | with `residentKey: required`, a retry creates a **second discoverable credential** for the same person; `excludeCredentials` only knows ids in `localStorage` | derive `user.id` from the account (server-issued, e.g. random per account stored in `accounts`), reuse on retry |
| W4 | Credential ids only in `localStorage` | cleared site data or another profile loses the id, `allowCredentials` falls back to empty (discoverable) and a **different** credential gives a different PRF output, so P1 does not decrypt | list credential ids from the server (`/me` devices) and pass them to `get()` |
| W5 | `allowCredentials[].transports = ["internal"]` | can hide synced or hybrid passkeys | omit `transports` |
| W6 | Challenge is local random bytes, no server round trip | acceptable for P1 wrapping (the PRF output is what protects the key; nobody verifies an attestation, and CDC A.1 `device/register` does not ask for one). Do not present the phone passkey as proof of identity | accept, or fetch options from the server on mount |
| W7 | In-app and unsupported browsers not detected on screen | QR codes opened from WhatsApp, Instagram, a webview: passkeys fail with `SecurityError`/`NotSupportedError` | call `detectInAppBrowser` + `interpretCapabilities` on `/login` and `/key` and show an "Open in Chrome/Safari" banner |
| W8 | `rpId` is the exact hostname | a passkey made on `sq-keys-iota.vercel.app` is invisible on any other host: preview URLs (`sq-keys-git-...vercel.app`), `localhost`, a deployment URL. CDC 11.2 says create passkeys in advance on the production domain | demo only on the two fixed domains; write it on the rehearsal checklist |
| W9 | After lawyer approval, the client must unwrap P1 | `get()` with PRF needs a gesture on iOS; if the waiting screen auto-continues after the lawyer approves, there is no tap | unlock P1 at the "Send" tap (review screen) and keep the key in memory for the wait, or add a "Confirm with Face ID" button when `approved`. No contract change |
| W10 | Honor Magic: default browser is not Chrome, and PRF support depends on the credential provider | the demo script uses the Honor Magic; S6 is untested | test now on that phone with Chrome and with the default browser; decide whether to use `ALLOW_NO_PRF=true` (reduced protection, must be labeled) |
| W11 | Fallback key in IndexedDB is gated by app code only | acceptable if shown as "Reduced protection" (CDC 4.4); never silent | already coded as such; make sure the UI shows it |

Lawyer side (`lawyer/lib/passkey.ts`): client code is reasonable (`@simplewebauthn/browser`, `browserSupportsWebAuthn`, error mapping). The **server half does not exist**: no `/api/webauthn/register|login/{options,verify}`. Server requirements to state for Aaron: `rpID = sq-keys-lawyer.vercel.app` from `LAWYER_ORIGIN`, `origin` check, `userVerification: required`, `residentKey: required`, challenge stored 5 min in `webauthn_challenges`, session cookie after verify. The approval ceremony (`decide`, `updatePolicy`) must use a server-computed challenge (`SHA-256("sqkeys-approval-v1" || requestId || intentHash || decision)`, CDC 5.4): the options fetch happens right before `startAuthentication` inside the click handler. Théotime should play the lawyer in desktop Chrome (a separate profile is enough, but passkey and session are per profile).

Also: nothing here touches P1 storage yet (`IndexedDB sqkeys`, wrapped key). `fallback` uses a different DB (`sqkeys-fallback`). Make sure the final P1 store and the `exit kit` agree on the wrapping labels (`sqkeys/prf-salt/v1`, `sqkeys/p1-wrapping-key/v1`): changing either breaks every existing wrapped P1.

---

## 5. Deployment readiness

### 5.1 Environment variables: names read by code vs `.env.example`

Variables actually read by code today (everything else in the examples is unused):

| Name | Read in | In `.env.example`? |
|---|---|---|
| `NEXT_PUBLIC_SQKEYS_MODE` | `lib/sqkeys.mode.ts` | yes |
| `CONSOLE_PASSWORD` | `lib/console.auth.ts` | yes (client) |
| `ALLOW_NO_PRF` | `app/api/public-config/route.ts` | yes |
| `NODE_ENV` | `lib/console.auth.ts` | n/a |
| `RPC_URL`, `USDC_ADDRESS` | `scripts/check-chain.ts` only | yes |
| `NEXT_PUBLIC_LAWYER_MODE` | `lawyer/lib/lawyerApi.ts`, `passkey.ts` | **no** (lawyer example and `.env.local` both lack it) |

Names locally in `.env.local` vs example: root and lawyer and sq-mock match their examples. `SQ_URL` is present but **empty** in the root `.env.local` (sq-mock not deployed or not yet pointed at). I did not read any value, and I did not check the Vercel dashboards.

Unused so far, so nothing to flag yet, but they will be missing in Vercel unless added when the code arrives: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LAWYER_URL`, `SQ_URL`, `APP_TO_LAWYER_SECRET`, `APP_TO_SQ_SECRET`, `LAWYER_SHARE_ENC_KEY(_VERSION)`, `LAWYER_ORIGIN`, `APP_URL`, the TTL/delay variables, `SQ_*` keys. Annex C also lists `NEXT_PUBLIC_EXPLORER_URL`: it is in the root example but **not read** (the explorer URL is hard-coded in the mock).

### 5.2 Variables on the client that should be server-only

None found. `NEXT_PUBLIC_` variables are only `SQKEYS_MODE`, `LAWYER_MODE`, `CHAIN_ID`, `EXPLORER_URL`: none is a secret. `ALLOW_NO_PRF` correctly stays server-side behind a boolean route. Watch-outs for when the backend lands: `CONSOLE_PASSWORD` lives in the **client** Vercel project (console is `app/console`), so the client project holds one Swissquote-side secret; acceptable for the prototype but it blurs rule 3 (the CDC puts the console in sq-mock). When the console moves to fetching from sq-mock, the password should live with sq-mock.

### 5.3 Hard-coded URLs and hosts

| File | Hard-coded | Fix |
|---|---|---|
| `lib/sqkeys.mock.ts:458` | `http://localhost:3001/invite/<token>` | server returns it from `LAWYER_ORIGIN` (CDC 3.1: URLs from env, never hard-coded) |
| `lib/sqkeys.mock.ts:25` | `https://sepolia.basescan.org/tx/` | read `NEXT_PUBLIC_EXPLORER_URL` |
| `scripts/check-chain.ts:5` | default RPC `https://sepolia.base.org` | fine for a script |
| `lib/passkey/helpers.ts` | message strings mention `localhost` | text only |

No production URL is hard-coded in components.

### 5.4 Other deployment findings

- `.gitignore` working copy now has `.env*` (also in `lawyer/.gitignore`). That pattern also matches `.env.example`: tracked ones stay tracked, but any new `.env.example` (for example for `exit/`) will be silently ignored. Use `.env.local` and `.env*.local`, or add `!.env.example`.
- `NEXT_PUBLIC_*_MODE` is build-time: see 1.1.
- `/dev/mock` and `/dev/ui` are public in mock mode. Fine for rehearsal, remove or gate before the jury sees the URL.
- Console state on Vercel: see section 2.
- Lawyer `next.config.ts` already traces the node `.wasm` into `/api/**`; root uses `--webpack` for browser WASM. Neither is proven in production (health route 404 on the deployed lawyer site).
- Security headers are set (`nosniff`, `no-referrer`, `DENY`); no CORS header anywhere (matches 3.10).
- `scripts/doctor.ts` exists: run it first thing in each session.

---

## 6. Plan

Estimates are person-hours for a developer who knows the CDC. "Contract" = changes a signature or type in `lib/sqkeys.ts` / `lawyerApi.ts` (CLAUDE.md: never change alone).

### 6.1 P0: demo blockers

| ID | Item | Owner | h | Depends on | Contract? |
|---|---|---|---|---|---|
| P0-1 | Redeploy both sites from the current branch, set `NEXT_PUBLIC_*_MODE` explicitly, commit `vercel.json`, curl every route in 3.0 | Téo | 0.5 | none | no |
| P0-2 | MPC status report + go/no-go (6.3) | Aaron | 0.5 | none | no |
| P0-3 | Shared state backend, slices S1 and S2 (section 7): HMAC lib, sessions, lawyer routes, client routes | Aaron | 7 | P0-2 only for signing | no |
| P0-4 | Live bodies for `lib/sqkeys.ts` and `lawyerApi.ts` (thin `fetch` wrappers following annex A). CLAUDE.md says Aaron swaps bodies: needs Aaron's OK for Téo to do it in parallel | Téo | 3 | route shapes frozen (1 h after P0-3 starts) | no (signatures kept) |
| P0-5 | Real passkey on C4 (W1, W2, W3, W4, W7) and lawyer WebAuthn server routes + approval ceremony | Téo (client) / Aaron (server, inside P0-3) | 2 / 2 | P0-3 for server part | no |
| P0-6 | sq-mock minimal: `/login`, `/kyc`, `/bank-account`, `/recovery/identity/{start,verify}`, `/recovery/{status,cancel}`, console read routes + identity toggle, HMAC verify | Théotime | 4 | HMAC lib (P0-3, 1 h) | no |
| P0-7 | Signing path on chain (MPC P1+P2, or Safe) for scenes 1 and 2 | Aaron | 4 to 6 | P0-2 | no |
| P0-8 | Honesty pass: Simulated pill on anything still faked, no explorer link for a fake hash, no random address presented as a wallet, remove `/dev/*` from the jury path | Téo | 1 | none | maybe: an optional `simulated?: boolean` on `TxView` (additive) would let the server drive pills; needs team sign-off |
| P0-9 | Console reads and writes sq-mock (identity toggle visible to the phone) | Théotime + Téo | 1.5 | P0-6 | no |

### 6.2 P1: important for the score

| ID | Item | Owner | h | Depends on | Contract? |
|---|---|---|---|---|---|
| P1-1 | Recovery slice S3 end to end (identity, lawyer approval, delay, sweep or `swapOwner`) | Aaron + Théotime | 5 | P0-3, P0-6, P0-7 | no |
| P1-2 | `exit/` script + lawyer `/exit/*` routes (slice S4), kit built in browser | Théotime (script) / Aaron (routes) | 3 / 1.5 | P1-1 | no |
| P1-3 | Real Swissquote transfer + gas drip + sanctions list | Théotime | 3 | wallet address | no |
| P1-4 | Policy engine server-side (move `sqkeys.mock.policy.ts` to `shared/`, add `commit_decision` atomicity) and journal hash chain with `verifyAudit` | Aaron | 2.5 | P0-3 | no |
| P1-5 | Honor Magic passkey test (S6) and decision on `ALLOW_NO_PRF` | Téo + Aaron | 1 | P0-5 | no |
| P1-6 | Backup videos V1-V5 recorded on the final deployment | Théotime | 2 | after freeze | no |
| P1-7 | Rehearsals on two devices, two profiles | all | 1.5 | freeze | no |

### 6.3 Is the real MPC path at risk? Should the Safe fallback be triggered?

Facts: M0 (DKG over HTTP, pair signatures, real tx on Base Sepolia, PRF on the Honor Magic) had a decision gate at 20:00. In the repo: `spike/` is a README, `lib/mpc/client.ts` is a loader stub, the lawyer app has only a health route, `exit/` and `sq-mock/` have no code, and no production check of the node WASM exists. Remaining after the shared backend: DKG (3 parties, rounds over HTTP, P1 encrypted in IndexedDB), P1+P2 signing, `yParity`/S normalisation, P2+P3 sweep, `initLostShareRecovery` question (S7), plus the 60-second Vercel function budget for the sweep.

Assessment: **high risk.** Nothing visible supports the "MPC real" branch, and the CDC's own rule is that S1, S2, S4 or S5 failing at the gate means plan B.

Recommendation:
1. Within 30 minutes, Aaron reports S1 to S5 as pass/fail/not run (CDC 15.2). If S1 (3-party DKG over HTTP) and S2 (a pair signature accepted by Base Sepolia) are not both already proven, **trigger the Safe 2-of-3 plan now**.
2. If Aaron says they are "almost there", the hard deadline is **00:30**. A Safe path (owners = client passkey signer, lawyer EOA, Swissquote EOA; threshold 2; `swapOwner` for recovery; gas via Candide) needs roughly 5 h and cannot start later than that without eating the freeze.
3. Either way the shared backend (P0-3, P0-6) is the same work and should start immediately. The Safe path reuses the screens, the policy engine, the portal, and changes only the inside of `lib/sqkeys.ts` and the node signing (CDC 3.9, says it explicitly). It satisfies the Swissquote brief (Safe is named as an example library) and the demo requirement of a real on-chain transaction, but 3.8 "MPC: Real" and the DKLs23 answer in 11.3 must be changed to say Safe, honestly.
4. If neither path yields a real signature by about 03:00, stop and tell the team: the fallback of last resort is a demo with real shared state and a clearly labeled Simulated on-chain step plus a recorded video. It does not meet the brief's "send on the blockchain" and the jury must be told. This is a team decision, not something to drift into.

### 6.4 Cut order if time runs out (aligned with CDC 12.2)

Keep: shared backend, passkeys, scene 1, scene 2, attacker refusal. Cut first: exit in app (keep video), cancellation by client, app approvals (C16), detailed journal page (keep `verifyAudit`), real Swissquote transfer (pre-fund the wallet instead and say so), the recovery sweep itself (keep refusal of the attacker, which needs only identity + lawyer + console; show the sweep as video).

### 6.5 Suggested clock (rest is the team's call, but the critical path does not fit in 05:00-08:30 alone)

| Time | Aaron | Théotime | Téo |
|---|---|---|---|
| 23:15-00:30 | MPC report, HMAC lib, lawyer invite + webauthn routes | sq-mock skeleton, `/login`, `/kyc`, HMAC verify | P0-1 deploy, P0-8 honesty, W1-W4, W7 |
| 00:30 | **Decision: MPC or Safe** | | |
| 00:30-03:00 | client routes, `policy/*`, decide + challenge | identity routes, console routes | P0-4 live wrappers, tests against routes |
| 03:00-03:30 | rehearsal 1 on two devices (invite, 2 USDC, 8 USDC) | | |
| 03:30-05:00 | signing path | sq-mock transfer/gas, console link | passkey on Honor Magic, polish |
| 05:00-08:30 | recovery, exit routes | `exit/`, videos | recovery screens on live, accessibility |
| 08:30 | freeze | | |

---

## 7. Minimum shared backend (works before MPC is ready)

Principle (CDC 3.10, 7.4, S-6): the three Supabase projects stay separate. The browsers never talk to each other. Shared state is created by **server to server HMAC calls** plus **polling** (client every 3 s, lawyer every 5 s, both already in the UI). The lawyer portal is the source of truth for requests and decisions; sq-mock for identity and recovery delay; the client keeps a mirror (`tx_requests`) and its own session.

### 7.1 Shared code to write once (`shared/`, then `npm run sync-shared`)

- `shared/hmac.ts`: sign and verify per 3.10 (`x-sq-ts`, `x-sq-nonce`, `x-sq-sig` = HMAC-SHA256 over `method \n path \n ts \n nonce \n SHA256(body)`); reject skew over 60 s; insert nonce in `seen_nonces` (unique violation = replay); one secret per pair (`APP_TO_LAWYER_SECRET`, `APP_TO_SQ_SECRET`). Unit test U7.
- `shared/policy.ts`: move `evaluatePolicy` from `lib/sqkeys.mock.policy.ts`, used by the lawyer server for `preview` and `request`.
- Session helper with `jose` (cookie JWT, 8 h, `HttpOnly; Secure; SameSite=Lax`) for client and lawyer.
- Error envelope `{ error: { code, message } }` (A conventions).

### 7.2 Slices, in order, each testable on two devices

**S1: invitation (client -> lawyer -> client).**
Client routes: `POST /api/auth/login` (calls sq-mock `/login`), `GET /api/me`, `POST /api/lawyer/invite`, `GET /api/lawyer/status`, `POST /api/internal/lawyer-accepted` (HMAC), plus `kyc`, `account/register`, `device/register` (can be thin).
Lawyer routes: `POST /api/invite/register` (HMAC), `POST /api/invite/inspect`, `POST /api/webauthn/register/{options,verify}`, `login/{options,verify}`; on verify: create lawyer, passkey, bind client, create default policy, session, then call the client `lawyer-accepted`.
Tables: client `accounts`, `invitations`, `consents`, `devices`, `seen_nonces`. Lawyer `lawyers`, `lawyer_passkeys`, `clients`, `invitations`, `webauthn_challenges`, `policies`, `policy_state`, `recipients`, `audit_log`, `seen_nonces`. sq-mock `clients`, `seen_nonces`.
Result: J1 up to "Your lawyer accepted" is real across devices.

**S2: transfer request and decision.**
Lawyer routes: `POST /api/policy/{preview,request,cancel}`, `GET /api/policy/request/{id}` (HMAC), `GET /api/lawyer/{me,clients,requests,requests/[id],journal}`, `POST /api/lawyer/requests/{id}/{challenge,decide}`, `GET/PUT /api/lawyer/clients/{id}/policy` (+ challenge).
Client routes: `POST /api/tx/{check,propose}`, `GET /api/tx/{id}` (reads the lawyer status over HMAC), `POST /api/tx/{id}/cancel`, `GET /api/activity`, `GET /api/alerts`.
Tables: lawyer `approval_requests`, `decisions`, `recipients`, `policies`, `audit_log`, `webauthn_challenges`; client `tx_requests`, `alerts`.
Result: J3 decision and J4 are real across devices. Until signing exists, the final status must stay at `approved`/`signing` with a Simulated pill; **never fabricate a `txHash`**.

**S3: recovery and attacker.**
Client: `POST /api/recovery/start`, `/{id}/identity`, `/{id}` GET, `/{id}/cancel`. Lawyer: `POST /api/recovery/{request,status,cancel}` (creates `approval_requests` kind `recovery`, `recovery_cases`). sq-mock: `/api/recovery/identity/{start,verify}`, `/recovery/{cancel,status}`, `/alerts/call`, console routes (`GET /console/{clients,proofs,recoveries,alerts,calls}`, `POST /console/identity-outcome`).
Tables: client `recoveries`; lawyer `recovery_cases`, `approval_requests`; sq-mock `clients` (`identity_outcome`), `identity_checks`, `calls`, `compliance_alerts`, `audit_log`.
Result: J5 up to the delay, and J6 completely, are real across three origins. The sweep follows the custody decision.

**S4: exit (later).** Lawyer `exit_requests` + `POST /api/exit/request`, `GET /api/exit/{id}`; `exit/` polls with the one-time token.

Not needed yet: `mpc_sessions`, `node_sessions`, `shares`, `share_uses` (only for real MPC), `gas_drips`, `transfers`, `ownership_proofs`, `wallet_links`, `sanctioned_addresses` (P1).

### 7.3 Wiring and contract impact

- `lib/sqkeys.ts` live: each of the 28 bodies becomes `fetch('/api/...')` with `SqKeysError` mapping from `{error:{code,message}}`; `sendUsdc` keeps `onUpdate` by polling `GET /api/tx/{id}` every 3 s inside the function. `lawyerApi.ts` live: same for the 12 functions (`acceptInvitation`/`login` already call real WebAuthn). **No signature change is required.**
- Possible additive change, needs sign-off: optional `simulated?: boolean` on `TxView` / `Account` so the server can drive "Simulated" pills while a layer is still faked.
- Build once with `NEXT_PUBLIC_SQKEYS_MODE=live` and `NEXT_PUBLIC_LAWYER_MODE=live`; keep a second preview deployment in `mock` for UI work. Remember the modes are baked at build time.
- Env to add in Vercel (names): client `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LAWYER_URL`, `SQ_URL`, `APP_TO_LAWYER_SECRET`, `APP_TO_SQ_SECRET`; lawyer `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LAWYER_ORIGIN`, `APP_URL`, `APP_TO_LAWYER_SECRET`, the TTL and delay variables, `NEXT_PUBLIC_LAWYER_MODE`; sq-mock `SQ_SUPABASE_URL`, `SQ_SUPABASE_SERVICE_ROLE_KEY`, `APP_TO_SQ_SECRET`, `CONSOLE_PASSWORD`, `RECOVERY_DELAY_SECONDS`. Secrets are exchanged in person (CDC 3.10), never in chat.
- Before writing routes, confirm the three SQL files have actually been run in the three Supabase projects (I could not verify) and that RLS-with-no-policy is active.

---

## 8. Immediate questions for the team

1. Aaron: S1 to S5 results, and is anything unpushed?
2. Théotime: is `sq-keys-mock` deployed, and what is `SQ_URL`? Anything unpushed on `theotime/sq` (the remote branch has no sq-mock code)?
3. Team: OK for Téo to write the live `fetch` wrappers in `lib/sqkeys.ts` and `lawyerApi.ts` in parallel (CLAUDE.md assigns the bodies to Aaron)?
4. Team: accept the 00:30 MPC-or-Safe decision gate in 6.3?
