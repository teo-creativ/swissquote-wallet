import { hmacRoute } from "@/lib/server/http";
import { inviteStatus } from "@/lib/server/invites";

export const dynamic = "force-dynamic";

// GET /api/invite/status. Client app server (HMAC): polls whether the lawyer accepted.
export const GET = hmacRoute(inviteStatus);
