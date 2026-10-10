import type { ReactNode } from "react";
import { Shield } from "lucide-react";
import type { ActivityItem, TxStatus } from "@/lib/sqkeys";
import { CoinIcon, RowCard, StatusChip } from "@/components/ui";
import type { ChipStatus } from "@/components/ui/StatusChip";

const chipFor = (status: TxStatus | undefined): ChipStatus | null => {
  if (!status || status === "confirmed") return null;
  if (status === "refused" || status === "failed" || status === "expired" || status === "cancelled") return "failed";
  return "pending";
};

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One line of the activity list (home and C14). Status chips carry icon + text. */
export function ActivityRow({ item }: { item: ActivityItem }) {
  const chip = chipFor(item.status);
  const sign = item.kind === "transfer_in" ? "+" : item.kind === "transfer_out" ? "-" : "";
  const leading: ReactNode = item.kind === "security" ? <Shield size={20} strokeWidth={1.75} /> : <CoinIcon coin="usdc" size={40} />;
  return (
    <RowCard
      leading={leading}
      title={item.title}
      subtitle={when(item.at)}
      trailing={
        chip ? (
          <StatusChip status={chip} />
        ) : item.amountUsdc ? (
          <span className="text-base font-semibold text-ink">{`${sign}${item.amountUsdc} USDC`}</span>
        ) : undefined
      }
    />
  );
}
