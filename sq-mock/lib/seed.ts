// Demo data set (simulated). The demo password comes from SQ_DEMO_PASSWORD and is stored only as a scrypt hash.
import { randomUUID } from "node:crypto";
import { hashPassword } from "./passwords";
import type { Store } from "./store";

export const DEMO_CLIENTS = [
  { clientId: "client.lea", name: "Léa" },
  { clientId: "client.demo", name: "Aaron" },
] as const;
export const DEMO_CASH_CHF = 18165;

export const SANCTIONS_LIST_VERSION = "simulated-test-list-1";
/** Test addresses only (burn style addresses). Not taken from any real sanctions list. */
export const DEMO_SANCTIONED_ADDRESSES = [
  "0x000000000000000000000000000000000000dead",
  "0x00000000000000000000000000000000deadbeef",
] as const;

/** Idempotent: existing clients are left untouched. Resolves the ids of the clients that were created. */
export async function seedDemoData(store: Store, demoPassword: string | undefined): Promise<string[]> {
  for (const address of DEMO_SANCTIONED_ADDRESSES) await store.addSanction(address, SANCTIONS_LIST_VERSION);
  if (!demoPassword) return [];
  const created: string[] = [];
  for (const { clientId, name } of DEMO_CLIENTS) {
    if (await store.getClient(clientId)) continue;
    const isNew = await store.insertClientIfAbsent({
      clientId, sqRef: randomUUID(), name, passwordHash: hashPassword(demoPassword),
      kycStatus: "none", kycCheckedAt: null, cashChf: DEMO_CASH_CHF, identityOutcome: "pass",
    });
    if (isNew) created.push(clientId);
  }
  return created;
}
