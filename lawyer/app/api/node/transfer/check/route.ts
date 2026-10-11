import { hmacRoute } from "@/lib/server/http";
import { transferCheck } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/transfer/check. Client app server (HMAC): what the policy would decide now. Reserves nothing.
export const POST = hmacRoute(transferCheck);
