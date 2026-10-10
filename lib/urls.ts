// Cross-site URLs. NEXT_PUBLIC_* values are public (inlined at build time), never secrets.
// localhost is a fallback for `next dev` only: a production build without the variable fails loudly instead of
// showing a link that cannot work for the lawyer.
import { SqKeysError } from "./sqkeys.types";

const DEV_LAWYER_URL = "http://localhost:3001";

/** Pass `process.env.NEXT_PUBLIC_LAWYER_URL` literally at the call site so Next can inline it. */
export function lawyerBaseUrl(configured: string | undefined, nodeEnv: string | undefined): string {
  const value = configured?.trim();
  if (value) return value.replace(/\/+$/, "");
  if (nodeEnv === "development") return DEV_LAWYER_URL;
  throw new SqKeysError("LAWYER_URL_NOT_CONFIGURED", "The lawyer portal address is not set up. Tell the SQ Keys team.");
}

export function inviteUrl(token: string, configured: string | undefined, nodeEnv: string | undefined): string {
  return `${lawyerBaseUrl(configured, nodeEnv)}/invite/${token}`;
}
