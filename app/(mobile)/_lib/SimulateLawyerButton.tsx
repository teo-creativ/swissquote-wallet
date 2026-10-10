"use client";

import { Button, SimulatedPill } from "@/components/ui";
import { isMockMode } from "@/lib/sqkeys.mode";
import { acceptMockLawyerInvite } from "@/lib/sqkeys.mock";

/** Dev-only shortcut: the simulated lawyer accepts now. Renders nothing unless NEXT_PUBLIC_SQKEYS_MODE=mock. */
export function SimulateLawyerButton({ onDone }: { onDone: () => void }) {
  if (!isMockMode) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <SimulatedPill>Simulated</SimulatedPill>
      <Button
        variant="secondary"
        onClick={() => {
          acceptMockLawyerInvite();
          onDone();
        }}
      >
        Simulate lawyer accepting
      </Button>
    </div>
  );
}
