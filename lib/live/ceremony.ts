// What happens after the passkey ceremony in live mode: generate P1 in this browser and wrap it with the passkey.
// Shared by the key screen (first phone) and the recovery (new phone). Normal protection: wrapping key from the PRF output.
// Reduced protection (only when the server allows it): a non-extractable key gated by a user-verification assertion.
import { mapWebAuthnError } from "@/lib/passkey/helpers";
import { PasskeyError, deriveWrappingKey, setProtectionLevel, storeFallbackKey } from "@/lib/passkey/webauthn";
import { fallbackSlotName, sealNewP1, type Slot } from "./p1";

export async function sealAfterPrf(args: { slot: Slot; credentialId: Uint8Array; prfOutput: Uint8Array | null; allowNoPrf: boolean }): Promise<{ address: string; level: "prf" | "reduced" }> {
  if (args.prfOutput) {
    const key = await deriveWrappingKey(args.prfOutput as Uint8Array<ArrayBuffer>);
    const { address } = await sealNewP1(key, args.credentialId, "prf", args.slot);
    setProtectionLevel("prf");
    return { address, level: "prf" };
  }
  if (args.allowNoPrf) {
    const key = await storeFallbackKey(fallbackSlotName(args.slot));
    const { address } = await sealNewP1(key, args.credentialId, "reduced", args.slot);
    return { address, level: "reduced" };
  }
  throw new PasskeyError(mapWebAuthnError({ name: "PASSKEY_PRF_MISSING" }));
}
