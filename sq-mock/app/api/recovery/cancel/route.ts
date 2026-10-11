import { hmacRoute } from "@/lib/http";
import { recoveryCancel } from "@/lib/recovery";

// POST /api/recovery/cancel (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(recoveryCancel);
