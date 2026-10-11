import { hmacRoute } from "@/lib/http";
import { recoveryExecuted } from "@/lib/safe-recovery";

// POST /api/recovery/executed {recoveryId, txHash}. Closes the recovery once the chain shows the new owner.
export const POST = hmacRoute(recoveryExecuted);
