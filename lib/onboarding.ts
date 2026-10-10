// Onboarding routing by account status. Order (team decision): documents -> lawyer invitation -> phone key -> three shares.
import type { Account } from "./sqkeys.types";

type RouteInput = Pick<Account, "status" | "devices" | "lawyer">;

/** Routes a signed-in account may be on, by status. The first one is where we send it. */
export function routesFor(account: RouteInput): string[] {
  switch (account.status) {
    case "created":
      return ["/verify", "/documents", "/lawyer"];
    case "awaiting_lawyer":
      return ["/lawyer"];
    case "ready_for_keys":
      // Lawyer accepted. No phone key yet: create it. Key done: go on to the three shares.
      return account.devices.length > 0 ? ["/creating", "/lawyer"] : ["/key", "/lawyer"];
    case "creating_wallet":
      return ["/creating"];
    default:
      return ["/home"]; // active, recovering
  }
}

export const entryRoute = (account: RouteInput): string => routesFor(account)[0];

const ONBOARDING = ["/verify", "/documents", "/lawyer", "/key", "/creating"];

/** Onboarding routes follow the status steps; once the wallet exists (active, recovering) every other screen is open. */
export function isAllowed(account: RouteInput, route: string): boolean {
  if (account.status === "active" || account.status === "recovering") return !ONBOARDING.includes(route);
  return routesFor(account).includes(route);
}

/** Where to send an account that opened a route it may not use. /key and /creating without an accepted lawyer go to /lawyer. */
export function redirectFor(account: RouteInput, route: string): string {
  const needsLawyer = route === "/key" || route === "/creating";
  if (needsLawyer && (account.status === "created" || account.status === "awaiting_lawyer")) return "/lawyer";
  return entryRoute(account);
}

export type ShareState = "waiting" | "generating" | "stored";
export interface ShareStates { client: ShareState; lawyer: ShareState; swissquote: ShareState }

const ORDER = ["preparing", "creating_keys", "checking_keys", "saving_key_on_device", "linking_wallet", "funding_gas", "done"] as const;

/**
 * State of the three shares for a wallet-creation step. The three are generated together in the key generation
 * (creating_keys, checking_keys). P2 and P3 are kept by their nodes as soon as it is checked; P1 is stored on this phone
 * at saving_key_on_device. `null` means creation has not reported a step yet.
 */
export function shareStates(step: (typeof ORDER)[number] | null): ShareStates {
  const i = step === null ? -1 : ORDER.indexOf(step);
  if (i < 1) return { client: "waiting", lawyer: "waiting", swissquote: "waiting" };
  if (i <= 2) return { client: "generating", lawyer: "generating", swissquote: "generating" };
  if (i === 3) return { client: "generating", lawyer: "stored", swissquote: "stored" };
  return { client: "stored", lawyer: "stored", swissquote: "stored" };
}
