import { hmacRoute } from "@/lib/server/http";
import { exitStatus } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// GET /api/node/exit/status. Client app server (HMAC): polls an exit; the signature comes after approval and delay.
export const GET = hmacRoute(exitStatus);
