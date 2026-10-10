import { hmacRoute } from "@/lib/http";
import { transferToWallet } from "@/lib/services";

// POST /api/transfer-to-wallet (CDC annex A.3). HMAC with APP_TO_SQ_SECRET.
export const POST = hmacRoute(transferToWallet);
