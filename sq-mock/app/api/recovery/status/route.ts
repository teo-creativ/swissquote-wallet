import { hmacRoute } from "@/lib/http";
import { recoveryStatus } from "@/lib/recovery";

// GET /api/recovery/status (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const GET = hmacRoute(recoveryStatus);
