# client / 02 mock of lib/sqkeys.ts
Read CLAUDE.md, design.md and the CDC sections cited below (docs/CDC_v3.1.md) before writing code. Work only in the folders named here. No secrets, no raw hex in components (use tokens), all user-facing text in English copied from CDC annex F. When finished: npm run typecheck, npm test, npm run build, then commit with a clear English message.
Cited: CDC annex D.1, 5.3, 8.2 (rules R0-R9, vectors T1-T13), annex F.3.

Goal: make the front work end to end WITHOUT backend. Keep every signature of lib/sqkeys.ts and lib/sqkeys.types.ts unchanged (contract with Aaron).
Do:
1. Create lib/sqkeys.mock.ts implementing every function with realistic delays (300-1500 ms) and an in-memory state persisted in sessionStorage (wrapped in try/catch). lib/sqkeys.ts delegates to the mock when NEXT_PUBLIC_SQKEYS_MODE=mock (default) and keeps the NOT_IMPLEMENTED bodies for live.
2. Mock policy (pure function, same logic as CDC 8.2): per-tx cap 5 USDC, daily 10, 3 per hour, 6 per day, unknown recipient needs lawyer. Magic values: recipient ending 0000 is sanctioned (REFUSED), amount > 5 or unknown recipient gives LAWYER.
3. LAWYER flow: status pending_lawyer; resolves approved / refused / expired through the dev panel, or auto-approves after 8 s if the panel switch "auto lawyer" is on.
4. Recovery: identity check result from a panel switch (pass/fail), delay 120 s, countdown, cancellable.
5. /dev/mock: control panel (auto lawyer on/off, identity pass/fail, reset state, skip delay). Visible only when mode=mock.
6. Unit tests (vitest) for the mock policy with vectors T1-T9, T11, T13.
7. login: client.lea / demo1234 works; any other credentials throw SqKeysError INVALID_CREDENTIALS.
Done when: tests pass and every exported function returns plausible data.
