// L10 legal pages. Written from CDC section 9 (9.2 lawyer role, 9.5 data, 9.6 processors, 9.8 documents) for a student prototype.
// Keep to what the prototype really does: no claim of absolute security, no regulator named as an authority.
// Statements that are not verified yet are NOT shown here: they live in docs/LEGAL_TO_VERIFY.md.

/** Version of the lawyer role and data documents the lawyer confirms when creating the account. */
export const LAWYER_TERMS_VERSION = "1.0";

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
## What you do
- You hold one third of the client's key. Two of the three parts are needed to sign, so **you can never move funds alone**.
- You choose to accept the role. You hold the authority to approve, not the funds.
- You approve or decline large or unusual transfers, recoveries and exits.
- You set the client's limits: per transfer, per day, transfers per hour and per day, and the known recipients.
- Each approval applies to one exact request, with its amount and recipient. It is signed with your passkey.

## What you do not do
- You do not see the client's everyday transfers. You only see requests that need you, recoveries and exits, the client's policy, your own journal, and totals of automatic decisions.
- You have no access to the client's phone key or to Swissquote's part of the key.
- Before approving a recovery or an exit, contact the client by another channel (phone call).

## Recovery and independence
If a client loses their phone, your approval is one of the checks before a new key is created. The others are an identity check by Swissquote, a waiting period during which the client can cancel, a verifiable journal, and alerts to the client. Your approval only protects the client if you are independent from Swissquote: the risk that remains is two independent professionals acting together against the client.

## Your own obligations
Depending on the country and the profession, a lawyer or notary who takes part in controlling client funds may have obligations of their own, for example under anti-money-laundering rules or professional secrecy. This prototype does not assess them for you. Check them with your professional body before acting for a real client.

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
- The time you confirmed the role and data documents, and their version.

## About your clients
- Display name, wallet address and account status.
- Each request that needs you: type, amount, recipient address, the reasons it needs you, and the time.
- Your decision on each request, with a hash of the passkey signature as proof.
- The client's policy and each version of it.
- Nothing else: no Swissquote client number, no identity documents, no selfie. The portal only knows a pseudonymous reference.

## The journal
Decisions, refusals, recoveries, policy changes and access are written to a journal. Each entry is chained to the previous one, so a changed entry can be detected. You can verify the chain from the Journal page.

## What you do not see
The server also records automatic decisions, because it must enforce the limits and show that your part of the key was never used without a reason. The interface only shows you totals for the last 24 hours, never the details.

## Technical data
- A session cookie, strictly necessary to keep you signed in.
- Requests to look up an invitation are rate limited by network address.

## Service providers
The portal runs on hosting and database services. They see technical data such as network addresses, and the data listed above. They are named in the project's third-party table.
`,
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "How personal data is handled.",
    body: `
## Who runs this
SQ Keys is a student prototype built for the BSA x EPFL hackathon, Swissquote track. It is not an official Swissquote product and is not run by a company.

## Why data is processed
To let you approve or decline requests for the clients you represent, to apply their limits, and to keep a journal that can be checked. Nothing is used for advertising or tracking.

## Data minimisation
Your biometric data never leaves your device. The portal does not receive the client's identity documents or Swissquote client number. The client's display name and wallet address are passed to you only because you need them to decide.

## Cookies
We only use cookies that are strictly necessary. There is no tracking and no cookie banner.

## Public blockchain
Transactions are written to a public blockchain. Those records cannot be erased, so a deletion request cannot reach them.

## Your rights
Under the Swiss Federal Act on Data Protection you may ask for access to your data, for its correction and for its deletion. Data that must be kept by law, and data on the public blockchain, cannot always be deleted. Send your request to the team that invited you.

## Transfers abroad
The hosting providers named in the third-party table may process data outside Switzerland.
`,
  },
];

export const findLegalDoc = (slug: string): LegalDoc | undefined => LEGAL_DOCS.find((d) => d.slug === slug);
