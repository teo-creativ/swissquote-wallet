import { hmacRoute } from "@/lib/http";
import { login } from "@/lib/services";

// POST /api/login (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(login);
