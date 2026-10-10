# client / 01 UI kit
Read CLAUDE.md, design.md and the CDC sections cited below (docs/CDC_v3.1.md) before writing code. Work only in the folders named here. No secrets, no raw hex in components (use tokens), all user-facing text in English copied from CDC annex F. When finished: npm run typecheck, npm test, npm run build, then commit with a clear English message.

Goal: build the visual kit described in design.md section 3 in components/ui/ (one file per component, typed props, no business logic).
Do:
1. Components: Button, IconButton, Input, StatusChip, RowCard, BottomSheet, HeroCard, TabBar, StepList, CheckHalo, Spinner, ReviewItem, KeyShowcase, SimulatedPill, Banner, PageShell. Icons from lucide-react.
2. BottomSheet: focus trap, Esc to close, scrim, aria-modal, returns focus. Buttons: loading and disabled states (disabled uses brand-soft).
3. Create /dev/ui (client route, excluded from production nav) that shows every component and every state, on a 390px column.
4. Accessibility: visible focus, 44px touch targets, status never color-only, prefers-reduced-motion respected.
Assets are in public/ (logo, usdc.svg, eth.png, illustrations): use them, see design.md section 3. Add Logo and CoinIcon components. HeroCard = CSS gradient + decorative USDC coins (no baked-in BTC art). Put showcase and screens under app/(mobile)/ (dev showcase at app/(mobile)/dev/ui). Button label 18px/600, color #FA5B35 via the brand token.
Done when: /dev/ui renders all components with no console error and build passes.
