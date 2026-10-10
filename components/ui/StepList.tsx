import { Check, Circle, X } from "lucide-react";
import { Spinner } from "./Spinner";

export type StepStatus = "todo" | "active" | "done" | "error";

export type Step = {
  label: string;
  status: StepStatus;
};

const statusText: Record<StepStatus, string> = {
  todo: "Not started",
  active: "In progress",
  done: "Done",
  error: "Failed",
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "active") return <Spinner size={22} label="" />;
  if (status === "done") {
    return (
      <span className="flex size-[22px] items-center justify-center rounded-full bg-ok text-white">
        <Check size={14} strokeWidth={2.25} aria-hidden="true" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex size-[22px] items-center justify-center rounded-full bg-danger text-white">
        <X size={14} strokeWidth={2.25} aria-hidden="true" />
      </span>
    );
  }
  return <Circle size={22} strokeWidth={1.75} className="text-muted" aria-hidden="true" />;
}

/** Vertical list of steps using the RowCard look. Each step states its status in text (read by screen readers). */
export function StepList({ steps, className = "" }: { steps: Step[]; className?: string }) {
  return (
    <ol className={`flex flex-col gap-3 ${className}`}>
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.status === "active" ? "step" : undefined}
          className="flex min-h-14 items-center gap-3 rounded-card bg-surface px-4 py-3"
        >
          <StepIcon status={step.status} />
          <span className={`flex-1 text-base font-medium ${step.status === "todo" ? "text-muted" : "text-ink"}`}>
            {step.label}
          </span>
          <span className="sr-only">{statusText[step.status]}</span>
        </li>
      ))}
    </ol>
  );
}
