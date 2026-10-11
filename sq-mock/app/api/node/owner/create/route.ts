import { hmacRoute } from "@/lib/http";
import { ownerCreate } from "@/lib/owner";

// POST /api/node/owner/create {sqRef} (docs/prompts/live/01-safe-live.md, Slice A). HMAC with APP_TO_SQ_SECRET. Idempotent.
export const POST = hmacRoute(ownerCreate);
