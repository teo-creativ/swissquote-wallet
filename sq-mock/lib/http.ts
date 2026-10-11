// Route wrapper for server to server calls: body size limit, HMAC check with APP_TO_SQ_SECRET (CDC 3.10), replay
// protection through the store, JSON parsing and error mapping. No CORS header: browsers never call these routes.
import { verifyRequest } from "../src/shared/hmac";
import { viemChain } from "./chain";
import { readConfig } from "./config";
import { ApiError, errorResponse } from "./errors";
import { getStore } from "./runtime";
import type { Deps, Input } from "./services";

const MAX_BODY_BYTES = 64 * 1024;

export async function getDeps(): Promise<Deps> {
  const config = readConfig();
  return {
    store: await getStore(),
    chain: viemChain(config.usdcAddress),
    config,
    now: new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export function parseBody(raw: string): Input {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "INVALID_JSON", "The body is not valid JSON."); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new ApiError(400, "INVALID_JSON", "The body must be a JSON object.");
  return parsed as Input;
}

export async function readLimited(req: Request): Promise<string> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new ApiError(400, "BODY_TOO_LARGE", "The body exceeds 64 KB.");
  return raw;
}

/** POST handlers receive the JSON body, GET handlers the query parameters. */
export function hmacRoute(handler: (deps: Deps, input: Input) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      const raw = await readLimited(req);
      const url = new URL(req.url);
      const deps = await getDeps();
      const auth = await verifyRequest({
        secret: process.env.APP_TO_SQ_SECRET, method: req.method, path: url.pathname + url.search, body: raw,
        headers: req.headers, nonces: deps.store, now: deps.now,
      });
      if (!auth.ok) throw new ApiError(401, "UNAUTHENTICATED", "Request authentication failed.");
      const input = req.method === "GET" ? Object.fromEntries(url.searchParams) : parseBody(raw);
      return Response.json(await handler(deps, input));
    } catch (e) {
      return errorResponse(e);
    }
  };
}
