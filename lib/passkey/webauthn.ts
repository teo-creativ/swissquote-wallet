// Browser WebAuthn layer for the phone passkey (CDC section 6). The only file that calls navigator.credentials.
//
// iOS rule: create() and get() must start inside the tap handler. Safari rejects with NotAllowedError when a
// fetch or any other await sits between the tap and the call. So createPasskey / getPasskey are NOT async functions:
// they build their options synchronously and call the browser first. Get the challenge before the tap (prepareChallenge).
import { buildCreationOptions, hkdfInfo, mapWebAuthnError, OPTIONS_MAX_AGE_MS, PASSKEY_TIMEOUT_MS, planAfterCreate, prfSalt, RP_NAME } from "./helpers";
import type { PasskeyErrorInfo, PrfPlan } from "./helpers";

export { RP_NAME };

export class PasskeyError extends Error {
  constructor(public info: PasskeyErrorInfo) {
    super(info.message);
    this.name = "PasskeyError";
  }
}

/** Logs name and message (no stack, no bytes), then throws a PasskeyError with the English message. */
function fail(e: unknown): never {
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "UnknownError";
  const message = typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "";
  console.error(`[passkey] ${name}: ${message}`);
  throw new PasskeyError(mapWebAuthnError(e));
}

// ---------------------------------------------------------------- small utils
const b64u = {
  enc(b: Uint8Array): string {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
const randomBytes = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

// ---------------------------------------------------------------- registered credentials (ids only, not secrets)
const STORE = "sqkeys.passkey.credentials";
export type ProtectionLevel = "prf" | "reduced";
const LEVEL = "sqkeys.passkey.protection";

export function knownCredentialIds(): Uint8Array<ArrayBuffer>[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as string[]).map(b64u.dec) : [];
  } catch {
    return [];
  }
}
function rememberCredential(id: Uint8Array): void {
  try {
    const ids = new Set((JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[]).concat(b64u.enc(id)));
    localStorage.setItem(STORE, JSON.stringify([...ids]));
  } catch {
    /* private mode: excludeCredentials is best effort */
  }
}
export function setProtectionLevel(level: ProtectionLevel): void {
  try {
    localStorage.setItem(LEVEL, level);
  } catch {
    /* ignore */
  }
}
export function getProtectionLevel(): ProtectionLevel | null {
  try {
    const v = localStorage.getItem(LEVEL);
    return v === "prf" || v === "reduced" ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- challenge prepared before the tap
export interface PreparedChallenge {
  challenge: Uint8Array<ArrayBuffer>;
  userId: Uint8Array<ArrayBuffer>;
  createdAt: number;
}

/**
 * Mock mode: the challenge is local random bytes (nothing verifies a signature server side yet).
 * Live mode will replace this with a fetch of server-issued options, still done on screen mount, never after the tap.
 */
export function prepareChallenge(): PreparedChallenge {
  return { challenge: randomBytes(32), userId: randomBytes(16), createdAt: Date.now() };
}
export const isStale = (p: PreparedChallenge): boolean => Date.now() - p.createdAt > OPTIONS_MAX_AGE_MS;

// ---------------------------------------------------------------- capabilities
export interface BrowserProbe {
  isSecureContext: boolean;
  origin: string;
  rpId: string;
  hasPublicKeyCredential: boolean;
  platformAuthenticator: boolean | null;
  clientCapabilities: Record<string, boolean> | null;
  userAgent: string;
}

export async function probeBrowser(): Promise<BrowserProbe> {
  const has = typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
  let platform: boolean | null = null;
  let caps: Record<string, boolean> | null = null;
  if (has) {
    try {
      platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      platform = null;
    }
    try {
      const get = (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities;
      caps = get ? await get.call(PublicKeyCredential) : null;
    } catch {
      caps = null;
    }
  }
  return {
    isSecureContext: window.isSecureContext,
    origin: location.origin,
    rpId: location.hostname,
    hasPublicKeyCredential: has,
    platformAuthenticator: platform,
    clientCapabilities: caps,
    userAgent: navigator.userAgent,
  };
}

// ---------------------------------------------------------------- ceremonies
interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

export interface CreateResult {
  credentialId: Uint8Array;
  plan: PrfPlan;
  /** PRF output when the platform returned it at creation. Never log or print it. */
  prfOutput: Uint8Array | null;
  prfEnabled: boolean;
}

/** Call directly from the tap handler. Not async on purpose (see the header). */
export function createPasskey(prepared: PreparedChallenge, userName: string, opts: { test?: boolean } = {}): Promise<CreateResult> {
  let options: PublicKeyCredentialCreationOptions;
  try {
    options = buildCreationOptions({
      rpId: location.hostname, // never hard-coded: exactly the page hostname
      challenge: prepared.challenge,
      userId: prepared.userId,
      userName,
      excludeIds: opts.test ? [] : knownCredentialIds(),
    });
  } catch (e) {
    return Promise.reject(new PasskeyError(mapWebAuthnError(e)));
  }
  return navigator.credentials.create({ publicKey: options }).then(
    (cred) => {
      if (!cred) return fail({ name: "NotAllowedError", message: "No credential returned" });
      const pk = cred as PublicKeyCredential;
      const ext = pk.getClientExtensionResults() as PrfResults;
      const first = ext.prf?.results?.first;
      const out = first ? new Uint8Array(first) : null;
      const credentialId = new Uint8Array(pk.rawId);
      if (!opts.test) rememberCredential(credentialId);
      return { credentialId, prfEnabled: ext.prf?.enabled === true || out !== null, prfOutput: out, plan: planAfterCreate({ enabled: ext.prf?.enabled === true, hasResult: out !== null }) };
    },
    (e: unknown) => fail(e),
  );
}

export interface GetResult {
  prfOutput: Uint8Array | null;
}

/** Call directly from a tap handler. withPrf false = plain user-verification assertion (reduced-protection fallback). */
export function getPasskey(credentialId: Uint8Array<ArrayBuffer> | null, challenge: Uint8Array<ArrayBuffer>, withPrf: boolean): Promise<GetResult> {
  const ids = credentialId ? [credentialId] : knownCredentialIds();
  const publicKey: PublicKeyCredentialRequestOptions = {
    rpId: location.hostname,
    challenge,
    userVerification: "required",
    timeout: PASSKEY_TIMEOUT_MS,
    allowCredentials: ids.map((id) => ({ type: "public-key" as const, id, transports: ["internal"] as AuthenticatorTransport[] })),
    ...(withPrf ? { extensions: { prf: { eval: { first: prfSalt() } } } as AuthenticationExtensionsClientInputs } : {}),
  };
  return navigator.credentials.get({ publicKey }).then(
    (cred) => {
      if (!cred) return fail({ name: "NotAllowedError", message: "No credential returned" });
      const first = ((cred as PublicKeyCredential).getClientExtensionResults() as PrfResults).prf?.results?.first;
      return { prfOutput: first ? new Uint8Array(first) : null };
    },
    (e: unknown) => fail(e),
  );
}

/** Same-bytes check that never reveals the bytes. */
export function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Wrapping key for P1: HKDF-SHA256(PRF output, fixed label) -> AES-256-GCM, non-extractable (CDC section 6). */
export async function deriveWrappingKey(prfOutput: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: hkdfInfo() },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------- reduced-protection fallback (CDC section 6, "Passkey sans PRF")
// A non-extractable AES-GCM key kept in IndexedDB. App-level gate: a user-verification assertion must succeed before
// the key is handed out. Weaker than PRF: the key sits on the device and the gate is enforced by our code, not by the
// authenticator. Only used when the server says ALLOW_NO_PRF=true, and always shown as "Reduced protection".
const DB = "sqkeys-fallback";
const OBJ = "keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OBJ);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeFallbackKey(): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OBJ, "readwrite");
    tx.objectStore(OBJ).put(key, "p1-wrap");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  setProtectionLevel("reduced");
}

/** Hands out the fallback key only after a fresh user-verification assertion. Call from a tap. */
export function unlockFallbackKey(credentialId: Uint8Array<ArrayBuffer> | null): Promise<CryptoKey> {
  return getPasskey(credentialId, randomBytes(32), false).then(async () => {
    const db = await openDb();
    const key = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const req = db.transaction(OBJ, "readonly").objectStore(OBJ).get("p1-wrap");
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!key) throw new PasskeyError({ name: "FALLBACK_KEY_MISSING", message: "The reduced-protection key was not found on this phone.", help: "Create your key again.", action: "retry" });
    return key;
  });
}

// ---------------------------------------------------------------- public config (booleans only)
export async function fetchPublicConfig(): Promise<{ allowNoPrf: boolean }> {
  try {
    const res = await fetch("/api/public-config", { cache: "no-store" });
    const j = (await res.json()) as { allowNoPrf?: unknown };
    return { allowNoPrf: j.allowNoPrf === true };
  } catch {
    return { allowNoPrf: false };
  }
}
