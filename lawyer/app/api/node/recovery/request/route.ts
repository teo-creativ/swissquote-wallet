import { hmacRoute } from "@/lib/server/http";
import { recoveryRequest } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/recovery/request. Client app server (HMAC): asks the lawyer to approve a swapOwner recovery.
export const POST = hmacRoute(recoveryRequest);
