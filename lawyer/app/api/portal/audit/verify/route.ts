import { sessionRoute } from "@/lib/server/http";
import { auditVerify } from "@/lib/server/portal";

export const dynamic = "force-dynamic";

// POST /api/portal/audit/verify. Re-checks the whole hash chain.
export const POST = sessionRoute((ctx) => auditVerify(ctx));
