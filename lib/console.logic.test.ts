import { describe, expect, it } from "vitest";
import { DEMO_DELAY_SECONDS, IDENTITY_CHECK_MS, LAWYER_APPROVAL_MS, deriveRecovery, formatCountdown } from "./console.logic";
import type { Recovery } from "./console.types";

const T0 = 1_000_000;
const base: Recovery = {
  id: "r",
  clientId: "c",
  createdAt: T0,
  identityRequestedAt: null,
  identityOutcome: null,
  delaySeconds: DEMO_DELAY_SECONDS,
  cancelledAt: null,
  cosignedAt: null,
  proofHash: "0x00",
};
const sent = (outcome: "pass" | "fail"): Recovery => ({ ...base, identityRequestedAt: T0, identityOutcome: outcome });
const verifiedAt = T0 + IDENTITY_CHECK_MS;
const releaseAt = verifiedAt + DEMO_DELAY_SECONDS * 1000;

describe("deriveRecovery", () => {
  it("blocks co-signing until the identity check is sent", () => {
    const v = deriveRecovery(base, T0);
    expect(v.identity).toBe("not_requested");
    expect(v.canCosign).toBe(false);
    expect(v.msLeft).toBeNull();
  });

  it("keeps the check pending, then resolves it from the outcome captured at send time", () => {
    expect(deriveRecovery(sent("pass"), T0 + 1).identity).toBe("pending");
    expect(deriveRecovery(sent("pass"), verifiedAt).identity).toBe("verified");
    const failed = deriveRecovery(sent("fail"), verifiedAt);
    expect(failed.identity).toBe("failed");
    expect(failed.status).toBe("blocked");
    expect(failed.canCosign).toBe(false);
  });

  it("never starts the delay or allows co-signing after a failed check", () => {
    const v = deriveRecovery(sent("fail"), releaseAt + 1_000_000);
    expect(v.releaseAfter).toBeNull();
    expect(v.canCosign).toBe(false);
  });

  it("needs the lawyer, then the delay, before co-signing", () => {
    const beforeLawyer = deriveRecovery(sent("pass"), verifiedAt + LAWYER_APPROVAL_MS - 1);
    expect(beforeLawyer.lawyer).toBe("pending");
    expect(beforeLawyer.canCosign).toBe(false);

    const duringDelay = deriveRecovery(sent("pass"), verifiedAt + LAWYER_APPROVAL_MS);
    expect(duringDelay.lawyer).toBe("approved");
    expect(duringDelay.canCosign).toBe(false);
    expect(duringDelay.cosignBlockedReason).toContain("Safety delay running");

    const after = deriveRecovery(sent("pass"), releaseAt);
    expect(after.delayElapsed).toBe(true);
    expect(after.canCosign).toBe(true);
    expect(after.cosignBlockedReason).toBeNull();
  });

  it("is completed once co-signed and cannot be co-signed twice", () => {
    const v = deriveRecovery({ ...sent("pass"), cosignedAt: releaseAt }, releaseAt + 1);
    expect(v.status).toBe("completed");
    expect(v.canCosign).toBe(false);
  });

  it("refuses to co-sign a cancelled recovery", () => {
    const v = deriveRecovery({ ...sent("pass"), cancelledAt: verifiedAt }, releaseAt);
    expect(v.status).toBe("cancelled");
    expect(v.canCosign).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatCountdown(160_000)).toBe("02:40");
    expect(formatCountdown(500)).toBe("00:01");
    expect(formatCountdown(24 * 3600 * 1000)).toBe("24:00:00");
  });
});
