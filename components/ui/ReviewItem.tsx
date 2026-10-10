import { CircleCheck, TriangleAlert } from "lucide-react";
import { StatusChip } from "./StatusChip";

type ReviewItemProps = {
  title: string;
  description: string;
  /** "verified" shows a green check and a Verified chip; "warning" shows a warning triangle and a Warning chip. */
  status: "verified" | "warning";
  /** Overrides the chip text. */
  chipLabel?: string;
};

/** One line of the review screen (C9): icon + title + chip, reason underneath, separated by hairlines. */
export function ReviewItem({ title, description, status, chipLabel }: ReviewItemProps) {
  const Icon = status === "verified" ? CircleCheck : TriangleAlert;
  return (
    <div className="border-b border-line py-4 first:border-t">
      <div className="flex items-center gap-3">
        <Icon
          size={22}
          strokeWidth={1.75}
          className={status === "verified" ? "text-ok" : "text-brand"}
          aria-hidden="true"
        />
        <h3 className="flex-1 text-[22px] font-medium leading-7 text-ink">{title}</h3>
        <StatusChip status={status}>{chipLabel}</StatusChip>
      </div>
      <p className="mt-1 pl-[34px] text-sm leading-5 text-muted">{description}</p>
    </div>
  );
}
