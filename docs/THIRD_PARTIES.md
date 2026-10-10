# Third parties

Services and libraries the prototype relies on (CDC 9.9 #8). Status is the state of this branch: "planned" means written down but not called by the code. Unknown countries are marked `[TO VERIFY]`; Aaron checks them against each provider's current terms. See also `NOTICE` for the MPC library licence.

## Services

| Provider | Role | Data processed | Country | Terms | Status |
|---|---|---|---|---|---|
| Vercel | Hosting of the client app, lawyer portal and Swissquote mock (functions region `fra1`) | IP addresses, requests, session cookies | Region Frankfurt (Germany); company and support access `[TO VERIFY]` | https://vercel.com/legal/terms | In use |
| Supabase | Databases, one project per party (account, share ciphertext) | Account data, encrypted share material | Frankfurt (Germany) planned; company `[TO VERIFY]` | https://supabase.com/terms | Planned, not read or written by the code yet |
| Public Base Sepolia RPC (`sepolia.base.org`) | Chain reads (balances, nonces) and broadcasts | Wallet addresses, IP address of the caller | `[TO VERIFY]` | https://docs.base.org | Planned for the live mode; used by `npm run check-chain` |
| Base Sepolia explorer (`sepolia.basescan.org`) | Transaction links opened by the user | The user's browser contacts it when a link is opened | `[TO VERIFY]` | https://basescan.org/terms | Links only; in mock mode the hash is simulated |

No analytics, advertising, tracking, e-mail or SMS provider is used. Fonts are bundled with the app (no request to a font service).

## Libraries with a notable licence

| Library | Role | Data processed | Country of owner | Licence | Status |
|---|---|---|---|---|---|
| `@silencelaboratories/dkls-wasm-ll-web` and `-node` 1.2.0 | DKLs23 threshold signing (MPC) | Key shares in memory, on the device or the node | Singapore | Silence Laboratories Non-Commercial Use License Agreement (SLL), text in `licenses/SILENCE-LABORATORIES-LICENSE.md` | Non-commercial only; commercial use needs a licence from the owner |
| `@fontsource-variable/outfit`, `@fontsource/poppins` | Fonts | none | n/a | OFL-1.1 | In use |

Other npm dependencies (MIT, ISC, Apache-2.0) are listed with exact versions in each `package.json`. They process no data outside our own servers.
