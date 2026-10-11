import { publicRoute } from "@/lib/server/http";
import { loginStart } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/webauthn/login/options. Public.
export const POST = publicRoute((ctx) => loginStart(ctx));
