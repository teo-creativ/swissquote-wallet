# design.md: SQ Keys client app (mobile web, 390 x 844 reference)

Sources: 16 mockups by Téo (colors sampled from the PNGs) + the assets in `public/`. **Decision (Téo): the mockups win over the CDC for everything visual.** Copywriting: Claude may improve it to fit the CDC and the new scope, staying close to the tone of the mockups (short, direct, friendly, English). Where CDC annex F defines a text, use it; otherwise write in the same register.
Scope decision (Téo): **Base network only, USDC only.** ETH appears only as small "network fee" information.

## 1. Principles
- Mobile first. Column max 430px centered on desktop (`app/(mobile)/layout.tsx`). Gutters 16px. Secondary actions open a bottom sheet.
- Orange hero + lavender-grey surfaces + near-black ink. Everything rounded (pills, 24px cards, 32px sheets).
- One primary action per screen (orange pill). Cancel/refuse never hidden (CDC 9.9 #9).
- Simulated things carry a visible "Simulated" pill (CDC F.1). Footer line in the layout.
- Keyboard-complete, visible focus, status never color-only (icon + text on every chip).

## 2. Tokens (`app/globals.css`, Tailwind v4 `@theme`, identical in `lawyer/`)
| Token | Hex | Use |
|---|---|---|
| brand | #FA5B35 | **Swissquote orange. Buttons, hero, icons. Never change it.** |
| brand-light, hero-top, hero-bottom | #FB866B, #FF9D82, #F95E39 | Hero and welcome gradients (lighter at top) |
| brand-soft | #FFD9CF | Disabled button, tints |
| brand-tint | #FDEEEA | Active nav pill, soft highlights |
| surface | #F1F4FB | Inputs, row cards, secondary buttons, page background on desktop |
| ink | #262A33 | Titles, primary text, top strip |
| muted | #555C6B | Subtitles, captions |
| ok / ok-bg | #0F7B45 / #E7F5EE | Verified chips, success |
| warn / warn-bg | #A93518 / #FDE9E4 | Warning, Pending, Read chips (text one notch darker than brand so 11px text stays readable) |
| danger / danger-bg | #B42318 / #FDEDEC | Failed, destructive |
| info / info-bg | #1F5FBF / #EAF1FC | Information banners and pills (from the console mockups) |
| line | #E3E6EE | Dividers |
Dark pill (active tab, "Copy the invitation"): #474747 from the mockup.

Typography (confirmed by Téo): **Outfit** (headings, 600) and **Poppins** (body 400/500), self-hosted via `@fontsource*` (no Google request). Scale: display 32/36, screen title 28/32, section 22/28, body 16/24, small 14/20, caption 12/16, chip 11/14 medium. **Button label: 18px / 600** (counts as large text for contrast: white on #FA5B35 is 3.2:1, fine for large bold text only; never use small white text on orange).
Radius: pill 9999, card 24, hero 28, sheet top 32. Shadow only on tab bar and floating key card: `0 8px 24px rgba(38,42,51,.12)`. Motion 200 ms ease-out, honor `prefers-reduced-motion`.
Icons: `lucide-react`, stroke width 1.75 (matches the thin outline icons of the mockups); size 20 in rows, 24 in buttons.

## 3. Assets in the repo
| File | Use |
|---|---|
| `public/brand/swissquote-logo.svg` | Swissquote logo (provided). Login, splash, recovery screens, console sidebar. It wraps a raster, so keep it at <= 2x its natural size. The "SQ Keys" product name is set in Outfit next to it |
| `public/coins/usdc.svg` | USDC coin, created to match the glossy orange coins (vector, any size) |
| `public/coins/eth.png` | ETH coin (45px), only for the network-fee indicator |
| `public/illustrations/phone-key.png`, `phone-lawyer.png` | C4 / C5 showcase (phone with the row highlighted). **They contain baked text ("Secondary Key", BTC, CHF): re-export from Figma with "Phone key" / "Your lawyer" / USDC before the final demo** |
| `public/illustrations/hand-phone.png` | Splash / welcome screen (same remark: baked BTC UI) |
| `docs/assets-reference/` | BTC, Chainlink, XRP coins and the hero background with coins. **Not used** (scope is USDC only) |
Hero card = CSS gradient (`hero-top` to `hero-bottom`) + decorative USDC coins (and one ETH) positioned like the mockup, instead of the baked background.

## 4. Components (`components/ui/`, prompt client/01)
Button (primary / secondary / dark / ghost, icon, loading, disabled = brand-soft), IconButton (44px circle), Input (pill h-14, trailing slot for QR or "MAX"), StatusChip (verified | warning | pending | read | failed), RowCard, BottomSheet (white, 32px top radius, grabber, scrim, focus trap, Esc), HeroCard, TabBar (floating pill, active = dark circle), StepList, CheckHalo (green circle with glow), Spinner (orange arc), ReviewItem, KeyShowcase, SimulatedPill, Banner (info | warning | demo), PageShell, Logo, CoinIcon.

## 5. Screen map: mockup to CDC screen
| Mockup | CDC | Notes |
|---|---|---|
| Welcome "Your cryptos, your keys." | splash | Keep tagline. Replace "institutional-grade security" (unproven claim, CDC 9.9 #12) with a plain line, e.g. "Take control of your digital assets. Your lawyer and Swissquote can never move them alone." |
| Welcome back (login) | C1 | F.2 title "Sign in with your Swissquote account", button "Sign in", pill "Simulated Swissquote login", link "I've lost access to my wallet" (to C17) |
| (none) | C2 | Identity check steps with StepList |
| "Only you have control over your funds" | C3 | The sentence is inaccurate for a 2-of-3 model. Use "Before we start". Four separate **unchecked** checkboxes (the mockup shows pre-selected radios and a duplicated line), "Read" chips open C20. Continue disabled until all four ticked |
| Create a phone key | C4 | **Comes after C5 (team decision).** Keep the mockup title ("Create a phone key") and body, add the F.2 sentence that the key never leaves the phone. No-PRF error state |
| Invite your lawyer (+ sheet with link) | C5 | **Comes before C4 (team decision); Continue goes to C4.** In mock mode a dev button "Simulate lawyer accepting" (with a Simulated pill). "Secondary aggregator" becomes "Your lawyer". Sheet: link field, dark "Copy the invitation", share icon, Continue. Status "Waiting for your lawyer…" / "Your lawyer accepted." |
| Account being created (3 rows) | C5 waiting + C6 | C6 shows THREE share cards ("You, on this phone", "Your lawyer", "Swissquote"; waiting / generating / stored, Simulated pill where simulated) above the 7 steps of F.2, then the wallet address with copy + Basescan link. Fix the typo "inizialized" |
| Your account is ready | end of C6 | Button "Discover your wallet" |
| Home | C7 | Hero shows the USDC balance. Delta pill ("3.46% this week") only if real data. Account Security rows: "Phone key", "Your lawyer". Recent transactions in USDC. The CHF 18'165.00 of the mockup is the mock bank balance: it belongs on C13 |
| Transfer sheet | C12 / C8 / C13 | Receive, Send, Deposit = "From Swissquote" |
| Select an asset | C7 | USDC row (+ ETH as network-fee info). Drop BTC, XRP, LINK |
| New Transfer | C8 | Fee card: "Network fee: paid by Swissquote" and "Instant: no approval needed." / "Needs your lawyer's approval." (replaces "< 0.01 USDC", "~10 min") |
| Review (Result Overview / Address / Amount) | C9 | Chips driven by policy reasons: Address warning = NEW_RECIPIENT, Amount warning = AMOUNT_ABOVE_THRESHOLD, DAILY_CAP, VELOCITY. Button "Confirm with Face ID" or "Ask my lawyer to review the transaction" |
| Waiting for lawyer verification | C10 | Add the 48 h note. "Send a notification" becomes "Cancel this transfer" (push is out of scope, CDC 7.4) |
| Confirmed transaction | C11 | Amount, recipient, "Network fee: paid by Swissquote", explorer link |
| (none) | C13 to C20 | Derive from the same components. Recovery: Cancel as prominent as Continue |

## 6. Rules for every screen
Empty, loading, error ("Something went wrong. Nothing was sent. Try again.") and offline states. Amounts as decimal strings through `toBase/fromBase`. Addresses shortened `0x1234…abcd` with a copy button and the full value in `aria-label`. No raw hex in components. `lang="en"`.
