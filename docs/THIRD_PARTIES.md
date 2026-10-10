# Third-party services and libraries

Audit of the third parties used or planned by SQ Keys (CDC 9.9 point 8, CDC 9.6). Written from what the repository contains. Status is the state of the branch: "planned" means written down but not called by the code. Aaron checks the unknown values against each provider's current terms. See also `NOTICE` for the MPC library licence.

Rules used in this file:
- A value is given only when a file of the repository proves it. The source is named in the last column.
- Everything else is marked **TO VERIFY**. No country or region is assumed.
- Links to terms were not opened from this repository. They are given as a starting point and are all marked TO VERIFY.
- A value that comes from a team note and not from a provider's own page keeps its TO VERIFY marker next to it.

## 1. Hosted services (they receive data)

| Service | Purpose | Data processed | Country / region | Terms | Status and source |
|---|---|---|---|---|---|
| Vercel (hosting, serverless functions) | Hosts the three web projects: `sq-keys` (client app), `sq-keys-lawyer` (lawyer portal and P2 node), `sq-keys-mock` (simulated Swissquote and P3 node). One Vercel account per team member. | Every HTTP request: IP address, user agent, session cookie, request bodies in transit (transfer requests, MPC protocol messages). Environment variables, including server secrets. Function logs. | Function region `fra1` for the client app and the lawyer portal (`vercel.json`, `lawyer/vercel.json`), described by the team as Frankfurt (Germany). Region of `sq-keys-mock`: TO VERIFY (no `vercel.json` in `sq-mock/`). Company location and support access: TO VERIFY | https://vercel.com/legal/terms and https://vercel.com/legal/privacy-policy (TO VERIFY) | In use for the client app and the lawyer portal (`README.md`). CDC 3.1, `docs/SETUP.md` section 6. `sq-keys-mock` deployed or not: TO VERIFY |
| Supabase, project `sq-keys-app` (PostgreSQL) | Database of the client app. | Pseudonymous reference `sq_ref`, wallet address, public key, consents (document, version, date), devices (credential id, label), invitation token hashes, transfer requests (recipient, amount, status), recoveries (old and new address, dates), alerts. No client number, no identity document, no key share. | Frankfurt (Germany) planned (`README.md`); region actually chosen and company location: TO VERIFY | https://supabase.com/terms and https://supabase.com/privacy (TO VERIFY) | Planned, not read or written by the code yet. Schema: `sql/001_init.sql`. Project created or not: TO VERIFY |
| Supabase, project `sq-keys-lawyer` (PostgreSQL) | Database of the lawyer portal and of the P2 node. | Lawyer name and firm, passkey public key and counter, client display name and wallet address, requests and decisions, policy versions, audit journal, MPC sessions, the **encrypted** P2 share (encryption key is not in the database). | Frankfurt (eu-central-1) planned (`docs/SETUP.md` section 5, `README.md`); region actually chosen and company location: TO VERIFY | Same as above (TO VERIFY) | Planned, not read or written by the code yet. Schema: `lawyer/sql/001_init.sql`. Project created or not: TO VERIFY |
| Supabase, project `sq-keys-mock` (PostgreSQL) | Database of the simulated Swissquote service and of the P3 node. | Simulated client accounts (client id, name, password hash, KYC status, cash balance), the link between a client and a wallet address, ownership proofs, transfers, gas top-ups, simulated identity checks and calls, audit journal, the **encrypted** P3 share. All client data is demo data. | TO VERIFY | Same as above (TO VERIFY) | Planned, not read or written by the code yet. Schema: `sq-mock/sql/001_init.sql`. Project created or not: TO VERIFY |
| Base Sepolia public RPC, `https://sepolia.base.org` | Reads balances and nonces, broadcasts signed transactions. Default value of `RPC_URL` in the three `.env.example` files. | Wallet addresses queried, signed transactions, IP address of the caller (the server functions, or the user's machine for the `exit/` script). Everything broadcast becomes public on the blockchain. | TO VERIFY (operator and location of the public endpoint) | https://docs.base.org (TO VERIFY: page with the terms of the public endpoint) | Planned for the live mode; used today by `npm run check-chain`. Default in `.env.example`, `lawyer/.env.example`, `sq-mock/.env.example`, `scripts/check-chain.ts` |
| Alchemy or QuickNode (Base Sepolia RPC) | Replacement for the rate-limited public RPC during the demo. | Same as the public RPC, plus an account and an API key (a secret, kept in `RPC_URL`). | TO VERIFY | TO VERIFY | Planned only. `docs/SETUP.md` section 4. Provider chosen or not: TO VERIFY |
| BaseScan, `https://sepolia.basescan.org` | Block explorer. The app only links to it ("View on the explorer"). | Nothing is sent by our servers. The user's browser opens the link: the explorer sees the IP address and the transaction hash viewed. | TO VERIFY | https://basescan.org/terms (TO VERIFY) | Links only; in mock mode the hash is simulated. `.env.example` (`NEXT_PUBLIC_EXPLORER_URL`), `lib/sqkeys.mock.ts` |
| Test faucets (Circle USDC faucet, Coinbase Developer Platform or Alchemy ETH faucet) | Team only: funds the gas account and the demo wallet with test assets. Not used by end users. | The funded public address, and the faucet account of the team member. | TO VERIFY | TO VERIFY | `docs/SETUP.md` section 4 |
| GitHub | Hosts the public repository (submission) and is the contact channel named in the legal pages. | Source code, commit authors, messages sent by people who contact the team. | TO VERIFY | https://docs.github.com/en/site-policy (TO VERIFY) | `docs/SETUP.md` section 1, CDC 1.1 |

No analytics, advertising, tracking, e-mail or SMS provider is used. Fonts are bundled with the app (no request to a font service).

## 2. Libraries (run inside our own code, send no data to their author)

Versions are the exact versions pinned in `package.json` and `lawyer/package.json`. Licenses are the `license` field of each installed package. None of these libraries calls a server of its author at run time as far as the repository shows; this was not checked by a network capture: TO VERIFY.

| Library | Version | Purpose | Data it handles | License | Terms / source |
|---|---|---|---|---|---|
| Silence Laboratories DKLs23, `@silencelaboratories/dkls-wasm-ll-web` (browser) and `-node` (servers) | 1.2.0 | MPC 2-of-3: key generation and threshold ECDSA signing. | Key shares and protocol messages, in memory only, in the browser (P1) or in the node of each party (P2, P3). | **SLL**: Silence Laboratories Non-Commercial Use License Agreement. Non-commercial only; commercial use needs a licence from the owner (CDC 9.7). Owner: Silence Laboratories Pte. Ltd., incorporated in Singapore (stated in the licence text). | Licence text in `licenses/SILENCE-LABORATORIES-LICENSE.md`, `LICENSE.md` in the package, `NOTICE`, https://github.com/silence-laboratories/dkls23 |
| SimpleWebAuthn, `@simplewebauthn/browser` and `@simplewebauthn/server` | 14.0.0 and 14.0.3 | Passkey registration and verification (client and lawyer). | Passkey public keys, challenges, assertions. Biometric data stays in the device and is never seen by the library. | MIT | https://simplewebauthn.dev |
| viem | 2.57.4 | Addresses, EIP-1559 transactions, message hashing, signature recovery, RPC client. | Wallet addresses, unsigned and signed transactions. It sends requests only to the RPC URL we configure. | MIT | https://viem.sh |
| noble-curves, `@noble/curves` | 2.4.0 | Decompression of the MPC public key (secp256k1). | Public key only. | MIT | TO VERIFY (project page) |
| `@supabase/supabase-js` | 2.117.3 | Database client, server side only, with the `service_role` key. | Everything listed for the Supabase projects above. | MIT | https://supabase.com |
| jose | 6.2.12 | Signed session tokens in cookies. | Session identifiers. | MIT | TO VERIFY (project page) |
| canonicalize | 5.1.0 | Canonical JSON (RFC 8785) for the audit journal. | Journal entries. | Apache-2.0 | TO VERIFY (project page) |
| Next.js, React | 16.4.0, 19.3.0 | Web framework. | All pages and API routes. Next.js telemetry setting: TO VERIFY | MIT | TO VERIFY (project pages) |
| lucide-react, qrcode.react | 1.55.0, 4.2.0 | Icons, QR code of the wallet address (rendered locally). | Wallet address (QR code), in the browser only. | ISC | TO VERIFY (project pages) |
| Fonts Outfit and Poppins, `@fontsource-variable/outfit`, `@fontsource/poppins` | 5.3.0 | Typography. Self-hosted: the browser does not call a font service. | None. | OFL-1.1 | `docs/ASSETS.md`. In use |

## 3. What no third party receives

- Biometric data: it stays in the user's device (WebAuthn).
- A complete private key: it never exists, at any party (CDC section 1).
- The P1 share: it stays in the browser of the client, encrypted. No hosting or database provider stores it.
- An unencrypted share in a database: P2 and P3 are stored encrypted, and the encryption keys are server variables, not database content.
- The Swissquote client number and identity documents: they stay in the simulated Swissquote service; the client app and the lawyer portal only know `sq_ref` (CDC 9.6).

## 4. Limit to state honestly

P2 and P3 live in separate projects, separate databases and separate accounts, but with the same two providers (Vercel and Supabase). The hosting provider runs the functions that decrypt P2 and P3 and holds their encryption keys as environment variables. In the prototype, the independence of the two nodes is therefore organisational, not a separation of infrastructure providers. A real product would use a hardware security module for each party (CDC 3.3, 3.8).

## 5. Open points

1. **Regions.** `fra1` is set for two Vercel projects. Still to record: the region of `sq-keys-mock`, the Supabase region of each of the three projects (dashboard of each account owner), and the company location of each provider. Then replace the TO VERIFY values above. The privacy policy says some providers process data outside Switzerland: confirm it or correct it.
2. **Outsourcing.** Vercel and Supabase would be outsourcing providers for a bank (FINMA circular 2018/3): status [TO VERIFY] in CDC 9.6. Not assessed for this prototype.
3. **RPC provider.** Decide between the public RPC and Alchemy or QuickNode for the demo, then update this file.
4. **Terms links.** Open and confirm each link marked TO VERIFY.
5. **README.** The README links to this file for the table asked by CDC 9.9 point 8. `content/legal/privacy.md` section 7 points readers to the README, which is now consistent.
6. **Commercial use.** The SLL license does not cover a commercial product. See `NOTICE` and CDC 9.7.
