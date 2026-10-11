import { publicRoute } from "@/lib/server/http";
import { loginFinish } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/webauthn/login/verify. Public. Opens a session.
export const POST = publicRoute(loginFinish);
