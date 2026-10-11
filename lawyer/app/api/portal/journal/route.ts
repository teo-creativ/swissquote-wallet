import { sessionRoute } from "@/lib/server/http";
import { journal } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/journal. Signed-in lawyer only (session cookie, same origin).
export const GET = sessionRoute(journal);
