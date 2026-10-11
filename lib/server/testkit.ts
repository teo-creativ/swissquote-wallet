// Test helpers for the client app server: in-memory database, fake chain, and scripted fakes of the two peers (Swissquote and the lawyer
// node). The fakes keep the behaviour the client relies on and record every call, so tests can check what was asked of each peer.
// Not imported by any route.
import { getAddress, toFunctionSelector, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { saltNonceFor } from "@/lib/shared/safe";
import type { SafeState, ClientChain } from "./chain";
import { readConfig, type Ctx } from "./ctx";
import { newMemoryDb } from "./db";
import { ApiError } from "./errors";
import type { Peer } from "./peers";

export const T0 = new Date("2026-10-11T12:00:00.000Z");
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
export const key = () => privateKeyToAccount(generatePrivateKey()); // throwaway test keys

export class FakeClientChain implements ClientChain {
  safes = new Map<string, SafeState>();
  usdc = new Map<string, bigint>();
  async getSafeState(safe: Address): Promise<SafeState> {
    const s = this.safes.get(safe.toLowerCase());
    if (!s) throw new Error("no such safe");
    return { owners: [...s.owners], nonce: s.nonce, threshold: s.threshold };
  }
  async usdcBalance(a: Address) { return this.usdc.get(a.toLowerCase()) ?? 0n; }
  async ethBalance() { return 0n; }
}

type Call = { peer: "sq" | "lawyer"; method: "GET" | "POST"; path: string; body: Record<string, any> };

/** Scripted peers. `script` can be overridden per test to make a peer answer differently. */
export class Peers {
  calls: Call[] = [];
  script: Record<string, (body: Record<string, any>) => any> = {};
  sqRef = "11111111-1111-4111-8111-111111111111";
  safeAddress: Address = key().address;
  p2 = key();
  p3 = key();
  kycStatus = "none";
  lawyerAccepted = false;
  lawyerReq = { status: "pending" as string, signature: undefined as Hex | undefined };
  recovery = { identityVerified: false, identityFailed: false, cancelled: false, delayElapsed: false, releaseAfter: null as string | null };
  lawyerRecovery = { status: "pending", signature: undefined as Hex | undefined, safeTxHash: undefined as Hex | undefined };
  transferOutcome: { status: "signed" | "pending" | "refused"; outcome: string; reasons: string[] } = { status: "signed", outcome: "AUTO", reasons: ["WITHIN_POLICY"] };
  deployedOwners: Address[] = [];
  constructor(private chain: FakeClientChain) {}

  private reply(peer: "sq" | "lawyer", method: "GET" | "POST", path: string, body: Record<string, any>) {
    const route = path.split("?")[0];
    this.calls.push({ peer, method, path: route, body });
    const custom = this.script[`${peer} ${method} ${route}`];
    if (custom) return custom(body);
    if (peer === "sq") return this.sqReply(route, body);
    return this.lawyerReply(route, body);
  }

  private sqReply(route: string, body: Record<string, any>): any {
    switch (route) {
      case "/api/login": {
        if (body.password !== "demo1234") throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong client ID or password.");
        return { sqRef: this.sqRef, displayName: "Léa Müller", kycStatus: this.kycStatus, simulated: true };
      }
      case "/api/kyc": this.kycStatus = "verified"; return { kycStatus: "verified", simulated: true };
      case "/api/node/owner/create": return { address: this.p3.address };
      case "/api/gas/deploy": {
        this.deployedOwners = body.owners;
        this.chain.safes.set(this.safeAddress.toLowerCase(), { owners: body.owners, nonce: 0n, threshold: 2 });
        return { address: this.safeAddress, txHash: `0x${"d".repeat(64)}`, alreadyDeployed: false };
      }
      case "/api/gas/exec": {
        const s = this.chain.safes.get(String(body.safeAddress).toLowerCase())!;
        s.nonce += 1n;
        if (body.safeTx.data.startsWith(toFunctionSelector("swapOwner(address,address,address)"))) s.owners = [this.recoveryNewOwner!, ...s.owners.slice(1)]; // swapOwner selector
        return { txHash: `0x${s.nonce.toString(16).padStart(64, "e")}` };
      }
      case "/api/bank/transfer": return { txHash: `0x${"b".repeat(64)}`, debitedChf: 9, bankDebitSimulated: true };
      case "/api/bank-account": return { cashChf: 18165, simulated: true };
      case "/api/recovery/open": return { status: "pending", simulated: true };
      case "/api/recovery/attach": this.recoveryNewOwner = getAddress(body.newOwnerAddress); return { attached: true };
      case "/api/recovery/identity/verify": {
        const ok = body.bankingAnswer === "right" && !this.recovery.identityFailed;
        this.recovery.identityVerified = ok;
        this.recovery.identityFailed = !ok;
        this.recovery.releaseAfter = ok ? new Date(T0.getTime() + 120_000).toISOString() : null;
        return { verified: ok, releaseAfter: this.recovery.releaseAfter, simulated: true };
      }
      case "/api/recovery/status": return { ...this.recovery, safeAddress: this.safeAddress };
      case "/api/recovery/cancel": this.recovery.cancelled = true; return { cancelled: true };
      case "/api/recovery/executed": return { done: true };
      case "/api/node/sign": return { signature: `0x${"3".repeat(130)}`, signer: this.p3.address, safeTxHash: body.safeTxHash };
    }
    throw new ApiError(404, "UNKNOWN", `sq fake: ${route}`);
  }
  recoveryNewOwner: Address | null = null;

  private lawyerReply(route: string, body: Record<string, any>): any {
    switch (route) {
      case "/api/invite/register": return { expiresAt: new Date(T0.getTime() + 7 * 86400_000).toISOString(), alreadyRegistered: false };
      case "/api/invite/status": return this.lawyerAccepted ? { status: "accepted", lawyerName: "Maître Dupont", walletRegistered: false } : { status: "invited" };
      case "/api/node/owner/create": return { address: this.p2.address };
      case "/api/node/wallet/register": return { registered: true, safeAddress: body.safeAddress };
      case "/api/node/policy": return { perTxCap: "5.00", dailyCap: "10.00", hourlyCount: 3, dailyCount: 6, newRecipientRequiresLawyer: true, approvedRecipients: [] };
      case "/api/node/transfer/check": return { outcome: this.transferOutcome.outcome, reasons: this.transferOutcome.reasons };
      case "/api/node/transfer/request": {
        const t = this.transferOutcome;
        if (t.status === "signed") return { ...t, signature: `0x${"2".repeat(130)}`, signer: this.p2.address, expiresAt: new Date(T0.getTime() + 120_000).toISOString() };
        if (t.status === "pending") return { ...t, requestId: "22222222-2222-4222-8222-222222222222", expiresAt: new Date(T0.getTime() + 180_000).toISOString() };
        return t;
      }
      case "/api/node/transfer/status": return { status: this.lawyerReq.status, ...(this.lawyerReq.signature ? { signature: this.lawyerReq.signature } : {}) };
      case "/api/node/recovery/request": return { status: "pending", requestId: "33333333-3333-4333-8333-333333333333" };
      case "/api/node/recovery/status": return { status: this.lawyerRecovery.status, ...(this.lawyerRecovery.signature ? { signature: this.lawyerRecovery.signature, safeTxHash: this.lawyerRecovery.safeTxHash } : {}) };
    }
    throw new ApiError(404, "UNKNOWN", `lawyer fake: ${route}`);
  }

  peer(which: "sq" | "lawyer"): Peer {
    return {
      post: async (path, body) => this.reply(which, "POST", path, body),
      get: async (path, query) => this.reply(which, "GET", path + (query ? `?${new URLSearchParams(query)}` : ""), query ?? {}),
    };
  }
  ofPath(path: string) { return this.calls.filter((c) => c.path === path); }
}

export function testCtx(now: Date = T0, over: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: "test", SESSION_SECRET: "s".repeat(40), NEXT_PUBLIC_LAWYER_URL: "https://lawyer.test", NEXT_PUBLIC_EXPLORER_URL: "https://sepolia.basescan.org", ...over,
  };
  const chain = new FakeClientChain();
  const peers = new Peers(chain);
  const ctx: Ctx = { db: newMemoryDb(), sq: peers.peer("sq"), lawyer: peers.peer("lawyer"), chain, config: readConfig(env), env, now, sleep: async () => {} };
  return { ctx, chain, peers, at: (ms: number): Ctx => ({ ...ctx, now: new Date(now.getTime() + ms) }) };
}

export const sqRefSalt = (sqRef: string) => saltNonceFor(sqRef).toString();
