# SETUP_LIVE: make the demo real (Safe 2-of-3 smart account, not MPC)

Everything below is for Téo. Values are typed or pasted by you; they are never printed, committed or sent in chat. `npm run check-live` tells you what is still missing (it prints names and OK/FAIL only).

Custody model: **Safe 2-of-3 smart account on Base Sepolia (84532)**. P1 = client key in the browser, P2 = lawyer node key, P3 = Swissquote node key, threshold 2. Not MPC. Gas is paid by a sponsor wallet (`SQ_GAS_PRIVATE_KEY`); owners hold no ETH. Spike proof: `spike/RESULT.md`.

Still simulated (each with a visible "Simulated" pill): the Swissquote login, the identity check (KYC) and the bank account. Everything else is real.

## 1. Three Supabase projects (kept separate)

| Supabase project | Vercel project | Paste in the SQL editor, in this order |
|---|---|---|
| `sq-keys-app` (client) | `sq-keys` | `sql/001_init.sql`, then `sql/002_safe_live.sql` |
| `sq-keys-lawyer` | `sq-keys-lawyer` | `lawyer/sql/001_init.sql`, then `lawyer/sql/002_safe_live.sql` |
| `sq-keys-mock` (Swissquote) | `sq-mock` (team `teo-creativs-projects`) | `sq-mock/sql/001_init.sql`, then `sq-mock/sql/002_safe_live.sql` |

If `001` was already pasted, paste only `002` (it is additive and safe to run twice). All tables have row level security on and no policy: only the server with the service role key can read or write. The service role key goes only in server environment variables, never in a `NEXT_PUBLIC_` one.
Region: Frankfurt (eu-central-1) for Supabase, `fra1` for Vercel functions (already in each `vercel.json`).
After the SQL, seed the Swissquote demo clients once: `cd sq-mock && npm run seed`.

## 2. Vercel projects and environment variable NAMES

Set each with `npx vercel env add NAME production` from the project folder (the value is typed at the prompt). `NEXT_PUBLIC_*` values are inlined at build time: redeploy after changing them.

### Client app, project `sq-keys` (repo root, https://sq-keys-iota.vercel.app)
`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_SQKEYS_MODE` (= `live`), `NEXT_PUBLIC_LAWYER_MODE` (= `live`), `NEXT_PUBLIC_LAWYER_URL` (= https://sq-keys-lawyer.vercel.app), `RPC_URL`, `USDC_ADDRESS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LAWYER_URL`, `SQ_URL`, `APP_TO_LAWYER_SECRET`, `APP_TO_SQ_SECRET`, `ALLOW_NO_PRF`, `CONSOLE_PASSWORD`.

### Lawyer portal and P2 node, project `sq-keys-lawyer` (folder `lawyer/`, https://sq-keys-lawyer.vercel.app)
`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_LAWYER_MODE` (= `live`), `LAWYER_ORIGIN`, `APP_URL`, `RPC_URL`, `USDC_ADDRESS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `LAWYER_SHARE_ENC_KEY`, `LAWYER_SHARE_ENC_KEY_VERSION`, `APP_TO_LAWYER_SECRET`, `REQUEST_TTL_SECONDS`, `LAWYER_DECISION_TTL_SECONDS`, `AUTO_DECISION_TTL_SECONDS`, `RECOVERY_DELAY_SECONDS`, `EXIT_DELAY_SECONDS`.

### Swissquote mock, P3 node and sponsor, project `sq-mock` (folder `sq-mock/`)
`SQ_SUPABASE_URL`, `SQ_SUPABASE_SERVICE_ROLE_KEY`, `APP_TO_SQ_SECRET`, `SQ_SHARE_ENC_KEY`, `SQ_SHARE_ENC_KEY_VERSION`, `SQ_GAS_PRIVATE_KEY`, `SQ_DEMO_WALLET_PRIVATE_KEY`, `RPC_URL`, `CHAIN_ID`, `USDC_ADDRESS`, `RECOVERY_DELAY_SECONDS`, `CONSOLE_PASSWORD`, `SQ_URL`, `SQ_DEMO_PASSWORD`, `SQ_DEMO_BANKING_ANSWER`.
Optional sponsor limits: `SPONSOR_MAX_DEPLOYS_PER_DAY`, `SPONSOR_MAX_EXECS_PER_DAY`, `SPONSOR_MAX_EXECS_PER_SAFE_PER_DAY`, `SPONSOR_MIN_BALANCE_WEI`.
`SQ_URL` is the public URL of the sq-mock deployment (read from the environment, never hard-coded). `CANDIDE_API_KEY` is not used: the gas path that runs is the sponsor relay (see `spike/RESULT.md`).
`sq-mock/vercel.json` already sets `{ "framework": "nextjs", "regions": ["fra1"] }`. The project is already linked in `sq-mock/` (`.vercel/` is git-ignored).

### Secrets you generate
- `SESSION_SECRET` (each project), `LAWYER_SHARE_ENC_KEY`, `SQ_SHARE_ENC_KEY`: `npm run gen-secrets` writes them into `.env.local` without printing.
- Pair secrets must be identical on both sides: `APP_TO_SQ_SECRET` (client and sq-mock), `APP_TO_LAWYER_SECRET` (client and lawyer). Exchange them in person. `check-live` compares their hashes and prints only OK or DIFFERENT.
- `SQ_GAS_PRIVATE_KEY`, `SQ_DEMO_WALLET_PRIVATE_KEY`: `npm run gen-keypair -- --name <NAME>` inside `sq-mock/`. Fund the printed addresses (ETH for the sponsor and for the demo wallet, USDC for the demo wallet: https://faucet.circle.com).

## 3. Deployment order

Passkeys are bound to the domains, and each site calls the others, so deploy in this order:
1. `sq-mock` (P3 node, sponsor, bank): `cd sq-mock && npx vercel --prod`. Set `SQ_URL` to its URL if it was empty, redeploy if you changed it.
2. `lawyer` (P2 node, invitations): `cd lawyer && npx vercel --prod`. Its `APP_URL` is the client URL.
3. Client app (root): `npx vercel --prod`. `NEXT_PUBLIC_LAWYER_URL` must be set before this build.
4. Check: `npm run check-live` (config and chain), then `npm run check-routes -- https://sq-keys-iota.vercel.app`.

Local development of all three: `npm run dev` (3000), `cd lawyer && npm run dev` (3001), `cd sq-mock && npm run dev` (3002). Without `SQ_SUPABASE_URL`, sq-mock runs on an in-memory store.

## 4. check-live

`npm run check-live` (or `npm run check-live -- sq-mock` for one project, `app` or `lawyer` likewise). For each project it checks, without printing a value:
- every required environment variable exists (in `.env.local` or the process environment) and no `NEXT_PUBLIC_` variable looks like a secret;
- the Supabase tables are reachable with the service key, and the `002` columns exist (so it tells you which SQL file is missing);
- the pair secrets are identical on both sides;
- the RPC answers on chain 84532, the Safe factory, singleton, fallback handler and USDC have code;
- the sponsor balance is above `SPONSOR_MIN_BALANCE_WEI` (default 0.005 ETH), and the demo wallet holds ETH and USDC.
Exit code 1 if anything fails, so it can gate a deploy.

## 5. Faucets
ETH on Base Sepolia: Coinbase Developer Platform, Alchemy or Superchain faucet. USDC: https://faucet.circle.com (choose Base Sepolia). Check with `npm run check-chain -- <address>`.
