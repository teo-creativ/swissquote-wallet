import { publicRoute } from "@/lib/server/http";
import { inviteInspect } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/invite/inspect. Public. Says whether an invitation link is valid.
export const POST = publicRoute(inviteInspect);
