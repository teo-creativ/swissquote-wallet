# SQ Keys Lawyer: rules for sessions opened in this folder
Read `../CLAUDE.md` first (same rules apply), then `design.md` here.
- This is a separate Next.js project with its own `package.json`, its own Vercel project (`sq-keys-lawyer`, domain fixed: passkeys are bound to it) and its own Supabase (`sq-keys-lawyer`).
- It hosts the P2 node and the policy engine (Aaron). Téo builds the UI (L1-L10) against `lib/lawyerApi.ts` mocks only.
- Never import anything from the client app. Never read the client's or Swissquote's data or shares.
- The lawyer does NOT see everyday (AUTO) transfers: only approval requests, recovery/exit requests, policy, own journal, and totals of automatic decisions (CDC 7.1).
