import { hmacRoute } from "@/lib/http";
import { identityVerify } from "@/lib/recovery";

// POST /api/recovery/identity/verify (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(identityVerify);
