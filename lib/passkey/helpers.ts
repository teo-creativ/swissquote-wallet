// Pure WebAuthn helpers (no browser API call here, so vitest can run them). Browser calls live in webauthn.ts.

/** Fixed app labels. Changing one makes every existing wrapped P1 unreadable. */
export const PRF_SALT_LABEL = "sqkeys/prf-salt/v1";
export const HKDF_INFO_LABEL = "sqkeys/p1-wrapping-key/v1";
export const RP_NAME = "SQ Keys";
export const PASSKEY_TIMEOUT_MS = 60_000;
/** Options fetched before the tap go stale: refresh them after this long. */
export const OPTIONS_MAX_AGE_MS = 3 * 60_000;

export type PasskeyErrorAction = "retry" | "sign_in_existing" | "open_in_browser";
export interface PasskeyErrorInfo {
  name: string;
  message: string;
  help: string;
  action: PasskeyErrorAction;
}

const IOS_HELP = "On iPhone, passkeys need iCloud Keychain turned on and Face ID or a passcode set.";
const ANDROID_HELP = "On Android, use Chrome with a screen lock (PIN, pattern or fingerprint) and a Google account with Google Password Manager.";
const HELP_SUFFIX = `${IOS_HELP} ${ANDROID_HELP}`;

/** Maps a DOMException name to a short English message. Only the name is kept, never a stack. */
export function mapWebAuthnError(error: unknown): PasskeyErrorInfo {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "UnknownError";
  switch (name) {
    case "NotAllowedError":
      return { name, action: "retry", message: "The request was cancelled, timed out, or was not started from a tap.", help: `Tap the button again and confirm with Face ID, fingerprint or your device code. ${HELP_SUFFIX}` };
    case "SecurityError":
      return { name, action: "retry", message: "This page cannot create a passkey: wrong domain or not a secure (HTTPS) page.", help: "Open the app from its HTTPS address, not from localhost or a network address." };
    case "NotSupportedError":
      return { name, action: "retry", message: "This phone or browser does not support the passkey type we need.", help: HELP_SUFFIX };
    case "InvalidStateError":
      return { name, action: "sign_in_existing", message: "A passkey already exists for this account on this phone.", help: "Use the existing passkey instead of creating a second one." };
    case "AbortError":
      return { name, action: "retry", message: "The request was interrupted.", help: "Tap the button again." };
    case "PASSKEY_PRF_MISSING":
      return { name, action: "retry", message: "This phone created a passkey but cannot use it to protect your key.", help: HELP_SUFFIX };
    default:
      return { name, action: "retry", message: `Something went wrong with the passkey (${name}).`, help: HELP_SUFFIX };
  }
}

const IN_APP_PATTERNS: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/Instagram/i, "Instagram"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Messenger/i, "Messenger"],
  [/WhatsApp/i, "WhatsApp"],
  [/\bLine\//i, "Line"],
  [/MicroMessenger|WeChat/i, "WeChat"],
  [/MiuiBrowser|MIUI ?Browser/i, "MIUI Browser"],
  [/; wv\)/i, "Android WebView"],
];

/** Returns the name of the in-app browser / webview, or null for a normal browser. */
export function detectInAppBrowser(userAgent: string): string | null {
  for (const [re, name] of IN_APP_PATTERNS) if (re.test(userAgent)) return name;
  return null;
}

/** Hosts a phone cannot use as rpId. Returns a reason, or null when the host looks fine. */
export function rpIdProblem(hostname: string, isSecureContext: boolean): string | null {
  if (!isSecureContext) return "The page is not a secure context (HTTPS needed).";
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "localhost cannot be used from a phone. Open the HTTPS production address.";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return "An IP address cannot be a passkey domain. Use an HTTPS hostname.";
  return null;
}

export interface Capabilities {
  secureContext: boolean;
  hasPublicKeyCredential: boolean;
  platformAuthenticator: boolean | null;
  prfReported: boolean | null;
}

/** Turns raw capability probes into one verdict plus advice. Does not claim more than the probes say. */
export function interpretCapabilities(c: Capabilities): { usable: boolean; advice: string[] } {
  const advice: string[] = [];
  if (!c.secureContext) advice.push("Open the app from its HTTPS address.");
  if (!c.hasPublicKeyCredential) advice.push("This browser has no passkey support. Use Safari on iPhone or Chrome on Android.");
  if (c.platformAuthenticator === false) advice.push("No built-in authenticator found. Set a screen lock (PIN, pattern or fingerprint) and sign in to a Google account with Google Password Manager (Android), or turn on iCloud Keychain and Face ID (iPhone).");
  if (c.prfReported === false) advice.push("This browser reports no PRF support. Your key cannot be protected the full way on this phone.");
  const usable = c.secureContext && c.hasPublicKeyCredential && c.platformAuthenticator !== false;
  return { usable, advice };
}

const enc = new TextEncoder();
export const prfSalt = (): Uint8Array<ArrayBuffer> => enc.encode(PRF_SALT_LABEL);
export const hkdfInfo = (): Uint8Array<ArrayBuffer> => enc.encode(HKDF_INFO_LABEL);

export interface CreationParams {
  rpId: string;
  challenge: Uint8Array<ArrayBuffer>;
  userId: Uint8Array<ArrayBuffer>;
  userName: string;
  excludeIds: Uint8Array<ArrayBuffer>[];
}

/** Creation options per CDC section 6. Pure: nothing here touches the browser. */
export function buildCreationOptions(p: CreationParams): PublicKeyCredentialCreationOptions {
  if (p.userId.length < 1 || p.userId.length > 64) throw new Error("user.id must be 1 to 64 bytes");
  return {
    rp: { name: RP_NAME, id: p.rpId },
    user: { id: p.userId, name: p.userName, displayName: p.userName },
    challenge: p.challenge,
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" },
    attestation: "none",
    timeout: PASSKEY_TIMEOUT_MS,
    excludeCredentials: p.excludeIds.map((id) => ({ type: "public-key" as const, id })),
    extensions: { prf: { eval: { first: prfSalt() } } } as AuthenticationExtensionsClientInputs,
  };
}

/** What a PRF-capable ceremony returned, reduced to what we need. Bytes never leave the caller. */
export interface PrfOutcome {
  enabled: boolean;
  hasResult: boolean;
}

export type PrfPlan = "ready" | "needs_second_tap" | "unsupported";

/** Creation gave a result: done. Only `enabled`: a second get() is needed. Neither: PRF is not available. */
export function planAfterCreate(o: PrfOutcome): PrfPlan {
  if (o.hasResult) return "ready";
  if (o.enabled) return "needs_second_tap";
  return "unsupported";
}
