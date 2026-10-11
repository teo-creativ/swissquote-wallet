import { sessionRoute } from "@/lib/server/http";
import { requestDetail } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/request. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(requestDetail);
