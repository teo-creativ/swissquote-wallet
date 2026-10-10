// Domain types of the Swissquote mock. They mirror sql/001_init.sql (CDC annex B.3). Timestamps are ISO strings.
// Addresses are stored in lower case. USDC and wei amounts are decimal integer strings in base units.

export type KycStatus = "none" | "verified";
export type IdentityOutcome = "pass" | "fail";

export type Client = {
  clientId: string;
  sqRef: string;
  name: string;
  passwordHash: string;
  kycStatus: KycStatus;
  kycCheckedAt: string | null;
  cashChf: number;
  identityOutcome: IdentityOutcome;
};
export type ClientPatch = Partial<Pick<Client, "kycStatus" | "kycCheckedAt" | "cashChf" | "identityOutcome">>;

export type WalletLink = { clientId: string; address: string; linkedAt: string };

export type OwnershipProof = {
  id: number;
  clientId: string;
  address: string;
  message: string;
  signature: string;
  method: string;
  verified: boolean;
  createdAt: string;
};

export type Transfer = { id: number; clientId: string; address: string; amountUsdc: string; txHash: string | null; createdAt: string };
export type GasDrip = { id: number; address: string; amountWei: string; txHash: string | null; createdAt: string };
export type ComplianceAlert = { id: number; account: string | null; target: string | null; reason: string | null; createdAt: string };
export type Call = { id: number; clientId: string | null; reason: string | null; createdAt: string };

export type IdentityCheck = {
  recoveryId: string;
  clientId: string;
  /** null while the check is pending. */
  outcome: IdentityOutcome | null;
  identityVerifiedAt: string | null;
  releaseAfter: string | null;
  cancelledAt: string | null;
  usedAt: string | null;
  oldAddress: string | null;
  createdAt: string;
};
export type IdentityCheckPatch = Partial<Pick<IdentityCheck, "outcome" | "identityVerifiedAt" | "releaseAfter" | "cancelledAt" | "usedAt">>;

export type AuditEntry = { id: number; ts: string; action: string; payload: Record<string, unknown>; prevHash: string; entryHash: string };
