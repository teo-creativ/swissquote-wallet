// Browser-side MPC (party P1). Loads the WASM build for the web and exposes it through the same
// structural type as the server build, so the round logic in lib/shared/mpc-node/protocol.ts is
// shared with the nodes. Import only from client components: the module fetches a .wasm file.
import { keygenRound, keygenRound1 } from "../../shared/mpc-node/protocol";
import { KEYGEN_LAST_ROUND, KEYGEN_PARTICIPANTS, MpcError, toHex } from "../../shared/mpc-node/types";
import type { MpcLib, WireMessage } from "../../shared/mpc-node/types";

let loading: Promise<MpcLib> | null = null;

/** Loads and initialises the WASM module once per page. Needs a secure context in production (HTTPS). */
export function loadMpc(): Promise<MpcLib> {
  loading ??= (async () => {
    const mod = await import("@silencelaboratories/dkls-wasm-ll-web");
    await mod.default();
    return mod;
  })();
  // A failed load must not be cached: the next call tries again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export type KeygenCheckResult = {
  ok: boolean;
  /** Time to load and initialise the WASM module, then to run the key generation. */
  loadMs: number;
  keygenMs: number;
  /** Compressed public key (public information). Key shares never leave this function. */
  publicKey?: `0x${string}`;
  /** Rounds completed, 5 when everything went through. */
  rounds: number;
  error?: string;
};

/**
 * Self test for the dev page: a full 3-party, threshold 2 key generation inside this tab, with
 * the state serialized between every round. The three shares are thrown away at the end.
 */
export async function runKeygenCheck(): Promise<KeygenCheckResult> {
  const t0 = performance.now();
  let loadMs = 0;
  let rounds = 0;
  try {
    const lib = await loadMpc();
    loadMs = performance.now() - t0;
    const t1 = performance.now();
    const ids = [...Array(KEYGEN_PARTICIPANTS).keys()];

    const first = ids.map((id) => keygenRound1(lib, id));
    let states = first.map((r) => r.state as Uint8Array);
    let messages: WireMessage[] = first.flatMap((r) => r.messages);
    let commitments: string[] | undefined;
    let publicKeys: Uint8Array[] = [];
    rounds = 1;

    for (let round = 2; round <= KEYGEN_LAST_ROUND; round++) {
      const batch = messages;
      const out = ids.map((id) => keygenRound(lib, id, states[id], round, batch, round === 4 ? commitments : undefined));
      if (round === 2) commitments = out.map((r) => r.commitment as string);
      if (round === KEYGEN_LAST_ROUND) publicKeys = out.map((r) => r.publicKey as Uint8Array);
      else states = out.map((r) => r.state as Uint8Array);
      messages = out.flatMap((r) => r.messages);
      rounds = round;
    }

    const keys = publicKeys.map(toHex);
    const same = keys.length === KEYGEN_PARTICIPANTS && keys.every((k) => k === keys[0]) && /^0x0[23][0-9a-f]{64}$/.test(keys[0]);
    return { ok: same, loadMs, keygenMs: performance.now() - t1, publicKey: keys[0], rounds, error: same ? undefined : "The three parties do not hold the same public key" };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const detail = err instanceof MpcError ? `${err.code}: ${err.detail ?? err.message}` : `${e?.name ?? "Error"}: ${String(e?.message ?? err)}`;
    return { ok: false, loadMs, keygenMs: 0, rounds, error: detail.slice(0, 300) };
  }
}
