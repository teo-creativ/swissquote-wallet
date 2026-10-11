import { sessionRoute } from "@/lib/server/http";
import { requestSummaries } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/requests. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(requestSummaries);
