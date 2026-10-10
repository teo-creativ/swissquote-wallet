import { hmacRoute } from "@/lib/http";
import { resolveAccount } from "@/lib/services";

// POST /api/resolve-account (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(resolveAccount);
