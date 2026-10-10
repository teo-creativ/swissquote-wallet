# SQ Keys

Student prototype for the Swissquote track (BSA x EPFL hackathon, 10-11 Oct 2026). Not an official Swissquote product. Testnet only: no real funds.
Self-custody wallet on Base Sepolia. The key is split in 3 shares (MPC 2-of-3): client phone (P1), client's lawyer (P2), Swissquote (P3).

```
/                    client app (Next.js)            Vercel: sq-keys           Supabase: sq-keys-app
  app/               client screens C1-C20, API routes
  app/console/       Swissquote console C21 (simulated back-office)
  app/(mobile)/      client screens (430px column)
  components/ui/     design system components
  public/            brand (Swissquote logo), coins (usdc.svg), illustrations
  lib/               sqkeys.ts (front contract), mpc/, chain/, server/, shared/ (generated)
lawyer/              lawyer portal + P2 node         Vercel: sq-keys-lawyer    Supabase: sq-keys-lawyer
sq-mock/             Swissquote mock + P3 node       Vercel: sq-keys-mock      Supabase: sq-keys-mock
exit/                exit script (P1 + P2, no Swissquote)
shared/              SOURCE of shared code -> copied by `npm run sync-shared`
spike/               M0 test (disposable)
sql/ lawyer/sql/ sq-mock/sql/   database schemas (CDC annex B) with RLS
docs/                CDC_v3.1.md, SETUP.md, ASSETS.md, prompts/, mockups/
```
Scope: Base network only, USDC only. Start here: `docs/SETUP.md`, then `docs/prompts/README.md`. Rules for AI sessions: `CLAUDE.md`. Design: `design.md`, `lawyer/design.md`, `app/console/design.md`.

Licenses: the MPC packages are under the Silence Laboratories Non-Commercial Use License (see NOTICE to be written, CDC 9.7).
