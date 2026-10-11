import { hmacRoute } from "@/lib/http";
import { nodeSign } from "@/lib/safe-recovery";

// POST /api/node/sign {recoveryId, safeTxHash, p2Signature}. P3 signs only if identity verified, delay elapsed and the lawyer approved.
export const POST = hmacRoute(nodeSign);
