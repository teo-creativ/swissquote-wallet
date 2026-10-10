import { hmacRoute } from "@/lib/http";
import { identityStart } from "@/lib/recovery";

// POST /api/recovery/identity/start (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(identityStart);
