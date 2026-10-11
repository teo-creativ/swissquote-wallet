// Routes of the client app server in live mode.
//  - POST /api/live/<action>: the browser (session cookie, same-origin check). The action table below is the whole surface.
//  - hmacRoute: the lawyer node calling back (APP_TO_LAWYER_SECRET, replay protection in seen_nonces).
import { verifyRequest, type NonceStore } from "@/lib/shared/hmac";
import { getCtx, type Ctx } from "./ctx";
import { DbError } from "./db";
import { ApiError, errorResponse } from "./errors";
import * as live from "./live";
import { assertSameOrigin, clearCookie, requireAccount, sessionCookie } from "./session";

type Input = Record<string, unknown>;
type Handler = (ctx: Ctx, accountId: string, input: Input) => Promise<unknown>;

/** Every action behind /api/live/<action>, except `login` and `logout` which handle the session themselves. */
export const ACTIONS: Record<string, Handler> = {
  kyc: (c, id) => live.kyc(c, id),
  register: live.register,
  invite: live.invite,
  "lawyer-status": (c, id) => live.lawyerStatus(c, id),
  "device-register": live.deviceRegister,
  "wallet-owners": (c, id) => live.walletOwners(c, id),
  "wallet-deploy": (c, id) => live.walletDeploy(c, id),
  account: (c, id) => live.accountView(c, id),
  balance: (c, id) => live.balance(c, id),
  "swissquote-account": (c, id) => live.swissquoteAccount(c, id),
  "swissquote-transfer": live.swissquoteTransfer,
  "transfer-check": live.transferCheck,
  "transfer-prepare": live.transferPrepare,
  "transfer-submit": live.transferSubmit,
  "transfer-status": live.transferStatus,
  "transfer-cancel": live.transferCancel,
  activity: (c, id) => live.activity(c, id),
  alerts: (c, id) => live.alerts(c, id),
  "exit-kit-info": (c, id) => live.exitKitInfo(c, id),
  "exit-kit-record": (c, id) => live.exitKitRecord(c, id),
  "recovery-start": (c, id) => live.recoveryStart(c, id),
  "recovery-verify": live.recoveryVerify,
  "recovery-attach": live.recoveryAttach,
  "recovery-status": live.recoveryView,
  "recovery-cancel": live.recoveryCancel,
  "recovery-execute": live.recoveryExecute,
};

const json = (data: unknown, cookie?: string) => {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return Response.json(data, { headers });
};

async function readJson(req: Request): Promise<Input> {
  const raw = await req.text();
  if (!raw) return {};
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) throw new ApiError(400, "BODY_TOO_LARGE", "The request is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "INVALID_JSON", "The request is not valid JSON."); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ApiError(400, "INVALID_JSON", "The request must be a JSON object.");
  return parsed as Input;
}

export async function handleAction(req: Request, action: string, makeCtx: () => Ctx = getCtx): Promise<Response> {
  try {
    if (req.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    assertSameOrigin(req);
    const ctx = makeCtx();
    const input = await readJson(req);
    if (action === "login") {
      const out = await live.login(ctx, input);
      return json(out.body, await sessionCookie(ctx, req, out.__session));
    }
    if (action === "logout") return json({ ok: true }, clearCookie(req));
    const handler = ACTIONS[action];
    if (!handler) throw new ApiError(404, "UNKNOWN_ACTION", "Unknown action.");
    return json(await handler(ctx, await requireAccount(ctx, req), input));
  } catch (e) {
    return errorResponse(e);
  }
}

function nonceStore(ctx: Ctx): NonceStore {
  return {
    async claim(nonce, now) {
      await ctx.db.delete("seen_nonces", { seen_at: { lt: new Date(now.getTime() - 10 * 60_000).toISOString() } });
      try {
        await ctx.db.insert("seen_nonces", { nonce, seen_at: now.toISOString() });
        return true;
      } catch (e) {
        if (e instanceof DbError && e.kind === "UNIQUE") return false;
        throw e;
      }
    },
  };
}

/** Server to server: the lawyer node calls back. */
export async function handleInternal(req: Request, fn: (ctx: Ctx, input: Input) => Promise<unknown>, makeCtx: () => Ctx = getCtx): Promise<Response> {
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 64 * 1024) throw new ApiError(400, "BODY_TOO_LARGE", "The request is too large.");
    const ctx = makeCtx();
    const url = new URL(req.url);
    const auth = await verifyRequest({
      secret: ctx.env.APP_TO_LAWYER_SECRET, method: req.method, path: url.pathname + url.search, body: raw, headers: req.headers, nonces: nonceStore(ctx), now: ctx.now,
    });
    if (!auth.ok) throw new ApiError(401, "UNAUTHENTICATED", "Request authentication failed.");
    let input: Input = {};
    try { input = raw ? (JSON.parse(raw) as Input) : {}; } catch { throw new ApiError(400, "INVALID_JSON", "The request is not valid JSON."); }
    return json(await fn(ctx, input));
  } catch (e) {
    return errorResponse(e);
  }
}
