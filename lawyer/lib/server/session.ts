// Lawyer session: a signed cookie (jose, HS256) holding only the lawyer id. HttpOnly, SameSite=Strict, Secure on https.
// State-changing requests must also come from the portal origin (CSRF defence in depth).
import { jwtVerify, SignJWT } from "jose";
import type { Ctx } from "./ctx";
import { ApiError } from "./errors";

const issuer = "sq-keys-lawyer";
const secretKey = (ctx: Ctx) => {
  const s = ctx.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new ApiError(500, "NOT_CONFIGURED", "Sessions are not configured.");
  return new TextEncoder().encode(s);
};
export const cookieName = (ctx: Ctx) => (ctx.config.secureCookies ? "__Host-sqk_lawyer" : "sqk_lawyer");

export async function sessionCookie(ctx: Ctx, lawyerId: string): Promise<string> {
  const iat = Math.floor(ctx.now.getTime() / 1000);
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(lawyerId).setIssuer(issuer)
    .setIssuedAt(iat).setExpirationTime(iat + ctx.config.sessionTtlSeconds).sign(secretKey(ctx));
  return `${cookieName(ctx)}=${jwt}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ctx.config.sessionTtlSeconds}${ctx.config.secureCookies ? "; Secure" : ""}`;
}
export const clearCookie = (ctx: Ctx) => `${cookieName(ctx)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${ctx.config.secureCookies ? "; Secure" : ""}`;

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Resolves the lawyer id of a valid session, or null. */
export async function sessionLawyerId(ctx: Ctx, req: Request): Promise<string | null> {
  const token = readCookie(req.headers.get("cookie"), cookieName(ctx));
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(ctx), { issuer, algorithms: ["HS256"], currentDate: ctx.now });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function requireLawyer(ctx: Ctx, req: Request): Promise<string> {
  const id = await sessionLawyerId(ctx, req);
  if (!id) throw new ApiError(401, "NOT_SIGNED_IN", "Sign in with your passkey to continue.");
  return id;
}

/** POST/PUT/DELETE from a browser must carry the portal origin. */
export function assertSameOrigin(ctx: Ctx, req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.headers.get("origin") !== ctx.config.origin) throw new ApiError(403, "BAD_ORIGIN", "This request did not come from the portal.");
}
