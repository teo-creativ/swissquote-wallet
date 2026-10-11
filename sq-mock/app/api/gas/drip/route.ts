import { hmacRoute } from "@/lib/http";
import { gasDrip } from "@/lib/services";

// POST /api/gas/drip (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(gasDrip);
