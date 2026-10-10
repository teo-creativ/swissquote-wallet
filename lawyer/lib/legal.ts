// L10 legal pages. DRAFT placeholders: not reviewed by a lawyer, to be replaced before any real use (CDC 9.8).
// Keep to what the prototype really does: no claim of absolute security, no regulator named as an authority.

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  /** Markdown subset, see lib/markdown.ts. */
  body: string;
};

const TO_COMPLETE = "[To be completed by the legal team.]";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "role",
    title: "Your role as lawyer",
    summary: "What you do, and what you can never do.",
    body: `
## What you do
- You hold one third of the client's key. Two of the three parts are needed to sign, so **you can never move funds alone**.
- You approve or decline large or unusual transfers, recoveries and exits.
- You set the client's limits: per transfer, per day, transfers per hour and per day, and the known recipients.
- Each approval applies to one exact request, with its amount and recipient. It is signed with your passkey.

## What you do not do
- You do not see the client's everyday transfers. You only see requests that need you, recoveries and exits, the client's policy, your own journal, and totals of automatic decisions.
- You have no access to the client's phone key or to Swissquote's part of the key.
- Before approving a recovery or an exit, contact the client by another channel (phone call).

## About this prototype
This is a student prototype. It is not an official Swissquote product. It runs on a test network with no real funds. In this demo the lawyer is played by a team member.
`,
  },
  {
    slug: "data",
    title: "Data we process",
    summary: "What the portal stores about you and your clients.",
    body: `
## About you
- Your name and firm.
- Your passkey: the public key and a usage counter. Your biometric data never leaves your device.

## About your clients
- Display name, wallet address and account status.
- Each request that needs you: type, amount, recipient address, the reasons it needs you, and the time.
- Your decision on each request, with a hash of the passkey signature as proof.
- The client's policy and each version of it.

## The journal
Decisions, refusals, recoveries, policy changes and access are written to a journal. Each entry is chained to the previous one, so a changed entry can be detected. You can verify the chain from the Journal page.

## What you do not see
The server also records automatic decisions, because it must enforce the limits and show that your part of the key was never used without a reason. The interface only shows you totals for the last 24 hours, never the details. Whoever operates the portal could technically read this data. ${TO_COMPLETE}

## Technical data
- A session cookie, strictly necessary to keep you signed in.
- Requests to look up an invitation are rate limited by network address.
`,
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "How personal data is handled.",
    body: `
## Who is responsible
${TO_COMPLETE}

## Why data is processed
To let you approve or decline requests for the clients you represent, to apply their limits, and to keep a journal that can be checked.

## Cookies
We only use cookies that are strictly necessary. There is no tracking and no cookie banner.

## How long data is kept
${TO_COMPLETE}

## Your rights
Access, correction and deletion under Swiss law. ${TO_COMPLETE}

## Contact
${TO_COMPLETE}
`,
  },
];

export const findLegalDoc = (slug: string): LegalDoc | undefined => LEGAL_DOCS.find((d) => d.slug === slug);
