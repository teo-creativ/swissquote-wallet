import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, UNLIMITED_BASE, evaluatePolicy } from "./policy";
import type { AutoDecision, PolicyConfig, PolicyInput } from "./policy";

// CDC 8.2 test vectors, default policy, approved recipient, no recent decision (T10 and T12 need a lock and a queue: not mocked).
const APPROVED = "0x5aa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3";
const STRANGER = "0x1111111111111111111111111111111111112222";
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);

const transfer = (amountBase: bigint, to = APPROVED): PolicyInput => ({ kind: "usdc_transfer", to, amountBase });

/** Evaluates each step, recording AUTO decisions like the real engine reserves them. */
function run(steps: { input: PolicyInput; at: number }[], policy: PolicyConfig = DEFAULT_POLICY) {
  const autoDecisions: AutoDecision[] = [];
  return steps.map(({ input, at }) => {
    const decision = evaluatePolicy(input, { approvedRecipients: [APPROVED], autoDecisions, pendingCount: 0 }, policy, at);
    if (decision.outcome === "AUTO") autoDecisions.push({ at, amountBase: input.amountBase });
    return decision;
  });
}

describe("mock policy (CDC 8.2)", () => {
  it("T1: 5 USDC exactly is AUTO", () => {
    expect(run([{ input: transfer(5_000_000n), at: T0 }])[0]).toEqual({ outcome: "AUTO", reasons: ["WITHIN_POLICY"] });
  });

  it("T2: 5.000001 USDC needs the lawyer (AMOUNT_ABOVE_THRESHOLD)", () => {
    expect(run([{ input: transfer(5_000_001n), at: T0 }])[0]).toEqual({ outcome: "LAWYER", reasons: ["AMOUNT_ABOVE_THRESHOLD"] });
  });

  it("T3: unknown recipient needs the lawyer (NEW_RECIPIENT)", () => {
    expect(run([{ input: transfer(1_000_000n, STRANGER), at: T0 }])[0]).toEqual({ outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] });
  });

  it("T4: 5 + 5 AUTO, then 1 base unit hits DAILY_CAP", () => {
    const out = run([
      { input: transfer(5_000_000n), at: T0 },
      { input: transfer(5_000_000n), at: T0 + MIN },
      { input: transfer(1n), at: T0 + 2 * MIN },
    ]);
    expect(out.map((d) => d.outcome)).toEqual(["AUTO", "AUTO", "LAWYER"]);
    expect(out[2].reasons).toEqual(["DAILY_CAP"]);
  });

  it("T5: three 1 USDC transfers within the hour, the 4th hits VELOCITY", () => {
    const out = run([0, 1, 2, 3].map((i) => ({ input: transfer(1_000_000n), at: T0 + i * 10 * MIN })));
    expect(out.map((d) => d.outcome)).toEqual(["AUTO", "AUTO", "AUTO", "LAWYER"]);
    expect(out[3].reasons).toEqual(["VELOCITY"]);
  });

  it("T6: sanctioned recipient (address ending 0000) is REFUSED", () => {
    const to = "0x2222222222222222222222222222222222220000";
    expect(run([{ input: transfer(1_000_000n, to), at: T0 }])[0]).toEqual({ outcome: "REFUSED", reasons: ["SANCTIONED_ADDRESS"] });
  });

  it("T7: unlimited approval needs the lawyer (UNLIMITED_APPROVAL)", () => {
    const input: PolicyInput = { kind: "usdc_approve", to: STRANGER, amountBase: UNLIMITED_BASE, knownApp: true };
    expect(run([{ input, at: T0 }])[0]).toEqual({ outcome: "LAWYER", reasons: ["UNLIMITED_APPROVAL"] });
  });

  it("T8: perTxCap = 0 sends everything to the lawyer", () => {
    const out = run([{ input: transfer(1n), at: T0 }], { ...DEFAULT_POLICY, perTxCapBase: 0n });
    expect(out[0].outcome).toBe("LAWYER");
  });

  it("T9: zero amount is REFUSED (INVALID_AMOUNT)", () => {
    expect(run([{ input: transfer(0n), at: T0 }])[0]).toEqual({ outcome: "REFUSED", reasons: ["INVALID_AMOUNT"] });
  });

  it("T11: six 1 USDC transfers more than an hour apart, the 7th hits DAILY_COUNT", () => {
    const out = run([0, 1, 2, 3, 4, 5, 6].map((i) => ({ input: transfer(1_000_000n), at: T0 + i * 70 * MIN })));
    expect(out.map((d) => d.outcome)).toEqual(["AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "LAWYER"]);
    expect(out[6].reasons).toEqual(["DAILY_COUNT"]);
  });

  it("T13: newRecipientRequiresLawyer = false lets an unknown recipient through, sanctions stay active", () => {
    const policy = { ...DEFAULT_POLICY, newRecipientRequiresLawyer: false };
    expect(run([{ input: transfer(1_000_000n, STRANGER), at: T0 }], policy)[0].outcome).toBe("AUTO");
    const sanctioned = "0x3333333333333333333333333333333333330000";
    expect(run([{ input: transfer(1_000_000n, sanctioned), at: T0 }], policy)[0].outcome).toBe("REFUSED");
  });

  it("lists every applicable reason (R5 to R8b are all evaluated)", () => {
    const out = run([{ input: transfer(6_000_000n, STRANGER), at: T0 }])[0];
    expect(out.reasons).toEqual(["NEW_RECIPIENT", "AMOUNT_ABOVE_THRESHOLD"]);
  });

  it("refuses with TOO_MANY_PENDING at the pending limit", () => {
    const d = evaluatePolicy(transfer(1n), { approvedRecipients: [APPROVED], autoDecisions: [], pendingCount: 5 }, DEFAULT_POLICY, T0);
    expect(d).toEqual({ outcome: "REFUSED", reasons: ["TOO_MANY_PENDING"] });
  });

  it("ignores decisions older than 24 h", () => {
    const old: AutoDecision[] = [{ at: T0 - 25 * 60 * MIN, amountBase: 10_000_000n }];
    const d = evaluatePolicy(transfer(5_000_000n), { approvedRecipients: [APPROVED], autoDecisions: old, pendingCount: 0 }, DEFAULT_POLICY, T0);
    expect(d.outcome).toBe("AUTO");
  });
});
