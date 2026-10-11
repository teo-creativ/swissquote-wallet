import { hmacRoute } from "@/lib/http";
import { recoveryOpen } from "@/lib/safe-recovery";

// POST /api/recovery/open {sqRef, recoveryId, safeAddress, newOwnerAddress}.
export const POST = hmacRoute(recoveryOpen);
