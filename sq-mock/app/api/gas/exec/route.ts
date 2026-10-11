import { hmacRoute } from "@/lib/http";
import { gasExec } from "@/lib/sponsor";

// POST /api/gas/exec {safeAddress, safeTx, signatures}. The sponsor submits execTransaction.
export const POST = hmacRoute(gasExec);
