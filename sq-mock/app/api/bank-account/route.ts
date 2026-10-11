import { hmacRoute } from "@/lib/http";
import { bankAccount } from "@/lib/services";

// GET /api/bank-account (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const GET = hmacRoute(bankAccount);
