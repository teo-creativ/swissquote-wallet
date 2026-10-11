import { hmacRoute } from "@/lib/http";
import { ownershipProof } from "@/lib/services";

// POST /api/ownership-proof (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(ownershipProof);
