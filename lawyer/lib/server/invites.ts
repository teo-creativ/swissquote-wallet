// Invitation, lawyer account and sign-in (REAL WebAuthn). The client app registers an invitation by the SHA-256 of a token it keeps;
// the lawyer opens https://<portal>/invite/<token> on their own device, creates a passkey, and becomes the P2 owner of that client's Safe.
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { signRequest } from "@/src/shared/hmac";
import { DEFAULT_POLICY } from "@/src/shared/policy";
import { appendAudit } from "./audit";
import type { Ctx } from "./ctx";
import { DbError, type Row } from "./db";
import { ApiError } from "./errors";
import { ownerCreate } from "./keys";
import { sessionCookie } from "./session";
import { invalid, sha256Hex, text, uuid, type Input } from "./util";
import { newWebauthnUserId, registrationOptions, verifyLogin, verifyRegistration, loginOptions } from "./webauthn";

const TOKEN_HASH = /^[0-9a-f]{64}$/;
const iso = (ms: number) => new Date(ms).toISOString();
const live = (inv: Row, now: Date) => !inv.used_at && !inv.accepted_at && Date.parse(inv.expires_at) > now.getTime();

/** POST /api/invite/register (HMAC) {sqRef, tokenHash, displayName}: the client app announces an invitation. Idempotent per token hash. */
export async function inviteRegister(ctx: Ctx, input: Input) {
  const sqRef = uuid(input, "sqRef");
  const tokenHash = text(input, "tokenHash", 64);
  if (!TOKEN_HASH.test(tokenHash)) throw invalid("Field tokenHash is not a SHA-256 hex digest.");
  const displayName = text(input, "displayName", 80);

  let client = (await ctx.db.select("clients", { sq_ref: sqRef }))[0];
  if (client && ["accepted", "active"].includes(client.status)) throw new ApiError(409, "ALREADY_ACCEPTED", "A lawyer already accepted this client.");
  if (!client) {
    client = await ctx.db.insert("clients", { sq_ref: sqRef, display_name: displayName, status: "invited", created_at: ctx.now.toISOString() });
    // CDC 8.2 defaults, written explicitly so the memory store and the database agree.
    await ctx.db.insert("policies", {
      client_id: client.id, version: 1, per_tx_cap_base: String(DEFAULT_POLICY.perTxCapBase), daily_cap_base: String(DEFAULT_POLICY.dailyCapBase),
      hourly_count: DEFAULT_POLICY.hourlyCount, daily_count: DEFAULT_POLICY.dailyCount, new_recipient_requires_lawyer: DEFAULT_POLICY.newRecipientRequiresLawyer,
      max_pending_approvals: DEFAULT_POLICY.maxPendingApprovals, updated_at: ctx.now.toISOString(),
    });
  }
  const existing = (await ctx.db.select("invitations", { token_hash: tokenHash }))[0];
  if (existing) return { expiresAt: existing.expires_at, alreadyRegistered: true };

  // A new link replaces the previous one: only the latest invitation of a client can be used.
  for (const old of await ctx.db.select("invitations", { client_id: client.id, used_at: null })) {
    await ctx.db.update("invitations", { id: old.id }, { used_at: ctx.now.toISOString() });
  }
  const expiresAt = iso(ctx.now.getTime() + ctx.config.inviteTtlSeconds * 1000);
  await ctx.db.insert("invitations", { client_id: client.id, token_hash: tokenHash, expires_at: expiresAt });
  await appendAudit(ctx, "client-app", "INVITE_REGISTERED", client.id, { sqRef, expiresAt });
  return { expiresAt, alreadyRegistered: false };
}

/** POST /api/invite/inspect {token}: public. Says nothing about why an invitation is not valid. */
export async function inviteInspect(ctx: Ctx, input: Input) {
  const token = text(input, "token", 200);
  const inv = (await ctx.db.select("invitations", { token_hash: sha256Hex(token) }))[0];
  if (!inv || !live(inv, ctx.now)) return { valid: false, clientDisplayName: "", expiresAt: "" };
  const client = (await ctx.db.select("clients", { id: inv.client_id }))[0];
  return { valid: true, clientDisplayName: client?.display_name ?? "", expiresAt: new Date(inv.expires_at).toISOString() };
}

async function validInvitation(ctx: Ctx, token: string): Promise<{ inv: Row; client: Row }> {
  const inv = (await ctx.db.select("invitations", { token_hash: sha256Hex(token) }))[0];
  if (!inv || !live(inv, ctx.now)) throw new ApiError(410, "INVITATION_INVALID", "This invitation is invalid or has expired.");
  const client = (await ctx.db.select("clients", { id: inv.client_id }))[0];
  if (!client) throw new ApiError(410, "INVITATION_INVALID", "This invitation is invalid or has expired.");
  return { inv, client };
}

/** POST /api/webauthn/register/options {token, displayName, firm}. */
export async function registerOptions(ctx: Ctx, input: Input) {
  const token = text(input, "token", 200);
  const displayName = text(input, "displayName", 80);
  const firm = typeof input.firm === "string" ? input.firm.slice(0, 120) : "";
  const { inv } = await validInvitation(ctx, token);

  let lawyer = inv.pending_lawyer_id ? (await ctx.db.select("lawyers", { id: inv.pending_lawyer_id }))[0] : undefined;
  if (lawyer) {
    await ctx.db.update("lawyers", { id: lawyer.id }, { display_name: displayName, firm });
    lawyer = { ...lawyer, display_name: displayName };
  } else {
    lawyer = await ctx.db.insert("lawyers", { display_name: displayName, firm, webauthn_user_id: newWebauthnUserId(), created_at: ctx.now.toISOString() });
    await ctx.db.update("invitations", { id: inv.id }, { pending_lawyer_id: lawyer.id });
  }
  const existing = await ctx.db.select("lawyer_passkeys", { lawyer_id: lawyer.id });
  return registrationOptions(ctx, lawyer, existing);
}

/** Server to server call to the client app. Best effort: the client also polls /api/invite/status. */
export async function notifyApp(ctx: Ctx, path: string, body: Record<string, unknown>): Promise<boolean> {
  const secret = ctx.env.APP_TO_LAWYER_SECRET;
  if (!secret || !ctx.config.appUrl) return false;
  const raw = JSON.stringify(body);
  try {
    const res = await fetch(ctx.config.appUrl + path, {
      method: "POST", body: raw, headers: { "content-type": "application/json", ...signRequest({ secret, method: "POST", path, body: raw, now: ctx.now }) },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST /api/webauthn/register/verify {token, response}: stores the passkey, makes the lawyer the P2 owner, opens a session. */
export async function registerVerify(ctx: Ctx, input: Input) {
  const token = text(input, "token", 200);
  const response = input.response as RegistrationResponseJSON | undefined;
  if (!response || typeof response !== "object") throw invalid("Field response is missing.");
  const { inv, client } = await validInvitation(ctx, token);
  const lawyer = inv.pending_lawyer_id ? (await ctx.db.select("lawyers", { id: inv.pending_lawyer_id }))[0] : undefined;
  if (!lawyer) throw new ApiError(400, "CHALLENGE_INVALID", "The passkey request expired. Try again.");

  const credential = await verifyRegistration(ctx, lawyer, response);

  // The invitation is used once: the first caller wins.
  const claimed = await ctx.db.update("invitations", { id: inv.id, used_at: null, accepted_at: null }, { used_at: ctx.now.toISOString(), accepted_at: ctx.now.toISOString() });
  if (claimed.length !== 1) throw new ApiError(410, "INVITATION_INVALID", "This invitation is invalid or has expired.");
  try {
    await ctx.db.insert("lawyer_passkeys", {
      lawyer_id: lawyer.id, credential_id: credential.credentialId, public_key: credential.publicKey, counter: credential.counter,
      transports: credential.transports, device_type: credential.deviceType, backed_up: credential.backedUp, created_at: ctx.now.toISOString(),
    });
  } catch (e) {
    await ctx.db.update("invitations", { id: inv.id }, { used_at: null, accepted_at: null });
    if (e instanceof DbError && e.kind === "UNIQUE") throw new ApiError(409, "PASSKEY_EXISTS", "This passkey is already registered. Sign in instead.");
    throw e;
  }

  await ctx.db.update("clients", { id: client.id }, { lawyer_id: lawyer.id, status: "accepted" });
  const p2 = await ownerCreate(ctx, client.id);
  await appendAudit(ctx, `lawyer:${lawyer.id}`, "LAWYER_ACCEPTED", client.id, { lawyerId: lawyer.id, p2Address: p2.toLowerCase() });
  const notified = await notifyApp(ctx, "/api/internal/lawyer-accepted", { sqRef: client.sq_ref, lawyerName: lawyer.display_name, p2Address: p2 });
  return { __cookie: await sessionCookie(ctx, lawyer.id), body: { ok: true, lawyerId: lawyer.id, clientNotified: notified } };
}

/** GET /api/invite/status?sqRef (HMAC): lets the client app poll when the callback did not arrive. */
export async function inviteStatus(ctx: Ctx, input: Input) {
  const client = (await ctx.db.select("clients", { sq_ref: uuid(input, "sqRef") }))[0];
  if (!client) return { status: "unknown" };
  if (!client.lawyer_id) return { status: "invited" };
  const lawyer = (await ctx.db.select("lawyers", { id: client.lawyer_id }))[0];
  return { status: "accepted", lawyerName: lawyer?.display_name ?? "Your lawyer", walletRegistered: Boolean(client.wallet_address) };
}

/** POST /api/webauthn/login/options. */
export const loginStart = (ctx: Ctx) => loginOptions(ctx);

/** POST /api/webauthn/login/verify {response}. */
export async function loginFinish(ctx: Ctx, input: Input) {
  const response = input.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object") throw invalid("Field response is missing.");
  const lawyerId = await verifyLogin(ctx, response);
  await appendAudit(ctx, `lawyer:${lawyerId}`, "LOGIN", null, { lawyerId });
  return { __cookie: await sessionCookie(ctx, lawyerId), body: { ok: true } };
}
