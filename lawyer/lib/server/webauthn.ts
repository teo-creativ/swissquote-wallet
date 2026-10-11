// Server side of the WebAuthn ceremonies (@simplewebauthn/server). rpID and origin come from LAWYER_ORIGIN, never from request headers.
// userVerification is always "required"; credentials are discoverable (resident key) so sign-in needs no username.
import { createHash, randomUUID } from "node:crypto";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Ctx } from "./ctx";
import type { Row } from "./db";
import { ApiError } from "./errors";

const CHALLENGE_TTL_MS = 5 * 60_000;
const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

/** Stored challenges are single use: consuming deletes the row. */
async function storeChallenge(ctx: Ctx, purpose: string, subject: string | null, challenge: string) {
  await ctx.db.delete("webauthn_challenges", { expires_at: { lt: ctx.now.toISOString() } });
  await ctx.db.insert("webauthn_challenges", { purpose, subject, challenge, expires_at: new Date(ctx.now.getTime() + CHALLENGE_TTL_MS).toISOString() });
}
async function consumeChallenge(ctx: Ctx, purpose: string, challenge: string, subject?: string | null): Promise<boolean> {
  const where = { purpose, challenge, expires_at: { gt: ctx.now.toISOString() }, ...(subject === undefined ? {} : { subject }) };
  const hit = (await ctx.db.select("webauthn_challenges", where, { limit: 1 }))[0];
  if (!hit) return false;
  return (await ctx.db.delete("webauthn_challenges", { id: hit.id })) === 1;
}
/** The challenge the browser signed, read from clientDataJSON (discoverable sign-in has no user to look it up by). */
function clientChallenge(response: { response: { clientDataJSON: string } }): string {
  try {
    return String(JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")).challenge ?? "");
  } catch {
    return "";
  }
}

export async function registrationOptions(ctx: Ctx, lawyer: Row, existing: Row[]) {
  const options = await generateRegistrationOptions({
    rpName: "SQ Keys Lawyer", rpID: ctx.config.rpId,
    userName: lawyer.display_name, userDisplayName: lawyer.display_name,
    // Stable per lawyer: registering again on the same authenticator replaces instead of duplicating.
    userID: fromB64url(lawyer.webauthn_user_id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    timeout: 60_000,
  });
  await storeChallenge(ctx, "register", lawyer.id, options.challenge);
  return options;
}

export async function verifyRegistration(ctx: Ctx, lawyer: Row, response: RegistrationResponseJSON) {
  const challenge = clientChallenge(response);
  if (!(await consumeChallenge(ctx, "register", challenge, lawyer.id))) throw new ApiError(400, "CHALLENGE_INVALID", "The passkey request expired. Try again.");
  const result = await verifyRegistrationResponse({
    response, expectedChallenge: challenge, expectedOrigin: ctx.config.origin, expectedRPID: ctx.config.rpId, requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified || !result.registrationInfo) throw new ApiError(400, "PASSKEY_REJECTED", "The passkey could not be verified. Try again.");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  return {
    credentialId: credential.id, publicKey: b64url(credential.publicKey), counter: credential.counter,
    transports: (response.response.transports ?? credential.transports ?? null) as string[] | null,
    deviceType: credentialDeviceType, backedUp: credentialBackedUp,
  };
}

export async function loginOptions(ctx: Ctx) {
  const options = await generateAuthenticationOptions({ rpID: ctx.config.rpId, userVerification: "required", timeout: 60_000 });
  await storeChallenge(ctx, "login", null, options.challenge);
  return options;
}

async function verifyAssertion(ctx: Ctx, response: AuthenticationResponseJSON, expectedChallenge: string, allowedPasskeys: Row[]): Promise<Row> {
  const passkey = allowedPasskeys.find((p) => p.credential_id === response.id);
  if (!passkey) throw new ApiError(401, "UNKNOWN_PASSKEY", "This passkey is not registered for this portal.");
  const result = await verifyAuthenticationResponse({
    response, expectedChallenge, expectedOrigin: ctx.config.origin, expectedRPID: ctx.config.rpId, requireUserVerification: true,
    credential: { id: passkey.credential_id, publicKey: fromB64url(passkey.public_key), counter: Number(passkey.counter), transports: passkey.transports ?? undefined },
  }).catch(() => null);
  if (!result?.verified) throw new ApiError(401, "PASSKEY_REJECTED", "The passkey could not be verified. Try again.");
  // simplewebauthn rejects a counter that went backwards (cloned credential); the new value is stored for the next time.
  await ctx.db.update("lawyer_passkeys", { id: passkey.id }, { counter: result.authenticationInfo.newCounter, last_used_at: ctx.now.toISOString() });
  return passkey;
}

/** Sign-in: finds the credential, consumes the one-time challenge, verifies. Resolves the lawyer id. */
export async function verifyLogin(ctx: Ctx, response: AuthenticationResponseJSON): Promise<string> {
  const challenge = clientChallenge(response);
  const passkeys = await ctx.db.select("lawyer_passkeys", { credential_id: response.id });
  if (!passkeys.length) throw new ApiError(401, "UNKNOWN_PASSKEY", "This passkey is not registered for this portal.");
  if (!(await consumeChallenge(ctx, "login", challenge))) throw new ApiError(400, "CHALLENGE_INVALID", "The passkey request expired. Try again.");
  const passkey = await verifyAssertion(ctx, response, challenge, passkeys);
  return passkey.lawyer_id;
}

/** SHA-256 of "sqkeys-approval-v1|requestId|intentHash|decision", base64url. The lawyer's passkey signs exactly this (CDC 5.4, 8.6). */
export function approvalChallenge(requestId: string, intentHash: string, decision: "approve" | "refuse"): string {
  return b64url(createHash("sha256").update(["sqkeys-approval-v1", requestId, intentHash, decision].join("|"), "utf8").digest());
}
/** Same idea for a policy change: binds the client, the new version and the canonical new policy. */
export function policyChallenge(clientId: string, version: number, canonicalPolicy: string): string {
  return b64url(createHash("sha256").update(["sqkeys-policy-v1", clientId, String(version), canonicalPolicy].join("|"), "utf8").digest());
}

/** Options for an assertion over a fixed challenge, restricted to the lawyer's own passkeys. */
export async function assertionOptions(ctx: Ctx, lawyerPasskeys: Row[], challenge: string) {
  return generateAuthenticationOptions({
    rpID: ctx.config.rpId, userVerification: "required", timeout: 60_000,
    // The library base64url-encodes a string challenge again, so hand it the raw 32 bytes: the browser then signs exactly `challenge`.
    challenge: new Uint8Array(Buffer.from(challenge, "base64url")),
    allowCredentials: lawyerPasskeys.map((p) => ({ id: p.credential_id, transports: p.transports ?? undefined })),
  });
}
/** Verifies an assertion against the challenge the server recomputed. Resolves a short hash of the assertion for the journal. */
export async function verifyBoundAssertion(ctx: Ctx, lawyerPasskeys: Row[], response: AuthenticationResponseJSON, expectedChallenge: string): Promise<string> {
  if (clientChallenge(response) !== expectedChallenge) throw new ApiError(400, "CHALLENGE_MISMATCH", "The passkey prompt did not match this decision. Try again.");
  await verifyAssertion(ctx, response, expectedChallenge, lawyerPasskeys);
  return createHash("sha256").update(response.response.signature, "utf8").digest("hex").slice(0, 32);
}

export const newWebauthnUserId = () => b64url(Buffer.from(randomUUID().replace(/-/g, ""), "hex"));
