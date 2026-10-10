// Build-time check that the Node WASM package is resolvable and traced. Remove once the real node routes exist.
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const m = await import("@silencelaboratories/dkls-wasm-ll-node");
  return NextResponse.json({ ok: true, exports: Object.keys(m).slice(0, 5) });
}
