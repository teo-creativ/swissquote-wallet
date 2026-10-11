import { sessionRoute } from "@/lib/server/http";
import { policyGet } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/policy. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(policyGet);
