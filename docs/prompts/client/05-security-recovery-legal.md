# client / 05 activity, security, apps, recovery, legal C14 to C20
Read CLAUDE.md, design.md and the CDC sections cited below (docs/CDC_v3.1.md) before writing code. Work only in the folders named here. No secrets, no raw hex in components (use tokens), all user-facing text in English copied from CDC annex F. When finished: npm run typecheck, npm test, npm run build, then commit with a clear English message.
Cited: CDC 6.2, 6.4, 7.2 (C14-C20), 9.8, 9.9, F.4, F.5.

Do: /activity (C14, with "Export journal" JSON), /security (C15: devices, lawyer, read-only limits, known recipients, exit kit with passphrase >= 12 chars and download of the Blob), /apps/allow (C16 demo app, plain-language simulation, warning when unlimited), /recovery/* (C17 start, C18 identity, C19 tracking with timeline, countdown, and Cancel recovery exactly as prominent as Continue), global banner on every logged-in screen when a recovery exists (F.5), /legal/[doc] (C20: Terms of use, Risk warning, Recovery terms, Privacy policy, Cookies, Legal notice).
Legal pages: render markdown files in content/legal/*.md. Aaron writes the final text; create short clearly-marked placeholders ("Draft: to be replaced") and never invent legal claims.
Done when: the lost-phone scenario runs end to end on the mock including attacker case (identity fail shows "We could not verify your identity. Your lawyer was alerted.").
