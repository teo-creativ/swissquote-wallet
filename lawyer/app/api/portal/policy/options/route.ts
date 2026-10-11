import { sessionRoute } from "@/lib/server/http";
import { policyOptions } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// POST /api/portal/policy/options. Signed-in lawyer only (session cookie, same origin).
export const POST = sessionRoute(policyOptions);
