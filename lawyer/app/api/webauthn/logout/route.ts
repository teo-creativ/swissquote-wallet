import { clearCookie } from "@/lib/server/session";
import { getCtx } from "@/lib/server/ctx";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// POST /api/webauthn/logout. Clears the session cookie.
export const POST = async () => json({ ok: true }, { cookie: clearCookie(getCtx()) });
