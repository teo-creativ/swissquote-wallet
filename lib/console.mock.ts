// In-memory mock of sq-mock's /console/* routes (CDC A.3). State lives in the server process and resets on restart.
// Same function names and shapes as the live version so the screens do not change when sq-mock is plugged in.
// Server only: pages and server actions import this, client components never do.
import type {
  ComplianceAlert,
  ConsoleClient,
  IdentityOutcome,
  OwnershipProof,
  Recovery,
  SimulatedCall,
} from "./console.types";
import { DEMO_DELAY_SECONDS, deriveRecovery, IDENTITY_CHECK_MS } from "./console.logic";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

type Store = { recoveries: Recovery[]; clients: ConsoleClient[] };

function seed(): Store {
  const now = Date.now();
  // r1: finished long ago. r2: identity verified and lawyer approved a few seconds ago, delay still running (the live demo).
  // r3: identity failed (the attacker). r4: fresh request, nothing sent yet (run the whole flow from here).
  const r1Requested = now - 40 * MINUTE;
  const r2Requested = now - 25 * SECOND;
  const r3Requested = now - 3 * 60 * MINUTE;
  return {
    clients: [
      {
        id: "client.lea",
        number: "0042",
        displayName: "Léa Martin",
        address: "0x7A3e91c4B0d25F6e8aC1d3b7E94f20a6C58d1b03",
        status: "active",
        proofVerified: true,
        nextIdentityOutcome: "pass",
      },
      {
        id: "client.demo",
        number: "0031",
        displayName: "Demo Client",
        address: "0x2dC84e5F7b19a03C6e41B8d7a5F90c3E1a6B4d72",
        status: "recovery_requested",
        proofVerified: true,
        nextIdentityOutcome: "pass",
      },
      {
        id: "client.target",
        number: "0017",
        displayName: "Target Client",
        address: "0xB91f06aE3d5C47e8120a9F6b3c7D5e84a1F20c69",
        status: "recovery_requested",
        proofVerified: true,
        nextIdentityOutcome: "fail",
      },
    ],
    recoveries: [
      {
        id: "rec_0042_a",
        clientId: "client.lea",
        createdAt: r1Requested - MINUTE,
        identityRequestedAt: r1Requested,
        identityOutcome: "pass",
        delaySeconds: DEMO_DELAY_SECONDS,
        cancelledAt: null,
        cosignedAt: r1Requested + IDENTITY_CHECK_MS + DEMO_DELAY_SECONDS * SECOND + 4 * SECOND,
        proofHash: "0x9df4a1c7e30b52f68d94c0a7e1b3f5d2860c4a97be1f3d05a28c84c1b09e88d4",
      },
      {
        id: "rec_0031_a",
        clientId: "client.demo",
        createdAt: r2Requested - MINUTE,
        identityRequestedAt: r2Requested,
        identityOutcome: "pass",
        delaySeconds: DEMO_DELAY_SECONDS,
        cancelledAt: null,
        cosignedAt: null,
        proofHash: "0x4b7e20d9c5a18f36e07b2c94d1a85f3e6c0b97a24d8e13f5a60c7b92e1d4f3a8",
      },
      {
        id: "rec_0017_a",
        clientId: "client.target",
        createdAt: r3Requested - MINUTE,
        identityRequestedAt: r3Requested,
        identityOutcome: "fail",
        delaySeconds: DEMO_DELAY_SECONDS,
        cancelledAt: null,
        cosignedAt: null,
        proofHash: "0xe21a6f83b4d095c7a31e8f60d2b94c5a7e0f13d86b2c49a50e7d1f38c6b4a902",
      },
      {
        id: "rec_0017_b",
        clientId: "client.target",
        createdAt: now - 2 * MINUTE,
        identityRequestedAt: null,
        identityOutcome: null,
        delaySeconds: DEMO_DELAY_SECONDS,
        cancelledAt: null,
        cosignedAt: null,
        proofHash: "0x6c0d93e5a2f478b1d03e65c9a47f8b20e1d5a39c7f4b86e02a1d9c53f7e8b461",
      },
    ],
  };
}

// globalThis keeps one store when Next bundles the pages and the actions separately in dev.
const g = globalThis as typeof globalThis & { __sqConsoleStore?: Store };
const store = (g.__sqConsoleStore ??= seed());

export async function listRecoveries(): Promise<Recovery[]> {
  return [...store.recoveries].sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...r }));
}

export async function getRecovery(id: string): Promise<Recovery | null> {
  const r = store.recoveries.find((x) => x.id === id);
  return r ? { ...r } : null;
}

/** Sends the (simulated) identity check to the client. The result is the console setting for this client at this moment. */
export async function sendIdentityCheck(id: string): Promise<Recovery> {
  const r = store.recoveries.find((x) => x.id === id);
  if (!r) throw new Error("Recovery not found.");
  if (r.cancelledAt !== null) throw new Error("This recovery was cancelled.");
  if (r.identityRequestedAt !== null) throw new Error("The identity check was already sent.");
  const client = store.clients.find((c) => c.id === r.clientId);
  r.identityRequestedAt = Date.now();
  r.identityOutcome = client?.nextIdentityOutcome ?? "pass";
  return { ...r };
}

/** The demo switch (CDC 6.3): result of the next identity check for this client. */
export async function setNextIdentityOutcome(clientId: string, outcome: IdentityOutcome): Promise<ConsoleClient> {
  const c = store.clients.find((x) => x.id === clientId);
  if (!c) throw new Error("Client not found.");
  c.nextIdentityOutcome = outcome;
  return { ...c };
}

/** Releases Swissquote's share (P3). Enforces the same rules as the button: the node checks them again on its own. */
export async function cosignRelease(id: string): Promise<Recovery> {
  const r = store.recoveries.find((x) => x.id === id);
  if (!r) throw new Error("Recovery not found.");
  const now = Date.now();
  const view = deriveRecovery(r, now);
  if (r.cosignedAt !== null) throw new Error("Already co-signed.");
  if (!view.canCosign) throw new Error(view.cosignBlockedReason ?? "Co-signing is not possible yet.");
  r.cosignedAt = now;
  const client = store.clients.find((c) => c.id === r.clientId);
  if (client) client.status = "archived";
  return { ...r };
}

export async function listClients(): Promise<ConsoleClient[]> {
  return store.clients.map((c) => ({ ...c }));
}

export async function listProofs(): Promise<OwnershipProof[]> {
  const now = Date.now();
  return [
    ...store.clients.map((c, i) => ({
      id: `proof_${c.id}`,
      clientId: c.id,
      address: c.address,
      message: `I confirm I own the wallet ${c.address}. Client sq_${c.number}. ${new Date(now - (3 + i) * 24 * 60 * MINUTE).toISOString()}.`,
      signature: ["0x3f9a…c41b", "0x8d02…77e5", "0xa6c1…09f2"][i] ?? "0x…",
      verified: c.proofVerified,
      at: now - (3 + i) * 24 * 60 * MINUTE,
    })),
    {
      id: "proof_rejected",
      clientId: "client.target",
      address: "0xB91f06aE3d5C47e8120a9F6b3c7D5e84a1F20c69",
      message: `I confirm I own the wallet 0xB91f06aE3d5C47e8120a9F6b3c7D5e84a1F20c69. Client sq_0017. ${new Date(now - 4 * 24 * 60 * MINUTE).toISOString()}.`,
      signature: "0x51e7…d3a0",
      verified: false,
      at: now - 4 * 24 * 60 * MINUTE,
    },
  ].sort((a, b) => b.at - a.at);
}

/** Refused transfers are fixed history; recovery alerts come from the recoveries themselves. */
export async function listAlerts(): Promise<ComplianceAlert[]> {
  const now = Date.now();
  const alerts: ComplianceAlert[] = [
    {
      id: "alert_sanc_1",
      at: now - 26 * 60 * MINUTE,
      severity: "critical",
      kind: "sanctioned_transfer",
      clientId: "client.target",
      message: "Transfer of 8.00 USDC refused: destination 0x8576…1f3c is on the simulated sanctions list.",
    },
    {
      id: "alert_sanc_2",
      at: now - 5 * 24 * 60 * MINUTE,
      severity: "critical",
      kind: "sanctioned_transfer",
      clientId: "client.lea",
      message: "Transfer of 2.50 USDC refused: destination 0x4f0a…b7d2 is on the simulated sanctions list.",
    },
  ];
  for (const r of store.recoveries) {
    const v = deriveRecovery(r, now);
    alerts.push({
      id: `alert_req_${r.id}`,
      at: r.createdAt,
      severity: "info",
      kind: "recovery_requested",
      clientId: r.clientId,
      message: "Recovery requested from a new device. The client's lawyer was alerted.",
    });
    if (v.identityFailedAt !== null) {
      alerts.push({
        id: `alert_fail_${r.id}`,
        at: v.identityFailedAt,
        severity: "critical",
        kind: "identity_failed",
        clientId: r.clientId,
        message: "Identity check failed. Recovery blocked and the client's lawyer alerted.",
      });
    }
    if (r.cosignedAt !== null) {
      alerts.push({
        id: `alert_done_${r.id}`,
        at: r.cosignedAt,
        severity: "info",
        kind: "recovery_completed",
        clientId: r.clientId,
        message: "Swissquote co-signed the release of its share.",
      });
    }
  }
  return alerts.sort((a, b) => b.at - a.at);
}

/** Simulated phone calls to the client's registered number (CDC 6.2 step 2): one per recovery request, plus history. */
export async function listCalls(): Promise<SimulatedCall[]> {
  const phones: Record<string, string> = {
    "client.lea": "+41 79 *** ** 21",
    "client.demo": "+41 78 *** ** 64",
    "client.target": "+41 76 *** ** 08",
  };
  const calls: SimulatedCall[] = store.recoveries.map((r) => ({
    id: `call_${r.id}`,
    at: r.createdAt + 20 * SECOND,
    clientId: r.clientId,
    phone: phones[r.clientId] ?? "+41 ** *** ** **",
    reason: "Recovery requested from a new device",
    result: r.clientId === "client.target" ? "No answer" : "Answered",
  }));
  calls.push({
    id: "call_history_1",
    at: Date.now() - 2 * 24 * 60 * MINUTE,
    clientId: "client.demo",
    phone: phones["client.demo"],
    reason: "Gas top-up declined: daily limit reached",
    result: "Answered",
  });
  return calls.sort((a, b) => b.at - a.at);
}
