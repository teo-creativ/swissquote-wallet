import { SqKeysError } from "@/lib/sqkeys";

/** Annex F.7. */
export const GENERIC_ERROR = "Something went wrong. Nothing was sent. Try again.";

/** API errors already carry a plain English message; anything else gets the generic text. */
export function messageOf(error: unknown): string {
  return error instanceof SqKeysError ? error.message : GENERIC_ERROR;
}

export const isNotAuthenticated = (error: unknown): boolean => error instanceof SqKeysError && error.code === "NOT_AUTHENTICATED";
