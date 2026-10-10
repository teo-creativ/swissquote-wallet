import { hmacRoute } from "@/lib/http";
import { alertsCall } from "@/lib/services";

// POST /api/alerts/call (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(alertsCall);
