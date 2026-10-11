import { hmacRoute } from "@/lib/server/http";
import { inviteRegister } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// POST /api/invite/register. Client app server (HMAC): announces an invitation by the hash of its token.
export const POST = hmacRoute(inviteRegister);
