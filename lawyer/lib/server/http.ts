// Route wrappers. Three kinds of caller:
//  - hmacRoute: the client app SERVER (APP_TO_LAWYER_SECRET, replay protection through the seen_nonces table). Browsers never call these.
//  - sessionRoute: the signed-in lawyer (cookie + same-origin check).
//  - publicRoute: sign-in and invitation screens (same-origin check on POST).
import { verifyRequest, type NonceStore } from "@/src/shared/hmac";
import { getCtx, type Ctx } from "./ctx";
import { DbError } from "./db";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, requireLawyer } from "./session";
import type { Input } from "./util";

const MAX_BODY_BYTES = 64 * 1024;
const NONCE_TTL_MS = 10 * 60_000;

export function nonceStore(ctx: Ctx): NonceStore {
  return {
    async claim(nonce, now) {
      await ctx.db.delete("seen_nonces", { seen_at: { lt: new Date(now.getTime() - NONCE_TTL_MS).toISOString() } });
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

async function readJson(req: Request, raw: string): Promise<Input> {
  if (!raw) return {};
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new ApiError(400, "BODY_TOO_LARGE", "The body exceeds 64 KB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "INVALID_JSON", "The body is not valid JSON."); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ApiError(400, "INVALID_JSON", "The body must be a JSON object.");
  return parsed as Input;
}

export const json = (data: unknown, init?: ResponseInit & { cookie?: string }) => {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  if (init?.cookie) headers.append("set-cookie", init.cookie);
  return Response.json(data, { ...init, headers });
};

export function hmacRoute(handler: (ctx: Ctx, input: Input) => Promise<unknown>, makeCtx: () => Ctx = getCtx) {
  return async (req: Request): Promise<Response> => {
    try {
      const raw = await req.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new ApiError(400, "BODY_TOO_LARGE", "The body exceeds 64 KB.");
      const ctx = makeCtx();
      const url = new URL(req.url);
      const auth = await verifyRequest({
        secret: ctx.env.APP_TO_LAWYER_SECRET, method: req.method, path: url.pathname + url.search, body: raw, headers: req.headers, nonces: nonceStore(ctx), now: ctx.now,
      });
      if (!auth.ok) throw new ApiError(401, "UNAUTHENTICATED", "Request authentication failed.");
      const input = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req, raw);
      return json(await handler(ctx, input));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function sessionRoute(handler: (ctx: Ctx, lawyerId: string, input: Input) => Promise<unknown>, makeCtx: () => Ctx = getCtx) {
  return async (req: Request): Promise<Response> => {
    try {
      const ctx = makeCtx();
      assertSameOrigin(ctx, req);
      const lawyerId = await requireLawyer(ctx, req);
      const url = new URL(req.url);
      const input = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req, await req.text());
      return json(await handler(ctx, lawyerId, input));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function publicRoute(handler: (ctx: Ctx, input: Input) => Promise<unknown | { __cookie: string; body: unknown }>, makeCtx: () => Ctx = getCtx) {
  return async (req: Request): Promise<Response> => {
    try {
      const ctx = makeCtx();
      assertSameOrigin(ctx, req);
      const url = new URL(req.url);
      const input = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req, await req.text());
      const out = (await handler(ctx, input)) as any;
      if (out && typeof out === "object" && "__cookie" in out) return json(out.body, { cookie: out.__cookie });
      return json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
