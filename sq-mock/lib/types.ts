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
  /** Safe mode (live): the account being recovered, the key that replaces P1, and what the P3 node signed. */
  safeAddress?: string | null;
  newOwnerAddress?: string | null;
  safeTxHash?: string | null;
  p3SignedAt?: string | null;
  executedTxHash?: string | null;
};
export type IdentityCheckPatch = Partial<Pick<IdentityCheck, "outcome" | "identityVerifiedAt" | "releaseAfter" | "cancelledAt" | "usedAt" | "safeTxHash" | "p3SignedAt" | "executedTxHash">>;

export type AuditEntry = { id: number; ts: string; action: string; payload: Record<string, unknown>; prevHash: string; entryHash: string };

/** The P3 owner key of one account. The private key exists only encrypted (AES-256-GCM, SQ_SHARE_ENC_KEY); hex strings. */
export type OwnerShare = {
  sqRef: string;
  generation: number;
  address: string;
  keyshareEnc: string;
  nonce: string;
  keyVersion: number;
  createdAt: string;
};
/** Public data of a Safe of this bank's clients. */
export type SafeAccount = {
  sqRef: string;
  safeAddress: string;
  p1Address: string;
  p2Address: string;
  p3Address: string;
  saltNonce: string;
  deployTxHash: string | null;
  createdAt: string;
};
export type SponsorKind = "deploy" | "exec";
export type SponsorAction = { id: number; kind: SponsorKind; sqRef: string | null; safeAddress: string | null; txHash: string | null; createdAt: string };
export type OperatorAction = { id: number; action: string; clientId: string | null; recoveryId: string | null; detail: Record<string, unknown>; createdAt: string };
