"use server";
// Server actions of the console. Every action re-checks the password cookie: the layout gate does not protect actions.
import { redirect } from "next/navigation";
import { endSession, isAuthed, passwordMatches, startSession } from "@/lib/console.auth";
import { cosignRelease, sendIdentityCheck, setNextIdentityOutcome } from "@/lib/console.mock";
import type { ConsoleClient, IdentityOutcome, Recovery } from "@/lib/console.types";

export type LoginState = { error?: string };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const password = form.get("password");
  if (typeof password !== "string" || !password) return { error: "Enter the console password." };
  if (!passwordMatches(password)) return { error: "Wrong password." };
  await startSession();
  redirect("/console/recoveries");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/console");
}

async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  if (!(await isAuthed())) return { ok: false, error: "Session expired. Reload the page and sign in again." };
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function sendIdentityCheckAction(id: string): Promise<ActionResult<Recovery>> {
  return guarded(() => sendIdentityCheck(id));
}

export async function cosignReleaseAction(id: string): Promise<ActionResult<Recovery>> {
  return guarded(() => cosignRelease(id));
}

export async function setNextIdentityOutcomeAction(clientId: string, outcome: IdentityOutcome): Promise<ActionResult<ConsoleClient>> {
  return guarded(async () => {
    if (outcome !== "pass" && outcome !== "fail") throw new Error("Invalid outcome.");
    return setNextIdentityOutcome(clientId, outcome);
  });
}
