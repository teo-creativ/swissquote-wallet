// Browser-side MPC party P1. Aaron owns the real implementation (CDC 3.5).
// This stub only proves the WASM package loads under webpack (spike S5).
export async function loadMpc() {
  const mod = await import("@silencelaboratories/dkls-wasm-ll-web");
  await mod.default();
  return mod;
}
