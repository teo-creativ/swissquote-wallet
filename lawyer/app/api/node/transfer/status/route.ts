import { hmacRoute } from "@/lib/server/http";
import { transferStatus } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// GET /api/node/transfer/status. Client app server (HMAC): polls a queued transfer.
export const GET = hmacRoute(transferStatus);
