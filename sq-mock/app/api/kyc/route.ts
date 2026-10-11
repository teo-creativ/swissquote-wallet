import { hmacRoute } from "@/lib/http";
import { kyc } from "@/lib/services";

// POST /api/kyc (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(kyc);
