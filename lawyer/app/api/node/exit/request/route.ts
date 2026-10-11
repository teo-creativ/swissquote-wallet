import { hmacRoute } from "@/lib/server/http";
import { exitRequest } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/exit/request. Client app server (HMAC): exit without Swissquote, always manual.
export const POST = hmacRoute(exitRequest);
