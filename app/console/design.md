# design.md: Swissquote console (C21), simulated back-office, desktop

Source: 3 draft mockups by Téo (`docs/mockups/console/`). They are a first, rough version made for an earlier brief: **keep their direction, not every detail**. Téo gave full freedom to Claude on this part. Same design system as the rest (Outfit + Poppins, tokens in `app/globals.css`, orange #FA5B35), with the mockups' desktop structure.

## 1. What the console is for (CDC 6.2, 6.3, A.3 + Téo's brief)
The Swissquote operator's view of **recovery requests**. Core job: **send an identity check (KYC) to the client who asks for a recovery, see its result, and co-sign the recovery with Swissquote's owner key (P3) so the client's new key replaces the lost one** once all conditions are met. The KYC itself is **mocked** (no real provider). It must also let the team run the attacker demo by forcing the next identity check to pass or fail.

## 2. Layout (from mockups)
- Top strip, ink: "STUDENT PROTOTYPE · TESTNET · NO REAL FUNDS".
- Left sidebar 240px: Swissquote logo (`public/brand/swissquote-logo.svg`) + "Console (simulated)" + small caps "SQ KEYS · CORE CUSTODY". Nav: **Client wallets, Ownership proofs, Recoveries, Compliance alerts** (+ Calls log). Active item = `brand-tint` pill, `warn` text. Bottom: "Active operator" block (simulated: "Audit & Risk Officer", fake ID) with a Simulated pill.
- Top bar: shield + "SQ Keys Admin Console / Safe 2-of-3 smart account", pill "Testnet environment" (`info`), avatar.
- Permanent info banner (`info-bg`, lock icon), keep this idea, it is a strong demo message. Title "What Swissquote cannot do". Text: "Send or spend a client's funds. Take control of an account without the client's lawyer. Stop a client from cancelling a recovery."
- Content on `surface`, white cards radius 24, table header `#FAFBFC`.

## 3. Screens
**Recoveries (list)** (mockup 1). Title "Recoveries" + count pill "3 requests". Columns: Client (numbered badge + name), Requested at, **Identity check** (Verified / Failed / Pending / Not requested), **Lawyer approval** (Approved / Declined / Pending: replaces the mockup's "Kit de secours"), **Swissquote co-signature** (Signed / Not signed), **Time left** (live countdown). Row click opens the detail. Footer line: "Contestation window: 24 h in production (demo: 2 min)." Fix: the mockup shows the same client twice (0042), show each recovery once with its own id.
**Recovery detail** (mockups 2 and 3). Breadcrumb "Recoveries / Client 0042", title "Recovery of {date, time}", status chip (Pending / In progress / Blocked / Completed / Cancelled), countdown pill "Time left 02:40" (monospace digits).
- Left card **Timeline** (5 steps with check / x / clock icons): Request created from a new device; Identity check (simulated) with result chip; Lawyer approval; Swissquote co-signature; Safety delay started with the "Secure countdown" block. Bottom: linked cryptographic proof, shortened hash with copy.
- Right card **Swissquote action**: 
  1. Button **Send identity check** (new, from Téo's brief): sends the KYC request to the client (the client's app shows C18). Disabled once sent, shows "Sent at 15:21".
  2. Result block: Pending / Verified / Failed. A **demo switch "Next identity check: PASS / FAIL"** (big, text + icon + color) for the attacker scenario.
  3. Button **Co-sign the recovery** (the mockup's "Co-sign after identity verification"). Disabled with an explanatory line unless identity verified, lawyer approved, and delay elapsed ("Co-signing requires a successful identity check."). When done: green "Co-signed at 15:22". Fix: the mockup repeats this block twice.
  4. Reassurance line: "Swissquote cannot finish, cancel, or move the funds alone."
  5. Card **Owner key** (replaces "Clé MPC partagée"): Party "P3 (Swissquote)", Algorithm "Safe owner key · ECDSA secp256k1" (the live demo is a Safe 2-of-3 smart account, not MPC; the mockup says FROST-Ed25519), Operator, Timestamp, status "Signed and locked".
**Client wallets**: table (client id, display name, wallet address with copy, status, ownership proof verified). **Ownership proofs**: message, signature (shortened), verified yes/no, date. **Compliance alerts**: refused transfers to sanctioned addresses, recovery alerts. **Calls**: simulated Swissquote calls to clients.

## 4. Copywriting
English (CDC rule 6; the demo is in English). The mockup is in French: translate, keep the tone, and drop claims we cannot back: "Protocol v2.4", "Surveillance MPC active", "certified timestamp", "institutional co-signature policy", "48h in production" (CDC says 24 h). Pills and fake operator data carry "Simulated".

## 5. States and rules
Password gate (`CONSOLE_PASSWORD`, checked server-side). Data comes from sq-mock `/api/console/*` through server routes of this app (the browser never calls sq-mock). Mock mode reads `lib/console.mock.ts`. Countdowns tick client-side from `release_after`. Keyboard access, status = icon + text. The two actions **Send identity check** and **Co-sign the recovery** extend CDC annex A.3 (team decision): add the routes `POST /api/console/recoveries/{id}/identity-request` and `/cosign` in sq-mock. The nodes keep enforcing identity, lawyer approval and delay independently, the button never bypasses them.
