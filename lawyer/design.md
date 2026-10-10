# design.md: SQ Keys Lawyer portal (desktop first, usable at 390px)

**Direction (Téo): stay very close to the client app design.** Same tokens (`app/globals.css` is identical), same fonts (Outfit + Poppins), same orange #FA5B35, same pills, chips, rounded cards, same illustrations style. Do not invent a new look. The only addition is the desktop layout, borrowed from the Swissquote console mockups (`../docs/mockups/console/`): fixed left sidebar, top bar, table cards, timeline, countdown.

## 1. Layout
- Top strip (ink, white 12px uppercase, tracking): "Simulated lawyer (played by a team member)".
- Left sidebar 240px, white: logo area ("SQ Keys" in Outfit + small "Lawyer portal"), nav items with 20px lucide icons (Dashboard, Requests, Clients, Journal), active item = `brand-tint` pill with `warn` text (see console mockup), bottom block with the lawyer's name and avatar.
- Top bar: shield icon + "SQ Keys Lawyer portal" breadcrumb, pill "Testnet environment" (`info`), avatar.
- Content: page background `surface`, max 1100px, 24px gutters. Cards: white, 1px `line`, radius 24. Tables: header row `#FAFBFC` uppercase 12px muted, 64px rows, status chips.
- At 390px the sidebar collapses to a bottom TabBar like the client app.
- Info banner under the top bar on request screens (as in the console mockups, `info-bg`, lock icon): "Your approval applies to this exact amount and recipient only. You can never move funds alone."

## 2. Screens (CDC 7.3, F.6)
L1 Invitation, L2 Account + passkey, L3 Login: centered mobile-style card on `surface`, hero gradient header like the client app, same buttons.
L4 Dashboard (clients, pending counter, last decisions), L5 Requests (filter chips pending, approved, refused, expired), L6 Transfer request, L7 Recovery / Exit request, L8 Client policy, L9 Journal, L10 Legal.

- **L6**: left card "Request" (Amount, To, Why it needs you with reason chips, history with this recipient); right card "Your limits for this client" + checkbox "Add this recipient to known recipients" (checked) + `Approve with passkey` (primary) and `Decline with passkey` (secondary, danger text), same size. Note "Your approval applies to this exact amount and recipient only." Show the shortened intent hash.
- **L7** (follow console mockup 2/3): breadcrumb, title "Recovery of {date}", status chip, countdown pill "Time left 02:40", left card Timeline (5 steps with check/x/clock icons and times), right card with identity status, old and new wallet, advice "Contact the client by another channel (phone call) before approving.", buttons Approve / Decline / Cancel recovery equal size. Exit variant: title "Exit request without Swissquote" + "Destination address".
- **L8**: four numeric limits, switch for unknown recipients, recipients list, version history, diff before the passkey prompt.
- **L9**: journal table, badge "Journal integrity: OK" / "FAILED at entry {n}", button "Verify integrity", totals line without detail rows (CDC 7.1).

## 3. Rules
Passkey prompts always come with a plain sentence of what is approved. Empty state "No pending requests." Polling 5 s with "Updated 3 s ago". Everything in English. Components are copied into `lawyer/components/ui/` (never imported across projects) from the client versions so the two stay visually identical.
