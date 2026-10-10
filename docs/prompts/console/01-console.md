# console / 01 Swissquote console C21
Run in the repo root (client app). Read CLAUDE.md, `app/console/design.md`, `docs/mockups/console/*.png`, CDC 6.2, 6.3, 7.2 C21, annex A.3. Work only in `app/console/`, `lib/console*.ts` and `components/ui/` additions. Text in English. When done: typecheck, test, build, commit.

Goal: the console described in `app/console/design.md`, on a mock, as a faithful but cleaner version of the 3 mockups.
Do:
1. Console shell in `app/console/layout.tsx`: top strip, sidebar (Swissquote logo from public/brand, nav, operator block with Simulated pill), top bar, info banner "What Swissquote cannot do". Password gate (server action checking CONSOLE_PASSWORD, httpOnly cookie).
2. `lib/console.types.ts` + `lib/console.mock.ts`: 3 recoveries (one verified + co-signed, one in progress with delay, one identity failed), clients (client.lea, client.demo, client.target), proofs, alerts, calls. Functions: listRecoveries, getRecovery, sendIdentityCheck, setNextIdentityOutcome, cosignRelease, listClients, listProofs, listAlerts, listCalls. Realistic delays; state in memory.
3. Screens: Recoveries list, Recovery detail (timeline, countdown, Swissquote action card with the three steps, key share card), Client wallets, Ownership proofs, Compliance alerts, Calls.
4. Rules: Co-sign button enabled only when identity verified AND lawyer approved AND delay elapsed; otherwise disabled with the reason. Countdown ticks every second. Demo switch "Next identity check: PASS/FAIL" very visible.
5. Reuse components/ui (build missing ones: Sidebar, DataTable, Timeline, Countdown, CopyField).
Done when: you can run a full recovery in the console on the mock, including the failing identity case, at 1280px and 1024px.
