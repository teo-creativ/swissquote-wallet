import { hmacRoute } from "@/lib/server/http";
import { transferRequest } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/transfer/request. Client app server (HMAC): policy decision; AUTO is signed at once, LAWYER is queued.
export const POST = hmacRoute(transferRequest);
