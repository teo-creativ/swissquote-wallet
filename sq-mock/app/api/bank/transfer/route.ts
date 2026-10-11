import { bankTransfer } from "@/lib/bank";
import { hmacRoute } from "@/lib/http";

// POST /api/bank/transfer {sqRef, to, amountUsdc}. Real USDC from the demo wallet to the client Safe.
export const POST = hmacRoute(bankTransfer);
