import { hmacRoute } from "@/lib/http";
import { complianceScreen } from "@/lib/services";

// POST /api/compliance/screen (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(complianceScreen);
