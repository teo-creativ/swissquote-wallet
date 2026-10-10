# Contract change proposals (for Aaron)

Nothing in `lib/sqkeys.ts` or `lawyer/lib/lawyerApi.ts` was changed. These are proposals only. The mock already behaves as described, behind the same signatures.

## 1. Onboarding order: lawyer invitation BEFORE the phone passkey (team decision)

New order on the client: C1 login, C2 identity check, C3 documents, **C5 invite lawyer**, **C4 create my key (passkey)**, C6 three shares created together, C7 home.

Status values are unchanged. What changes is when each one is reached:

| Step | Account status after it |
|---|---|
| C3 `registerAccount` | `created` |
| C5 `inviteLawyer` | `awaiting_lawyer` |
| lawyer accepts | `ready_for_keys` (no device yet) |
| C4 `createDevicePasskey` | `ready_for_keys` (now with one device) |
| C6 `createWallet` | `creating_wallet`, then `active` |

What Aaron must check in the live implementation:
- `inviteLawyer` must not require a registered device (CDC 4.1 step 4 assumed the device existed). If it needs one for rate limiting, key it on the account instead.
- `createDevicePasskey` must work when the status is `ready_for_keys` and must NOT move the status.
- `createWallet` must require lawyer accepted AND at least one device, and return `LAWYER_NOT_ACCEPTED` otherwise (the mock does).
- `GET /me` / `getAccount` must keep returning `devices` so the front can tell "accepted, no key yet" (`/key`) from "accepted, key done" (`/creating`). The routing rule lives in `lib/onboarding.ts` (tested).

## 2. Passkey ceremony in live mode (user activation)

In mock mode the front runs the real WebAuthn ceremony (`lib/passkey/webauthn.ts`) before calling the mock `createDevicePasskey(label)`. In live mode the front only calls `createDevicePasskey(label)` and the contract owns the ceremony. Safari/iOS rejects `create()` / `get()` with `NotAllowedError` if any `await` sits between the tap and the call, so the live implementation must:
- take its server challenge BEFORE the tap, not inside `createDevicePasskey`;
- call `navigator.credentials.create()` first thing in that function (no `fetch` before it);
- handle the "PRF enabled but no result" case with a second, separate tap.

Proposed addition (new function, does not change an existing one):

```ts
export async function prepareDevicePasskey(): Promise<void>; // fetches the challenge on screen mount; createDevicePasskey then starts with no await
export async function confirmDevicePasskey(): Promise<Device>; // second tap when PRF is only enabled at creation
```

Until this is agreed, the helpers in `lib/passkey/` are the reference implementation: use them from the live code.

## 3. Reduced protection (`ALLOW_NO_PRF`)

New route `GET /api/public-config` returns `{ "allowNoPrf": boolean }` only. No contract function changed. If Aaron prefers it inside the contract, add `allowNoPrf` to `getAccount()`'s result instead. The front also needs the account to tell it which protection level was used (today it keeps `prf | reduced` in `localStorage`, UI only, not a security control).

## 4. DKG rounds on C6 (optional)

C6 shows three share cards with waiting / generating / stored. A live round counter ("round 2 of 5") needs more than `WalletStep`. Proposal: `createWallet(onProgress: (s: WalletStep, detail?: { round: number; of: number }) => void)`. The second argument is optional, so existing callers still compile. Until then no round number is shown.

## 5. Consent record on `getAccount()` (additive)

`Account` gets an optional field `consents?: { document: string; version: string; acceptedAt: string }[]` (`acceptedAt` is ISO 8601, UTC). The Security screen reads it to show "Accepted on ...". No function signature changed. In live mode `registerAccount` must store the server-side time of acceptance (never trust a client clock) together with the document version, and return the rows in `getAccount()`. The version label is `LEGAL_DOCUMENT_VERSION` in `lib/legalVersion.ts` ("1.0").
