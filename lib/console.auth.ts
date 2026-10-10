// Password gate of the console. The password is checked on the server against CONSOLE_PASSWORD and never stored in the cookie:
// the cookie holds an HMAC of a fixed label keyed with the password, so changing the password logs everyone out.
// Fails closed: without CONSOLE_PASSWORD nobody gets in.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sqk_console";
const EIGHT_HOURS = 8 * 60 * 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function sessionToken(): string | null {
  const pw = process.env.CONSOLE_PASSWORD;
  if (!pw) return null;
  return createHmac("sha256", pw).update("sqkeys-console-session-v1").digest("hex");
}

export const gateConfigured = () => Boolean(process.env.CONSOLE_PASSWORD);

export function passwordMatches(input: string): boolean {
  const pw = process.env.CONSOLE_PASSWORD;
  if (!pw) return false;
  return timingSafeEqual(sha256(input), sha256(pw));
}

export async function isAuthed(): Promise<boolean> {
  const expected = sessionToken();
  const got = (await cookies()).get(COOKIE)?.value;
  if (!expected || !got) return false;
  return timingSafeEqual(sha256(got), sha256(expected));
}

export async function startSession(): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/console",
    maxAge: EIGHT_HOURS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: "/console" });
}
