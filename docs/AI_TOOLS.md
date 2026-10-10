# AI tools used

The hackathon submission asks for the list of AI tools used by the team and what each was used for. This file is that list. It completes CDC section 13.2.

## Tools

| Tool | Used for | Who |
|---|---|---|
| Claude (Anthropic), via claude.ai | Specification (the CDC in `docs/CDC_v3.1.md`), architecture choices, legal drafting (`content/legal/`, lawyer portal texts) and review | to complete by the team |
| Claude Code (Anthropic) | Implementation: code of the projects in this repository, tests, setup and check scripts, the documentation in `docs/` | to complete by the team |
| Claude (Anthropic), second session | Auditor: an independent session that reviews the work of the first one | to complete by the team |
| DeepSeek | Early design exploration. Its proposals were checked and some were rejected; the rejected proposals are documented in `docs/` (see CDC section 13.2) | to complete by the team |

## To complete by the team

- Who used each tool (column above).
- Model versions used: to complete by the team.
- Any other tool, for example for mockups, images, slides, translation or the pitch: to complete by the team. CDC section 13.2 lists a mockup tool for the screens; confirm it and add it to the table.
- Whether any image in `public/` was produced with an AI tool: to complete by the team. `docs/ASSETS.md` records that `public/coins/usdc.svg` was created by Claude.

## How the tools were used

- Project rule: no homemade cryptography, whether written by a person or by an AI tool. Established libraries only (CDC section 0, rule 4).
- Project rule: no secret (private key, key share, API key) in code, a commit, a log or a message, which includes prompts (`CLAUDE.md`, rule 2).
- The legal texts were drafted with AI assistance from public sources. They have not been reviewed by a lawyer; the legal notice of the app says so.
- The rules given to every Claude Code session are in `CLAUDE.md`. The prompts used to build the screens are kept in `docs/prompts/`.
