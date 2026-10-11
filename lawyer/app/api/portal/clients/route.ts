import { sessionRoute } from "@/lib/server/http";
import { clientViews } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/clients. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(clientViews);
