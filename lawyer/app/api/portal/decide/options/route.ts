import { sessionRoute } from "@/lib/server/http";
import { decideOptions } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// POST /api/portal/decide/options. Signed-in lawyer only (session cookie, same origin).
export const POST = sessionRoute(decideOptions);
