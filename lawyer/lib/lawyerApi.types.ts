// Lawyer portal front contract (CDC annex D.2). Detailed view types are drafted by prompt lawyer/02.
export type RequestStatus = "pending" | "approved" | "refused" | "expired";
export interface PolicyEdit {
  perTxCap: string; dailyCap: string; hourlyCount: number; dailyCount: number;
  newRecipientRequiresLawyer: boolean; approvedRecipients: string[]; version?: number;
}
