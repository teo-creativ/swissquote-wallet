import { handleInternal } from "@/lib/server/http";
import { lawyerAccepted } from "@/lib/server/live";

export const dynamic = "force-dynamic";

// POST /api/internal/lawyer-accepted. The lawyer node tells us the invitation was accepted (HMAC, APP_TO_LAWYER_SECRET).
export async function POST(req: Request) {
  return handleInternal(req, lawyerAccepted);
}
