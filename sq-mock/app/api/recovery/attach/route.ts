import { hmacRoute } from "@/lib/http";
import { recoveryAttach } from "@/lib/safe-recovery";

// POST /api/recovery/attach {recoveryId, newOwnerAddress}. The key of the new phone, set once.
export const POST = hmacRoute(recoveryAttach);
