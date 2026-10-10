import { CHAIN_ID } from "@/src/shared/constants";

export const dynamic = "force-dynamic";

// Public liveness probe. Reports only non-secret facts.
export function GET() {
  return Response.json({ ok: true, service: "sq-keys-mock", chainId: CHAIN_ID, simulated: true });
}
