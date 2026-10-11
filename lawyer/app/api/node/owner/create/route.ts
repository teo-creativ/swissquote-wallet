import { hmacRoute } from "@/lib/server/http";
import { nodeOwnerCreate } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/owner/create. Client app server (HMAC): the P2 address of a client (idempotent).
export const POST = hmacRoute(nodeOwnerCreate);
