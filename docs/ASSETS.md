# Assets and decisions (updated after Téo's second message)

## Received and integrated
| Asset | Where | Note |
|---|---|---|
| Swissquote logo (SVG) | `public/brand/swissquote-logo.svg` | Wraps a raster image (551 x 350): keep it at <= 2x its natural size. A true vector would be sharper on the big console sidebar. The CDC (9.9 #19) said no Swissquote logo: the team decided to use it (one file to remove if needed) |
| Fonts | Outfit + Poppins (confirmed) | `@fontsource` packages, self-hosted |
| Token coins (BTC, Chainlink, ETH, XRP) | ETH in `public/coins/eth.png`; others in `docs/assets-reference/coins/` | Only ETH is used (network-fee indicator). Scope is USDC only |
| **USDC coin** | `public/coins/usdc.svg` | Created by Claude to match the glossy orange coins (same gradient, rim and inner ring). Vector |
| Phone mocks (Phone key / Secondary aggregator), hand photo | `public/illustrations/` | Contain baked-in text and BTC/CHF UI: acceptable as placeholders, re-export from Figma with "Phone key" / "Your lawyer" and USDC before the demo |
| Hero background with coins | `docs/assets-reference/hero-bg-with-coins.png` | Not used: the hero is a CSS gradient + USDC coins |
| 3 console mockups | `docs/mockups/console/` | Basis of `app/console/design.md` |
| Icons | `lucide-react`, stroke 1.75 | Closest match to the thin outline icons of the mockups |

## Still useful from Téo (not blocking)
1. Illustrations at @2x or @3x (the coins are 45px, the phones 390px wide: they blur on retina).
2. Re-exported phone illustrations with the right vocabulary (see above).
3. Source and license of the hand photo and 3D coin art (CDC checklist #19: free or own resources).

## Decisions taken (tell me to change any)
1. Mockups win for visuals, CDC wins for logic and for texts fixed in annex F. Copywriting is improved by Claude in the mockups' tone.
2. Orange stays #FA5B35 everywhere. White text on it is 3.2:1: OK only for large bold text, so button labels are 18px/600. Small chip text uses the darker #A93518 so it stays legible.
3. Scope: Base + USDC only. Mockup BTC/XRP/LINK rows and baked coin art are not used.
4. Vocabulary: "Phone key", "Your lawyer" (mockup: "Secondary aggregator").
5. Everything is in English, console included (confirmed).
6. Console mockup changes: columns "Lawyer approval" (was "Kit de secours", which in the CDC is a different thing), "24 h" delay in production (mockup said 48 h), algorithm "DKLs23 · ECDSA secp256k1" (mockup said FROST-Ed25519), invented claims removed.
7. New console actions "Send identity check" and "Co-sign and release share" need two new sq-mock routes: the team builds them (confirmed, no outside approval needed).
8. Lawyer portal = client design language + the console's desktop layout. No separate look.
9. Team will re-run its own setup from this base (confirmed).
