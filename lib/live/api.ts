// The browser's only door to the server in live mode: POST /api/live/<action> with the session cookie.
// Errors come back as { error: { code, message } } and become SqKeysError, which the screens already know how to show.
import { SqKeysError } from "@/lib/sqkeys.types";

export async function call<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/live/${action}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  } catch {
    throw new SqKeysError("OFFLINE", "You seem to be offline. Nothing was sent. Try again.");
  }
  const data = (await res.json().catch(() => null)) as Record<string, any> | null;
  if (!res.ok) throw new SqKeysError(data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message ?? "Something went wrong. Nothing was sent. Try again.");
  return data as T;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
