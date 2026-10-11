import { hmacRoute } from "@/lib/http";
import { complianceAlert } from "@/lib/services";

// POST /api/compliance-alert (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(complianceAlert);
