import { hmacRoute } from "@/lib/server/http";
import { recoveryStatus } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// GET /api/node/recovery/status. Client app server (HMAC): polls a recovery; gives the P2 signature once approved.
export const GET = hmacRoute(recoveryStatus);
