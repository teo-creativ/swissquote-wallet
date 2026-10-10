import type { Reason } from "@/lib/sqkeys";

/** Annex F.3, one line per policy reason. WITHIN_POLICY has no line: nothing to explain. */
export const REASON_TEXT: Partial<Record<Reason, string>> = {
  NEW_RECIPIENT: "New recipient: your lawyer must approve it once.",
  AMOUNT_ABOVE_THRESHOLD: "This amount is above your limit.",
  DAILY_CAP: "You reached your daily limit.",
  VELOCITY: "Too many transfers in the last hour.",
  DAILY_COUNT: "You reached your daily number of transfers.",
  TOO_MANY_PENDING: "Too many requests are waiting for your lawyer.",
  SANCTIONED_ADDRESS: "Swissquote can't process transfers to this address.",
  UNKNOWN_APP: "This app is not on the list of known apps.",
  UNLIMITED_APPROVAL: "This lets the app spend any amount.",
  INVALID_AMOUNT: "Enter an amount above 0.",
};

export const reasonLines = (reasons: Reason[]): string[] => reasons.map((r) => REASON_TEXT[r]).filter((t): t is string => Boolean(t));

/** Reasons that explain the "Address" line of the review, the rest go to "Amount". */
export const ADDRESS_REASONS: Reason[] = ["NEW_RECIPIENT", "SANCTIONED_ADDRESS"];
