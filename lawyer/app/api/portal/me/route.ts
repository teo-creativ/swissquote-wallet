import { sessionRoute } from "@/lib/server/http";
import { me } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/me. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(me);
