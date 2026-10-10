# client / 03 onboarding C1 to C7
Read CLAUDE.md, design.md and the CDC sections cited below (docs/CDC_v3.1.md) before writing code. Work only in the folders named here. No secrets, no raw hex in components (use tokens), all user-facing text in English copied from CDC annex F. When finished: npm run typecheck, npm test, npm run build, then commit with a clear English message.
Cited: CDC 4.1, 4.3, 7.2 (C1-C7), F.1, F.2; mockup map in design.md section 4.

Goal: the full creation journey on the mock.
Do (routes): / (splash) , /login (C1), /verify (C2), /documents (C3), /key (C4), /lawyer (C5), /creating (C6), /home (C7). Guard each route by account status from getAccount().
- C3: four separate unchecked checkboxes, "Read" chips open /legal/* (C20, can be stubs for now), Continue disabled until all ticked, then registerAccount with the four documents and a version string "1.0".
- C4: createDevicePasskey; error state "This phone cannot protect your key with a passkey. Try another phone or browser."
- C5: inviteLawyer, show link in a BottomSheet with Copy and Share (navigator.share when available), poll getLawyerStatus every 5 s, regenerate link.
- C6: StepList of the 7 WalletStep values with the exact labels of F.2, then "Your account is ready" screen.
- C7: HeroCard (USDC), Account Security rows (Phone key, Your lawyer), recent activity, TabBar, banners (recovery in progress, pending request), "Network fees are paid by Swissquote."
Done when: you can go from /login to /home on the mock with the dev panel, on a 390px viewport, keyboard only.
