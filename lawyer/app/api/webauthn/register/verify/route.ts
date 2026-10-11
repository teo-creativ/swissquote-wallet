import { publicRoute } from "@/lib/server/http";
import { registerVerify } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/webauthn/register/verify. Public. Stores the passkey, makes the lawyer the P2 owner, opens a session.
export const POST = publicRoute(registerVerify);
