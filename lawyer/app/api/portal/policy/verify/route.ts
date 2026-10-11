import { sessionRoute } from "@/lib/server/http";
import { policyVerify } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// POST /api/portal/policy/verify. Signed-in lawyer only (session cookie, same origin).
export const POST = sessionRoute(policyVerify);
