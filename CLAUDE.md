# SQ Keys: rules for every Claude Code session in this repo

Source of truth: `CDC_v3.1.md` (put the file in `docs/CDC_v3.1.md`). If a rule below conflicts with it, the CDC wins, except Swissquote's official brief (CDC 1.1), which wins over both.

## What this repo is
Self-custody wallet prototype for the Swissquote track (BSA x EPFL hackathon). EVM, Base Sepolia (84532), MPC 2-of-3 (client P1, lawyer P2, Swissquote P3). Four projects:
- `/` (root) client app, Vercel project `sq-keys`, folders `app/`, `components/ui/`, `app/console/`, `lib/`
- `lawyer/` lawyer portal + P2 node, Vercel project `sq-keys-lawyer`, own `package.json`
- `sq-mock/` Swissquote mock (Théotime), `exit/` exit script (Théotime), `spike/` M0 test (Aaron)
- `shared/` source of shared code, copied by `npm run sync-shared` (never edit `lib/shared`, `lawyer/src/shared`, ...)

## Absolute rules (CDC section 0)
1. Testnet only. No real funds.
2. No secret in code, commit, log or message: private keys, key shares, encryption keys, API keys, shared secrets, `service_role`. Values live in `.env.local` (git-ignored) and Vercel env. Never print them.
3. Share separation: the client app never touches P2/P3; the lawyer portal never touches P1/P3; sq-mock never touches P1/P2. `service_role` is never in a `NEXT_PUBLIC_` variable.
4. No homemade cryptography. Only the libraries listed in CDC 0.4.
5. Exact versions in `package.json` (no `^`, no `~`). Use `npm i --save-exact`.
6. Everything user-facing, comments, commits and API errors are in English. Exact screen texts: CDC annex F. Copy them.
7. Honesty: anything simulated shows a "Simulated" pill. Never write "unbreakable", "100% secure", "FINMA compliant". Swissquote logo only from `public/brand/swissquote-logo.svg` (team decision, overrides CDC 9.9 #19; one file to remove if ever needed).
8. Blocked more than 30 minutes: stop and propose plan B (CDC 3.9).
9. A step starts only when the previous one is committed, deployed (`npx vercel --prod`) and checked on the production URL.

## Roles and branches (one branch each, never force-push)
Téo: design and front, branch `teo/ui` (`components/ui/`, `app/console/`, screens C1-C21 and L1-L10 on mocks).
Aaron: logic, MPC, nodes, policy engine, branch `main`. Théotime: `sq-mock/`, `exit/`, branch `theotime/sq`.
Téo's front imports ONLY `lib/sqkeys.ts` (client) and `lawyer/lib/lawyerApi.ts` (lawyer). Signatures are a contract (CDC annex D): never change them alone.

## Design
Each project folder has a `design.md`. Read it before building any screen. **Mockups win over the CDC for everything visual; the CDC wins for logic and for texts it fixes in annex F.** Orange is #FA5B35 and never changes. Fonts: Outfit + Poppins. Scope: Base network, USDC only. Use the tokens in `app/globals.css`; no raw hex in components. Mockups are in `docs/mockups/` (local only).

## Commands
`npm run dev` (client :3000), `cd lawyer && npm run dev` (:3001), `npm run build`, `npm test`, `npm run typecheck`, `npm run sync-shared`, `npm run check-shared`, `npm run check-secrets`, `npm run check-chain`, `npm run doctor` (run it at the start of every session: it checks that your setup matches everyone else's).
