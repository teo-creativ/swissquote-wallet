# client / 04 send, receive, from Swissquote C8 to C13
Read CLAUDE.md, design.md and the CDC sections cited below (docs/CDC_v3.1.md) before writing code. Work only in the folders named here. No secrets, no raw hex in components (use tokens), all user-facing text in English copied from CDC annex F. When finished: npm run typecheck, npm test, npm run build, then commit with a clear English message.
Cited: CDC 5.2, 5.3, 7.2 (C8-C13), annex F.3, F.4.

Do: /send (C8), /send/review (C9), /send/waiting/[id] (C10), /send/result/[id] (C11), /receive (C12, QR with qrcode.react, copy), /from-swissquote (C13).
- C8: live checkTransfer on input (debounced 400 ms). Show "Instant: no approval needed." or "Needs your lawyer's approval." plus the reason lines of F.3. Field validation (address format, max 6 decimals, balance). MAX button.
- C9: review items from the mockup (Result Overview, Address, Amount) with chips driven by reasons. Primary button text depends on outcome. "Network fee: paid by Swissquote".
- C10: poll getTx every 3 s, show the 48 h note and Cancel this transfer.
- C11: success with explorer link, refused ("Your lawyer declined this transfer. Nothing was sent."), expired.
- C13: balance in CHF, amount, limits text of F.4, "Your wallet is verified as yours: you signed a proof of ownership."
Done when: all paths work with the dev panel: instant, lawyer approved, refused, expired, cancelled, sanctioned.
