import { publicRoute } from "@/lib/server/http";
import { registerOptions } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/webauthn/register/options. Public (the invitation token is the credential).
export const POST = publicRoute(registerOptions);
