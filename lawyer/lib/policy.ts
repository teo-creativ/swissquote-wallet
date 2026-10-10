// Pure helpers for the policy screen (L8): validation and the diff shown before the passkey prompt.
import type { PolicyEdit } from "./lawyerApi.types";

export type PolicyField = "perTxCap" | "dailyCap" | "hourlyCount" | "dailyCount" | "newRecipientRequiresLawyer";

export interface PolicyChange {
  field: PolicyField;
  /** Annex F.5 labels where they exist. */
  label: string;
  before: string;
  after: string;
}

export interface PolicyDiff {
  changes: PolicyChange[];
  addedRecipients: string[];
  removedRecipients: string[];
  isEmpty: boolean;
}

const LABELS: Record<PolicyField, string> = {
  perTxCap: "Per transfer",
  dailyCap: "Per day",
  hourlyCount: "Transfers per hour",
  dailyCount: "Transfers per day",
  newRecipientRequiresLawyer: "An unknown recipient needs my approval",
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const isAddress = (value: string): boolean => ADDRESS.test(value);

/** "5" -> "5.00", "5.5" -> "5.50", "5.000000" -> "5.00". Returns null when not a valid USDC amount (max 6 decimals). */
export function normalizeAmount(value: string): string | null {
  const v = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(v)) return null;
  const [int, frac = ""] = v.split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(int).toString()}.${trimmed}`;
}

const key = (address: string) => address.toLowerCase();

/** Everything that changes between two policies. Amounts compare by value ("5" equals "5.00"); recipients by lowercase address. */
export function diffPolicy(before: PolicyEdit, after: PolicyEdit): PolicyDiff {
  const changes: PolicyChange[] = [];
  const amount = (v: string) => normalizeAmount(v) ?? v;

  for (const field of ["perTxCap", "dailyCap"] as const) {
    if (amount(before[field]) !== amount(after[field])) {
      changes.push({ field, label: LABELS[field], before: `${amount(before[field])} USDC`, after: `${amount(after[field])} USDC` });
    }
  }
  for (const field of ["hourlyCount", "dailyCount"] as const) {
    if (before[field] !== after[field]) {
      changes.push({ field, label: LABELS[field], before: String(before[field]), after: String(after[field]) });
    }
  }
  if (before.newRecipientRequiresLawyer !== after.newRecipientRequiresLawyer) {
    const yesNo = (b: boolean) => (b ? "On" : "Off");
    changes.push({
      field: "newRecipientRequiresLawyer",
      label: LABELS.newRecipientRequiresLawyer,
      before: yesNo(before.newRecipientRequiresLawyer),
      after: yesNo(after.newRecipientRequiresLawyer),
    });
  }

  const was = new Set(before.approvedRecipients.map(key));
  const now = new Set(after.approvedRecipients.map(key));
  const addedRecipients = unique(after.approvedRecipients).filter((a) => !was.has(key(a)));
  const removedRecipients = unique(before.approvedRecipients).filter((a) => !now.has(key(a)));

  return {
    changes,
    addedRecipients,
    removedRecipients,
    isEmpty: changes.length === 0 && addedRecipients.length === 0 && removedRecipients.length === 0,
  };
}

function unique(addresses: string[]): string[] {
  const seen = new Set<string>();
  return addresses.filter((a) => (seen.has(key(a)) ? false : (seen.add(key(a)), true)));
}

export type PolicyFieldErrors = Partial<Record<"perTxCap" | "dailyCap" | "hourlyCount" | "dailyCount" | "approvedRecipients", string>>;

/** One message per field, so the form can show it next to the input. Empty object = the policy can be saved. */
export function policyFieldErrors(p: PolicyEdit): PolicyFieldErrors {
  const errors: PolicyFieldErrors = {};
  const perTx = normalizeAmount(p.perTxCap);
  const daily = normalizeAmount(p.dailyCap);
  if (perTx === null) errors.perTxCap = "Per transfer must be an amount in USDC, for example 5.00.";
  if (daily === null) errors.dailyCap = "Per day must be an amount in USDC, for example 10.00.";
  if (perTx && daily && Number(perTx) > Number(daily)) errors.perTxCap = "Per transfer cannot be higher than per day.";
  if (!Number.isInteger(p.hourlyCount) || p.hourlyCount < 0) errors.hourlyCount = "Transfers per hour must be a whole number, 0 or more.";
  if (!Number.isInteger(p.dailyCount) || p.dailyCount < 0) errors.dailyCount = "Transfers per day must be a whole number, 0 or more.";
  const bad = p.approvedRecipients.find((a) => !ADDRESS.test(a));
  if (bad !== undefined) errors.approvedRecipients = `"${bad}" is not a valid address.`;
  return errors;
}

/** Human-readable problems, empty when the policy can be saved. */
export function validatePolicy(p: PolicyEdit): string[] {
  return Object.values(policyFieldErrors(p));
}
