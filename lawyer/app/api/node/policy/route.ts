import { hmacRoute } from "@/lib/server/http";
import { policyView } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// GET /api/node/policy. Client app server (HMAC): the client's limits and known recipients, read only.
export const GET = hmacRoute(policyView);
