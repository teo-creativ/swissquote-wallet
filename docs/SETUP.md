# SETUP: from zero to a running, deployable project

Times are for a hackathon: do 1 to 4 now, 5 and 6 when Aaron/Théotime are ready for them.

## 1. Get the code (who creates what)
The repo belongs to `ARgos2070` (Aaron), no GitHub-Vercel integration. This skeleton is meant to be committed once so all three start from the same base.
```bash
git clone https://github.com/ARgos2070/<repo>.git && cd <repo>     # ask Aaron for the exact name
git checkout -b teo/ui
# unzip sq-keys-skeleton.tar.gz INTO this folder (it contains hidden files: use tar, not drag and drop)
tar -xzf ~/Downloads/sq-keys-skeleton.tar.gz --strip-components=1
git add -A && git commit -m "Add project skeleton, design docs and prompt playbook" && git push -u origin teo/ui
```
Then Aaron merges `teo/ui` into `main` right away (before his agent creates its own root files, to avoid conflicts). If he already created a root Next.js project: keep his `package.json`, copy over `docs/`, `design.md`, `CLAUDE.md`, `components/`, `scripts/`, `lawyer/`, `sql/`.

## 2. Two VS Code windows
```bash
code .          # window 1: client app (repo root). Claude Code here uses CLAUDE.md + design.md
code lawyer     # window 2: lawyer portal. Claude Code here also reads ../CLAUDE.md + lawyer/CLAUDE.md
```
The root project ignores `lawyer/ sq-mock/ exit/ spike/` (tsconfig + .vercelignore), so the two never build each other.

## 3. Install and run
```bash
nvm use                       # Node 22 (.nvmrc)
npm ci                        # root (client). `ci`, not `install`: installs EXACTLY the locked versions, same for all three of you
(cd lawyer && npm ci)         # lawyer
cp .env.example .env.local && npm run gen-secrets              # writes SESSION_SECRET, never prints it
(cd lawyer && cp .env.example .env.local && npm run gen-secrets)
npm run dev                   # http://localhost:3000   (client, NEXT_PUBLIC_SQKEYS_MODE=mock)
(cd lawyer && npm run dev)    # http://localhost:3001
```
Scripts use `--webpack`: the DKLs23 WASM package needs webpack's `asyncWebAssembly` (verified: the web build emits the `.wasm` and the Node build traces it into API routes). Do not switch to Turbopack without Aaron's spike S5.

Pair secrets (`APP_TO_LAWYER_SECRET`, `APP_TO_SQ_SECRET`) must be IDENTICAL on both sides and handed over in person (CDC annex C). One person runs `npm run gen-secrets -- --pairs`, then reads the line in their `.env.local` at the table; the other pastes it. Never by chat or e-mail.

## 3b. Everyone on the same setup (do this together, takes 2 minutes)
Each of you runs, on your own machine, in your own clone:
```bash
npm run doctor
```
It checks: Node >= 22, exact (pinned) dependency versions and lockfiles, `node_modules` installed, every variable of `.env.example` present in your `.env.local`, no `.env` tracked by git, `shared/` copies in sync, and that you are not on `main`. Goal: three machines printing `READY`. Warnings about empty env values are normal until each person has their own Supabase / RPC values. Rules that keep you aligned afterwards: never `npm install` without `--save-exact`; commit `package-lock.json`; run `npm run sync-shared` after any change in `shared/`; pull `main` before starting a new step.

## 4. Testnet: Base Sepolia
| Item | Value |
|---|---|
| Network | Base Sepolia |
| Chain ID | 84532 |
| Public RPC | https://sepolia.base.org (rate limited: for the demo create a free Alchemy or QuickNode Base Sepolia URL and put it in `RPC_URL`) |
| Explorer | https://sepolia.basescan.org |
| USDC (6 decimals) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (expected value from CDC, **not yet verified**) |
| Faucets | ETH: Coinbase Developer Platform faucet or Alchemy Base Sepolia faucet. USDC: https://faucet.circle.com (choose Base Sepolia). Limits per address apply. |

Verify the setup from your laptop (the build sandbox here cannot reach the RPC):
```bash
npm run check-chain                 # prints chainId, USDC symbol/decimals, ok: true/false
npm run check-chain -- 0xYourAddr   # also prints ETH and USDC balances
```
If `ok` is false or the symbol is not USDC, stop and tell Aaron (CDC 15.3 open point).
Keys that need funding (Théotime, in `sq-mock/`): the gas account and the demo wallet.
```bash
npm run gen-keypair -- --name SQ_GAS_PRIVATE_KEY          # prints only the PUBLIC address; fund it with ETH
npm run gen-keypair -- --name SQ_DEMO_WALLET_PRIVATE_KEY  # fund it with ETH + USDC
```

## 5. Supabase (lawyer project is yours)
1. supabase.com > New project, name `sq-keys-lawyer` (account: Téo). Region: Frankfurt (eu-central-1), closest to Switzerland; list it in the README third-party table. Save the database password in your password manager.
2. SQL Editor > paste `lawyer/sql/001_init.sql` > Run. (19 tables, RLS enabled on all, no policy. The two functions `commit_decision` / `consume_decision` are Aaron's, marked TODO in the file.)
3. Project Settings > API: copy the Project URL and the **service role / secret key**. Put them ONLY in `lawyer/.env.local` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and in Vercel env. Never in a `NEXT_PUBLIC_` variable, never in chat.
4. Check (CDC S-3): with the anon key, `select` on any table must return nothing/denied.
Aaron does the same for `sq-keys-app` with `sql/001_init.sql`, Théotime for `sq-keys-mock` with `sq-mock/sql/001_init.sql`.

## 6. Vercel (CLI deploy from each folder)
```bash
cd lawyer
npx vercel login
npx vercel link                       # create project named exactly: sq-keys-lawyer (passkeys are bound to its domain)
# add each variable of lawyer/.env.example (production). One by one, value typed or piped, never echoed:
npx vercel env add SUPABASE_URL production
# ... same for SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, LAWYER_SHARE_ENC_KEY, LAWYER_SHARE_ENC_KEY_VERSION,
#     APP_TO_LAWYER_SECRET, LAWYER_ORIGIN, APP_URL, RPC_URL, USDC_ADDRESS, NEXT_PUBLIC_CHAIN_ID, TTL variables
npx vercel --prod                     # then open https://sq-keys-lawyer.vercel.app and check /api/node/health returns ok:true
```
Project settings: Framework Next.js, Node 22, root directory `.`; the build command is `npm run build` (already webpack). Client app: same from the repo root with project `sq-keys` (Aaron's account). If a name is taken, the new URL goes in the env variables everywhere (CDC 3.1).
`/api/node/health` is a temporary check of the Node WASM build: Aaron removes it when the real node routes exist.

## 7. Before every commit
```bash
npm run typecheck && npm test && npm run build
npm run check-shared && npm run check-secrets
```
