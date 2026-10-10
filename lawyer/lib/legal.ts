// L10 legal pages: the "Lawyer information" of CDC 9.8 (role, no power over funds alone, data processed, journal).
// Written by students from public sources, not reviewed by a lawyer.
// Keep to what the prototype really does: no claim of absolute security, no regulator named as an authority.

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  /** Markdown subset, see lib/markdown.ts. */
  body: string;
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "role",
    title: "Your role as lawyer",
    summary: "What you do, and what you can never do.",
    body: `
## What you accept
A client invited you to protect their wallet. You are free to accept or to decline. By accepting, you receive the authority to approve or decline certain requests. You do not receive the client's assets and you do not hold them.

## What you do
- You hold one third of the client's key. Two of the three parts are needed to sign, so **you can never move funds alone**.
- You approve or decline large or unusual transfers, recoveries and exits.
- You set the client's limits: per transfer, per day, transfers per hour and per day, and the known recipients.
- Each approval applies to one exact request, with its amount and recipient. It is signed with your passkey and can be used once.
- A request you do not answer in time expires. Nothing is sent.

## How your part of the key is used
- Your part of the key is stored encrypted on the server of this portal, not on your device. It is operated on your behalf.
- Below the client's limits, the portal uses your part automatically and does not notify you. Unless you change this setting for a client, this only applies to recipients already known.
- Above a limit, for a new recipient, for an unknown application, for a recovery or for an exit, your part is used only after you approve with your passkey.
- Your passkey proves that the decision is yours. Your fingerprint or face data never leaves your device.

## What you do not do
- You do not see the client's everyday transfers. You only see requests that need you, recoveries and exits, the client's policy, your own journal, and totals of automatic decisions.
- You have no access to the client's phone key or to Swissquote's part of the key.
- You do not give investment advice through this portal, and the portal gives none to you.

## Recovery and exit
- A recovery moves all funds of the client to a new wallet. It needs an identity check by Swissquote, your approval and a waiting period. You and the client can cancel it during the waiting period.
- An exit lets the client leave without Swissquote, with their exit kit and your approval. It is never automatic.
- Before approving a recovery or an exit, contact the client by another channel (phone call).
- You and Swissquote together hold two of the three parts. This is why a recovery has several independent checks and is written to the journal.

## Your professional duties
This portal does not tell you which professional or regulatory rules apply to you in this role. In a real product, your status under anti-money laundering rules and your duty of professional secrecy would have to be assessed before you accept. This has not been done for this prototype.

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
- Display name, wallet address and account status. The client chose to share them with you when they invited you.
- Each request that needs you: type, amount, recipient address, the reasons it needs you, and the time.
- Your decision on each request, with a hash of the passkey signature as proof.
- The client's policy and each version of it.

## What the portal does not receive
- The client's Swissquote client number and identity documents. The portal only knows an anonymous reference.
- The client's part of the key and Swissquote's part of the key.

## The journal
Decisions, refusals, recoveries, policy changes and access are written to a journal. Each entry is chained to the previous one, so a changed entry can be detected. You can verify the chain from the Journal page. Entries are not edited after the fact.

## What you do not see
The server also records automatic decisions, because it must enforce the limits and show that your part of the key was never used without a reason. The interface only shows you totals for the last 24 hours, never the details. Whoever operates the portal could technically read this data. In this prototype the portal is operated by the student team. In a real product it would be operated by your firm or by a provider acting for it.

## Your own duties
You process personal data of your client when you use this portal. Use it only for this role, and keep your device and your passkey under your sole control.

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
The student team that publishes SQ Keys is responsible for the data processed by this portal. This policy follows the Swiss Federal Act on Data Protection and has not yet been reviewed by a lawyer.

## Why data is processed
To let you approve or decline requests for the clients you represent, to apply their limits, and to keep a journal that can be checked. We do not sell data and we do not use it for advertising or profiling.

## What is processed
See the page "Data we process".

## Cookies
We only use cookies that are strictly necessary. There is no tracking and no cookie banner.

## Service providers
The portal uses third-party infrastructure: a web hosting provider, a database provider and a public blockchain node provider. Some of them may process data outside Switzerland. The list is in the repository of the project.

## How long data is kept
Prototype data is kept only as long as the project needs it for the competition and for testing, and is then deleted. Data written to a public blockchain cannot be erased.

## Your rights
You can ask for access to your data, correction or deletion. Some data may have to be kept where a law requires it. You can also contact the Federal Data Protection and Information Commissioner.

## Contact
Contact the team through the repository page of the project.
`,
  },
];

export const findLegalDoc = (slug: string): LegalDoc | undefined => LEGAL_DOCS.find((d) => d.slug === slug);
