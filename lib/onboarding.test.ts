import { describe, expect, it } from "vitest";
import { entryRoute, isAllowed, redirectFor } from "./onboarding";
import type { Account } from "./sqkeys.types";

const acc = (status: Account["status"], devices = 0, lawyer: Account["lawyer"]["status"] = "none") => ({
  status,
  devices: Array.from({ length: devices }, (_, i) => ({ id: `d${i}`, label: "x", createdAt: "", current: true })),
  lawyer: { status: lawyer },
});

describe("onboarding order", () => {
  it("lawyer comes before the key", () => {
    expect(entryRoute(acc("awaiting_lawyer", 0, "invited"))).toBe("/lawyer");
    expect(entryRoute(acc("ready_for_keys", 0, "accepted"))).toBe("/key");
    expect(entryRoute(acc("ready_for_keys", 1, "accepted"))).toBe("/creating");
    expect(entryRoute(acc("creating_wallet", 1, "accepted"))).toBe("/creating");
  });
  it("/key and /creating are closed until the lawyer accepted", () => {
    for (const s of ["created", "awaiting_lawyer"] as const) {
      expect(isAllowed(acc(s), "/key")).toBe(false);
      expect(isAllowed(acc(s), "/creating")).toBe(false);
      expect(redirectFor(acc(s), "/key")).toBe("/lawyer");
      expect(redirectFor(acc(s), "/creating")).toBe("/lawyer");
    }
  });
  it("/creating needs the phone key first", () => {
    expect(isAllowed(acc("ready_for_keys", 0, "accepted"), "/creating")).toBe(false);
    expect(isAllowed(acc("ready_for_keys", 1, "accepted"), "/creating")).toBe(true);
  });
  it("after the wallet exists, onboarding routes are closed", () => {
    expect(isAllowed(acc("active", 1, "accepted"), "/key")).toBe(false);
    expect(isAllowed(acc("active", 1, "accepted"), "/home")).toBe(true);
  });
});

import { shareStates } from "./onboarding";

describe("shareStates", () => {
  it("three shares are generated together, then stored", () => {
    expect(shareStates(null)).toEqual({ client: "waiting", lawyer: "waiting", swissquote: "waiting" });
    expect(shareStates("preparing").client).toBe("waiting");
    expect(shareStates("creating_keys")).toEqual({ client: "generating", lawyer: "generating", swissquote: "generating" });
    expect(shareStates("saving_key_on_device")).toEqual({ client: "generating", lawyer: "stored", swissquote: "stored" });
    expect(shareStates("done")).toEqual({ client: "stored", lawyer: "stored", swissquote: "stored" });
  });
});
