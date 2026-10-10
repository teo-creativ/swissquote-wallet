# Prompt playbook

How to use: open the folder in VS Code (client = repo root, lawyer = `lawyer/` in a second window), start Claude Code there, paste the prompt of the next step. One step = one commit. Do not start a step before the previous one builds (`npm run build`) and is committed.

Every prompt starts with the same preamble (already included): read `CLAUDE.md`, `design.md` and the cited CDC sections, touch only your folders, no secrets, English UI text copied from CDC annex F.

| Order | Folder | File | Result |
|---|---|---|---|
| 1 | client | 01-ui-kit | `components/ui/*` + `/dev/ui` showcase |
| 2 | client | 02-mock-sqkeys | realistic mock of `lib/sqkeys.ts` + `/dev/mock` control panel |
| 3 | client | 03-onboarding | C1 to C7 |
| 4 | client | 04-send-flow | C8 to C13 |
| 5 | client | 05-security-recovery-legal | C14 to C20 |
| 6 | lawyer | 01-ui-kit | portal shell + components |
| 7 | lawyer | 02-mock-lawyer-api | `lib/lawyerApi.ts` mock with seeded data |
| 8 | lawyer | 03-invite-and-login | L1 to L3 |
| 9 | lawyer | 04-dashboard-requests | L4 to L6 |
| 10 | lawyer | 05-recovery-policy | L7, L8 |
| 11 | lawyer | 06-journal-legal | L9, L10 |
| 12 | console | 01-console | C21 Swissquote console (mockups received, unblocked) |

Layouts: client screens go in `app/(mobile)/`, the console in `app/console/` (desktop). Steps 1 to 5, 6 to 11 and 12 are independent: run client and lawyer in parallel in two VS Code windows.
