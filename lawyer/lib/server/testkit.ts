// Test helpers: in-memory database, fake chain, fixed clock, and a software WebAuthn authenticator (ES256, user verification on).
// Not imported by any route.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON, PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";
import type { Address } from "viem";
import { SAFE_THRESHOLD } from "@/src/shared/safe";
import type { NodeChain, SafeState } from "./chain";
import { readConfig, type Ctx } from "./ctx";
import { newMemoryDb } from "./db";

export const T0 = new Date("2026-10-11T12:00:00.000Z");
export const ORIGIN = "https://lawyer.test";

export class FakeNodeChain implements NodeChain {
  safes = new Map<string, SafeState>();
  usdc = new Map<string, bigint>();
  async getSafeState(safe: Address): Promise<SafeState> {
    const s = this.safes.get(safe.toLowerCase());
    if (!s) throw new Error("no such safe");
    return { owners: [...s.owners], nonce: s.nonce, threshold: s.threshold };
  }
  async usdcBalance(address: Address) { return this.usdc.get(address.toLowerCase()) ?? 0n; }
  deploy(safe: Address, owners: Address[]) { this.safes.set(safe.toLowerCase(), { owners, nonce: 0n, threshold: SAFE_THRESHOLD }); }
}

export function testCtx(now: Date = T0) {
  const env = {
    NODE_ENV: "test", LAWYER_ORIGIN: ORIGIN, APP_URL: "https://app.test", SESSION_SECRET: "s".repeat(40),
    LAWYER_SHARE_ENC_KEY: randomBytes(32).toString("hex"), LAWYER_SHARE_ENC_KEY_VERSION: "1", APP_TO_LAWYER_SECRET: "pair-secret-for-tests-only",
    REQUEST_TTL_SECONDS: "180", LAWYER_DECISION_TTL_SECONDS: "600", AUTO_DECISION_TTL_SECONDS: "120", EXIT_DELAY_SECONDS: "120",
  };
  const chain = new FakeNodeChain();
  const ctx: Ctx = { db: newMemoryDb(), chain, config: readConfig(env), env, now, sleep: async () => {} };
  return { ctx, chain, at: (ms: number): Ctx => ({ ...ctx, now: new Date(now.getTime() + ms) }) };
}

const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Buffer | Uint8Array | string) => createHash("sha256").update(b).digest();

/** A platform authenticator in software. It signs whatever challenge the server sent, like a real one. */
export class SoftAuthenticator {
  private key: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  readonly credentialId = randomBytes(32);
  counter = 0;
  constructor(private rpId = new URL(ORIGIN).hostname, private origin = ORIGIN) {}

  get id() { return b64url(this.credentialId); }

  register(options: PublicKeyCredentialCreationOptionsJSON): RegistrationResponseJSON {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: this.origin, crossOrigin: false }));
    const jwk = this.key.publicKey.export({ format: "jwk" });
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    // flags: user present (1) + user verified (4) + attested credential data (0x40)
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([0x45]), counter, Buffer.alloc(16), idLen, this.credentialId, Buffer.from(cose)]);
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]) as never);
    return {
      id: this.id, rawId: this.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject), transports: ["internal"] },
    };
  }

  assert(options: PublicKeyCredentialRequestOptionsJSON, opts: { challenge?: string; userVerified?: boolean } = {}): AuthenticationResponseJSON {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: opts.challenge ?? options.challenge, origin: this.origin, crossOrigin: false }));
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(++this.counter);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([opts.userVerified === false ? 0x01 : 0x05]), counter]);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.key.privateKey);
    return {
      id: this.id, rawId: this.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authData), signature: b64url(signature) },
    };
  }
}
