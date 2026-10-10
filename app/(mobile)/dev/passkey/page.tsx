import type { Metadata } from "next";
import { PasskeyDiagnostics } from "./PasskeyDiagnostics";

// Phone diagnostics for passkeys. Not linked from the product UI, reachable in production on purpose (we test on phones).
// Shows no secret: PRF bytes are never rendered, only booleans and lengths.
export const metadata: Metadata = { title: "Passkey diagnostics · SQ Keys", robots: { index: false, follow: false } };

export default function PasskeyDiagnosticsPage() {
  return <PasskeyDiagnostics />;
}
