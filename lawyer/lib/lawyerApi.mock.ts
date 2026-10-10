// In-memory mock of the lawyer portal API (CDC A.2). State lives in the browser tab and resets on reload.
// Same function names and shapes as lawyerApi.ts, so the screens do not change when the live version is plugged in.
// Nothing here is cryptography: hashes are display-only fakes and the "passkey prompt" is a timer.
import type {
  ClientView,
  JournalEntry,
  JournalEntryType,
  JournalView,
  PolicyEdit,
  RequestDetail,
  RequestKind,
  RequestStatus,
  RequestSummary,
  TimelineStep,
} from "./lawyerApi.types";
import { LawyerApiError } from "./lawyerApi.types";
import { diffPolicy, normalizeAmount, validatePolicy } from "./policy";

export const MOCK_TIMING = { readMs: 150, passkeyMs: 800 };
/** Annex F.1: "Demo mode: recovery delay is 2 minutes." */
const DEMO_DELAY_MS = 2 * 60_000;
const REQUEST_TTL_MS = 48 * 3_600_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const read = async () => sleep(MOCK_TIMING.readMs);
const passkey = async () => sleep(MOCK_TIMING.passkeyMs);

/** 64 hex characters that look like a SHA-256. NOT a hash function: display data for the mock only. */
function fakeHash(seed: string): string {
  let a = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < 64; round++) {
    for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ (seed.charCodeAt(i) + round), 0x01000193) >>> 0;
    out += a.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Obviously fake addresses.
const LEA = "0x7A3e91c4B0d25F6e8aC1d3b7E94f20a6C58d1b03";
const LEA_NEW = "0xE1b6C40a9D3f58270c1E7aB4d96F03e85A2c1d7F";
const DEMO = "0x2B4f6a90C1e8D3752aF0b9E6c4D18a7F35e0c912";
const KNOWN_1 = "0x3fD8a1C6e5B702d94A0c7E18b6F35d29a4C0e8B1";
const KNOWN_2 = "0x84c0E5a7B1d3F962e0A4c8D7b5F13e69a2C0d4E8";
const NEW_1 = "0x9c1D5e07A2b84F36d0E9a5C7b13F48e2d6A0b7c4";
const NEW_2 = "0x51aE0b3C7d92F4608e1B5a7D3c9F206e48b1d7A5";
const EXIT_TO = "0xA04c7E19d3B5f6280c1E7a9D4b36F85e02C1d7b9";

type StoredRequest = RequestDetail;

type Store = {
  me: { displayName: string };
  clients: Omit<ClientView, "pendingRequests" | "policyVersion">[];
  policies: Record<string, PolicyEdit & { version: number }>;
  requests: StoredRequest[];
  journal: JournalEntry[];
  nextRequest: number;
};

const iso = (ms: number) => new Date(ms).toISOString();

function timeline(labels: string[], states: TimelineStep["state"][], times: (string | undefined)[] = []): TimelineStep[] {
  return labels.map((label, i) => ({ label, state: states[i], at: times[i] }));
}

function seed(): Store {
  const now = Date.now();

  const policies: Store["policies"] = {
    "client.lea": {
      perTxCap: "5.00", dailyCap: "10.00", hourlyCount: 3, dailyCount: 6,
      newRecipientRequiresLawyer: true, approvedRecipients: [KNOWN_1, KNOWN_2], version: 3,
    },
    "client.demo": {
      perTxCap: "20.00", dailyCap: "50.00", hourlyCount: 5, dailyCount: 10,
      newRecipientRequiresLawyer: true, approvedRecipients: [KNOWN_1], version: 1,
    },
  };
  const limits = (id: string) => {
    const { perTxCap, dailyCap, hourlyCount, dailyCount, newRecipientRequiresLawyer } = policies[id];
    return { perTxCap, dailyCap, hourlyCount, dailyCount, newRecipientRequiresLawyer };
  };

  const base = (
    n: number, clientId: string, clientName: string, kind: RequestKind, status: RequestStatus, createdAgo: number,
  ): Pick<StoredRequest, "id" | "clientId" | "clientName" | "kind" | "status" | "createdAt" | "expiresAt" | "limits" | "intentHash"> => ({
    id: `req_${String(n).padStart(2, "0")}`,
    clientId,
    clientName,
    kind,
    status,
    createdAt: iso(now - createdAgo),
    expiresAt: iso(now - createdAgo + REQUEST_TTL_MS),
    limits: limits(clientId),
    intentHash: fakeHash(`intent-${n}`),
  });

  const recoveryLabels = ["Identity verified", "Lawyer approval", "Waiting period", "Moving your funds", "Done"];
  const exitLabels = ["Request received", "Lawyer approval", "Waiting period", "Moving your funds", "Done"];

  const requests: StoredRequest[] = [
    // Pending: transfer above the limit.
    {
      ...base(1, "client.lea", "Léa Martin", "transfer", "pending", 4 * MINUTE),
      amount: "12.00", to: NEW_1, reasons: ["AMOUNT_ABOVE_THRESHOLD", "NEW_RECIPIENT"], recipientKnown: false,
      recipientHistory: [{ at: iso(now - 21 * DAY), amount: "8.00", result: "approved" }],
    },
    // Pending: new recipient, small amount.
    {
      ...base(2, "client.demo", "Demo Client", "transfer", "pending", 37 * MINUTE),
      amount: "3.00", to: NEW_2, reasons: ["NEW_RECIPIENT"], recipientKnown: false, recipientHistory: [],
    },
    // Pending: recovery (identity verified by Swissquote, waiting for the lawyer).
    {
      ...base(3, "client.lea", "Léa Martin", "recovery", "pending", 9 * MINUTE),
      reasons: [], recipientKnown: false, recipientHistory: [],
      recovery: {
        oldAddress: LEA, newAddress: LEA_NEW, identity: "verified",
        timeline: timeline(recoveryLabels, ["done", "current", "todo", "todo", "todo"], [iso(now - 8 * MINUTE)]),
      },
    },
    // Pending: exit request without Swissquote (always manual).
    {
      ...base(4, "client.demo", "Demo Client", "exit", "pending", HOUR),
      to: EXIT_TO, reasons: [], recipientKnown: false, recipientHistory: [],
      recovery: {
        oldAddress: DEMO,
        timeline: timeline(exitLabels, ["done", "current", "todo", "todo", "todo"], [iso(now - HOUR)]),
      },
    },
    // Already decided, so the L5 filters have something to show.
    {
      ...base(5, "client.lea", "Léa Martin", "transfer", "approved", 21 * DAY),
      amount: "8.00", to: NEW_1, reasons: ["AMOUNT_ABOVE_THRESHOLD"], recipientKnown: false,
      recipientHistory: [], decidedAt: iso(now - 21 * DAY + 20 * MINUTE),
    },
    {
      ...base(6, "client.demo", "Demo Client", "transfer", "refused", 3 * DAY),
      amount: "45.00", to: NEW_2, reasons: ["AMOUNT_ABOVE_THRESHOLD", "DAILY_CAP"], recipientKnown: false,
      recipientHistory: [], decidedAt: iso(now - 3 * DAY + 2 * HOUR),
    },
    {
      ...base(7, "client.lea", "Léa Martin", "transfer", "expired", 5 * DAY),
      amount: "6.00", to: NEW_2, reasons: ["AMOUNT_ABOVE_THRESHOLD"], recipientKnown: false, recipientHistory: [],
    },
  ];

  // 20 entries, oldest first. Hashes are chained so the head changes when something is appended.
  const rows: [number, JournalEntryType, string | undefined, string][] = [
    [30 * DAY, "LOGIN", undefined, "Account created with a passkey."],
    [30 * DAY - HOUR, "POLICY_CHANGED", "Léa Martin", "Policy v1 saved: default limits."],
    [29 * DAY, "RECIPIENT_ADDED", "Léa Martin", `Known recipient added: ${short(KNOWN_1)}.`],
    [28 * DAY, "LOGIN", undefined, "Signed in with passkey."],
    [27 * DAY, "POLICY_CHANGED", "Demo Client", "Policy v1 saved: default limits."],
    [27 * DAY - HOUR, "RECIPIENT_ADDED", "Demo Client", `Known recipient added: ${short(KNOWN_1)}.`],
    [25 * DAY, "LAWYER_DECIDED", "Léa Martin", "Approved 4.50 USDC to 0x3fD8…e8B1."],
    [24 * DAY, "LOGIN", undefined, "Signed in with passkey."],
    [23 * DAY, "LAWYER_DECIDED", "Demo Client", "Declined 30.00 USDC to 0x51aE…d7A5."],
    [21 * DAY, "LAWYER_DECIDED", "Léa Martin", "Approved 8.00 USDC to 0x9c1D…b7c4."],
    [20 * DAY, "POLICY_CHANGED", "Léa Martin", "Policy v2 saved: Per day 5.00 → 10.00 USDC."],
    [18 * DAY, "RECIPIENT_ADDED", "Léa Martin", `Known recipient added: ${short(KNOWN_2)}.`],
    [14 * DAY, "LOGIN", undefined, "Signed in with passkey."],
    [12 * DAY, "RECOVERY_REQUESTED", "Demo Client", "Recovery requested. Identity check failed. Nothing continued."],
    [9 * DAY, "POLICY_CHANGED", "Léa Martin", "Policy v3 saved: Transfers per hour 2 → 3."],
    [7 * DAY, "LAWYER_DECIDED", "Léa Martin", "Approved 5.50 USDC to 0x84c0…d4E8."],
    [5 * DAY, "LOGIN", undefined, "Signed in with passkey."],
    [3 * DAY - 2 * HOUR, "LAWYER_DECIDED", "Demo Client", "Declined 45.00 USDC to 0x51aE…d7A5."],
    [2 * DAY, "RECIPIENT_REVOKED", "Demo Client", `Known recipient revoked: ${short(KNOWN_2)}.`],
    [3 * HOUR, "LOGIN", undefined, "Signed in with passkey."],
  ];
  let prev = "genesis";
  const journal = rows.map(([ago, type, clientName, summary], i): JournalEntry => {
    const hash = fakeHash(prev + summary + i).slice(0, 16);
    prev = hash;
    return { seq: i + 1, at: iso(now - ago), type, clientName, summary, hash };
  });

  return {
    me: { displayName: "Demo Lawyer" },
    clients: [
      { id: "client.lea", displayName: "Léa Martin", address: LEA, status: "active" },
      { id: "client.demo", displayName: "Demo Client", address: DEMO, status: "active" },
    ],
    policies,
    requests,
    journal,
    nextRequest: 8,
  };
}

let store = seed();

/** Tests only: back to the seeded state. */
export function resetMock(): void {
  store = seed();
}

const clone = <T>(value: T): T => structuredClone(value);

function append(type: JournalEntryType, summary: string, clientName?: string): void {
  const last = store.journal[store.journal.length - 1];
  store.journal.push({
    seq: last.seq + 1,
    at: iso(Date.now()),
    type,
    clientName,
    summary,
    hash: fakeHash(last.hash + summary + last.seq).slice(0, 16),
  });
}

/** Expiry is computed when read (CDC A.2), and a finished waiting period completes the timeline. */
function settle(): void {
  const now = Date.now();
  for (const r of store.requests) {
    if (r.status === "pending" && Date.parse(r.expiresAt) <= now) r.status = "expired";
    const rec = r.recovery;
    if (r.status === "approved" && rec?.delayEndsAt && Date.parse(rec.delayEndsAt) <= now) {
      for (const step of rec.timeline) step.state = "done";
      const client = store.clients.find((c) => c.id === r.clientId);
      if (client?.status === "recovering") client.status = "active";
    }
  }
}

const summaryOf = (r: StoredRequest): RequestSummary => ({
  id: r.id, clientId: r.clientId, clientName: r.clientName, kind: r.kind, status: r.status,
  amount: r.amount, to: r.to, createdAt: r.createdAt, expiresAt: r.expiresAt,
});

const policyOf = (clientId: string) => {
  const p = store.policies[clientId];
  if (!p) throw new LawyerApiError("CLIENT_NOT_FOUND", "This client does not exist.");
  return p;
};

// Invitation and sign-in ---------------------------------------------------------------------

export async function inspectInvitation(token: string) {
  await read();
  // The mock accepts any token except "expired" and "used", so every L1 state can be reached.
  if (!token || token === "expired" || token === "used") return { valid: false, clientDisplayName: "", expiresAt: iso(Date.now()) };
  return { valid: true, clientDisplayName: "Léa Martin", expiresAt: iso(Date.now() + 7 * DAY) };
}

export async function acceptInvitation(token: string, i: { displayName: string; firm: string }): Promise<void> {
  await passkey();
  if (token === "expired" || token === "used") throw new LawyerApiError("INVITATION_INVALID", "This invitation is no longer valid.");
  if (!i.displayName.trim()) throw new LawyerApiError("INVALID_INPUT", "Enter your name.");
  store.me.displayName = i.displayName.trim();
  append("LOGIN", "Account created with a passkey.");
}

export async function login(): Promise<void> {
  await passkey();
  append("LOGIN", "Signed in with passkey.");
}

export async function getMe() {
  await read();
  settle();
  return {
    displayName: store.me.displayName,
    clients: store.clients.length,
    pendingRequests: store.requests.filter((r) => r.status === "pending").length,
  };
}

// Clients and requests ---------------------------------------------------------------------

export async function getClients(): Promise<ClientView[]> {
  await read();
  settle();
  return clone(
    store.clients.map((c) => ({
      ...c,
      pendingRequests: store.requests.filter((r) => r.clientId === c.id && r.status === "pending").length,
      policyVersion: store.policies[c.id].version,
    })),
  );
}

export async function getRequests(status?: RequestStatus): Promise<RequestSummary[]> {
  await read();
  settle();
  const list = store.requests
    .filter((r) => !status || r.status === status)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return clone(list.map(summaryOf));
}

export async function getRequest(id: string): Promise<RequestDetail> {
  await read();
  settle();
  const r = store.requests.find((x) => x.id === id);
  if (!r) throw new LawyerApiError("NOT_FOUND", "This request does not exist.");
  const p = store.policies[r.clientId];
  // Limits and "known recipient" follow the client's current policy.
  return clone({
    ...r,
    limits: {
      perTxCap: p.perTxCap, dailyCap: p.dailyCap, hourlyCount: p.hourlyCount, dailyCount: p.dailyCount,
      newRecipientRequiresLawyer: p.newRecipientRequiresLawyer,
    },
    recipientKnown: r.kind === "transfer" && !!r.to && p.approvedRecipients.some((a) => a.toLowerCase() === r.to!.toLowerCase()),
  });
}

/**
 * Approve or refuse after a simulated passkey prompt.
 * `refuse` on an approved recovery or exit whose waiting period is still running cancels it ("Cancel recovery", L7).
 */
export async function decide(id: string, decision: "approve" | "refuse", opts?: { addRecipient?: boolean }): Promise<void> {
  await passkey();
  settle();
  const r = store.requests.find((x) => x.id === id);
  if (!r) throw new LawyerApiError("NOT_FOUND", "This request does not exist.");

  const rec = r.recovery;
  const cancelling =
    decision === "refuse" && r.status === "approved" && !!rec?.delayEndsAt && Date.parse(rec.delayEndsAt) > Date.now();
  if (r.status === "expired") throw new LawyerApiError("REQUEST_EXPIRED", "This request expired. Nothing was sent.");
  if (r.status !== "pending" && !cancelling) throw new LawyerApiError("REQUEST_NOT_PENDING", "This request was already decided.");
  if (decision === "approve" && rec?.identity === "failed") {
    throw new LawyerApiError("IDENTITY_NOT_VERIFIED", "Swissquote could not verify this client's identity.");
  }

  const now = Date.now();
  const client = store.clients.find((c) => c.id === r.clientId);
  r.decidedAt = iso(now);

  if (r.kind === "transfer") {
    r.status = decision === "approve" ? "approved" : "refused";
    const verb = decision === "approve" ? "Approved" : "Declined";
    append("LAWYER_DECIDED", `${verb} ${r.amount} USDC to ${short(r.to!)}.`, r.clientName);
    const policy = store.policies[r.clientId];
    const known = policy.approvedRecipients.some((a) => a.toLowerCase() === r.to!.toLowerCase());
    if (decision === "approve" && opts?.addRecipient && !known) {
      policy.approvedRecipients.push(r.to!);
      append("RECIPIENT_ADDED", `Known recipient added: ${short(r.to!)}.`, r.clientName);
    }
    return;
  }

  // Recovery or exit.
  const word = r.kind === "recovery" ? "Recovery" : "Exit request";
  const type: JournalEntryType = r.kind === "recovery" ? "RECOVERY_DECIDED" : "EXIT_DECIDED";
  if (decision === "approve" && rec) {
    r.status = "approved";
    rec.delayEndsAt = iso(now + DEMO_DELAY_MS);
    rec.timeline[1] = { ...rec.timeline[1], state: "done", at: iso(now) };
    rec.timeline[2] = { ...rec.timeline[2], state: "current" };
    if (r.kind === "recovery" && client) client.status = "recovering";
    append(type, `${word} approved. Waiting period ends ${iso(now + DEMO_DELAY_MS).slice(11, 16)} UTC.`, r.clientName);
  } else {
    r.status = "refused";
    if (rec) {
      rec.delayEndsAt = undefined;
      const stopAt = cancelling ? 2 : 1;
      rec.timeline = rec.timeline.map((s, i) => (i === stopAt ? { ...s, state: "failed" as const, at: iso(now) } : i > stopAt ? { ...s, state: "todo" as const } : s));
    }
    if (client?.status === "recovering") client.status = "active";
    append(type, cancelling ? `${word} cancelled during the waiting period.` : `${word} declined.`, r.clientName);
  }
}

// Policy ------------------------------------------------------------------------------------

export async function getPolicy(clientId: string): Promise<PolicyEdit> {
  await read();
  return clone(policyOf(clientId));
}

export async function updatePolicy(clientId: string, p: PolicyEdit): Promise<void> {
  await passkey();
  const current = policyOf(clientId);
  const problems = validatePolicy(p);
  if (problems.length > 0) throw new LawyerApiError("INVALID_POLICY", problems[0]);
  if (p.version !== undefined && p.version !== current.version) {
    throw new LawyerApiError("POLICY_VERSION_CONFLICT", "This policy changed since you opened it. Reload and try again.");
  }
  const next = {
    ...p,
    perTxCap: normalizeAmount(p.perTxCap)!,
    dailyCap: normalizeAmount(p.dailyCap)!,
  };
  const diff = diffPolicy(current, next);
  if (diff.isEmpty) return;

  const clientName = store.clients.find((c) => c.id === clientId)?.displayName;
  const version = current.version + 1;
  if (diff.changes.length > 0) {
    const text = diff.changes.map((c) => `${c.label} ${c.before} → ${c.after}`).join("; ");
    append("POLICY_CHANGED", `Policy v${version} saved: ${text}.`, clientName);
  }
  for (const a of diff.addedRecipients) append("RECIPIENT_ADDED", `Known recipient added: ${short(a)}.`, clientName);
  for (const a of diff.removedRecipients) append("RECIPIENT_REVOKED", `Known recipient revoked: ${short(a)}.`, clientName);
  store.policies[clientId] = { ...next, approvedRecipients: [...next.approvedRecipients], version };
}

// Journal -----------------------------------------------------------------------------------

export async function getJournal(limit = 50): Promise<JournalView> {
  await read();
  const entries = store.journal.slice(-Math.max(0, limit)).reverse();
  return clone({
    entries,
    fingerprint: store.journal[store.journal.length - 1].hash,
    integrity: { ok: true, checkedEntries: store.journal.length },
    // Totals only (CDC 7.1).
    autoDecisions24h: { count: 14, totalUsdc: "37.00" },
  });
}

export async function verifyAudit(): Promise<{ ok: boolean; checkedEntries: number; firstFailure?: string }> {
  await sleep(MOCK_TIMING.readMs * 4);
  return { ok: true, checkedEntries: store.journal.length };
}
