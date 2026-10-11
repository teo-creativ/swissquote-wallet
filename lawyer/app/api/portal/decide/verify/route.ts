import { sessionRoute } from "@/lib/server/http";
import { decideVerify } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// POST /api/portal/decide/verify. Signed-in lawyer only (session cookie, same origin).
export const POST = sessionRoute(decideVerify);
