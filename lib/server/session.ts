// Client session: a signed cookie (jose, HS256) holding only the account id. HttpOnly, SameSite=Strict, Secure (and the __Host- prefix) on https.
// Whether the page is on https is read from the request URL, so local http development still works.
import { jwtVerify, SignJWT } from "jose";
import type { Ctx } from "./ctx";
import { ApiError } from "./errors";

const issuer = "sq-keys-app";
const secretKey = (ctx: Ctx) => {
  const s = ctx.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new ApiError(500, "NOT_CONFIGURED", "Sessions are not configured.");
  return new TextEncoder().encode(s);
};
const isSecure = (req: Request) => new URL(req.url).protocol === "https:";
const cookieName = (secure: boolean) => (secure ? "__Host-sqk_session" : "sqk_session");

export async function sessionCookie(ctx: Ctx, req: Request, accountId: string): Promise<string> {
  const secure = isSecure(req);
  const iat = Math.floor(ctx.now.getTime() / 1000);
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(accountId).setIssuer(issuer)
    .setIssuedAt(iat).setExpirationTime(iat + ctx.config.sessionTtlSeconds).sign(secretKey(ctx));
  return `${cookieName(secure)}=${jwt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ctx.config.sessionTtlSeconds}${secure ? "; Secure" : ""}`;
}
export const clearCookie = (req: Request) => `${cookieName(isSecure(req))}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure(req) ? "; Secure" : ""}`;

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function sessionAccountId(ctx: Ctx, req: Request): Promise<string | null> {
  const token = readCookie(req.headers.get("cookie"), cookieName(isSecure(req)));
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(ctx), { issuer, algorithms: ["HS256"], currentDate: ctx.now });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function requireAccount(ctx: Ctx, req: Request): Promise<string> {
  const id = await sessionAccountId(ctx, req);
  if (!id) throw new ApiError(401, "NOT_AUTHENTICATED", "Sign in to continue.");
  return id;
}

/** Calls from a browser must come from this site. */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.headers.get("origin") !== new URL(req.url).origin) throw new ApiError(403, "BAD_ORIGIN", "This request did not come from the app.");
}
