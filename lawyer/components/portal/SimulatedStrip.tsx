import { IS_MOCK } from "@/lib/lawyerApi";

/**
 * Mock mode: annex F.1 text, verbatim (CLAUDE.md rule 7).
 * Live mode: the accounts, passkeys, keys and decisions are real, so nothing is "simulated". The portal only says that a team member
 * operates the account when NEXT_PUBLIC_LAWYER_DEMO_OPERATED=true, i.e. when it is true for this deployment.
 */
export function SimulatedStrip() {
  if (IS_MOCK) {
    return (
      <div className="bg-ink px-4 py-1.5 text-center text-xs uppercase tracking-wide text-white">
        Simulated lawyer (played by a team member)
      </div>
    );
  }
  if (process.env.NEXT_PUBLIC_LAWYER_DEMO_OPERATED !== "true") return null;
  return (
    <div className="bg-ink px-4 py-1.5 text-center text-xs uppercase tracking-wide text-white">
      Demo: this lawyer account is operated by a team member. Testnet only.
    </div>
  );
}
