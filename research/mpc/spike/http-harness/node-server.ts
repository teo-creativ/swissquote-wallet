// HTTP harness: one MPC node (P2 lawyer or P3 Swissquote) as a tiny Node http server.
// Usage: tsx node-server.ts <partyId> <port>   (secret in env HARNESS_HMAC_SECRET)
// Everything is in memory and disposable. Route names follow CDC annex A.2 (node routes).
// Never prints shares, keys or the secret.
import * as dkls from "@silencelaboratories/dkls-wasm-ll-node";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { hexToBytes, isHex, keccak256 } from "viem";
import { MemoryNonceStore, verifyRequest } from "../../../../shared/hmac.ts";
import { MemorySessionStore, MpcError, keygenFinish, keygenStart, keygenStep, signFinish, signStart, signStep, singleKeyRing } from "../../shared/mpc-node/index.ts";
import type { MpcNodeContext, StoredShare } from "../../shared/mpc-node/index.ts";

const partyId = Number(process.argv[2]);
const port = Number(process.argv[3]);
const secret = process.env.HARNESS_HMAC_SECRET;
if (![1, 2].includes(partyId) || !port || !secret) {
  console.error("usage: HARNESS_HMAC_SECRET=... tsx node-server.ts <1|2> <port>");
  process.exit(2);
}

// The storage key lives only in this process: no other node can read this node's records.
const ctx: MpcNodeContext = { lib: dkls, store: new MemorySessionStore(), keys: singleKeyRing(1, new Uint8Array(randomBytes(32))), partyId };
const nonces = new MemoryNonceStore();
const shares = new Map<string, StoredShare>(); // by public key, encrypted
const kinds = new Map<string, "dkg" | "sign">(); // session id -> protocol

const HTTP_STATUS: Record<string, number> = { BAD_REQUEST: 400, SESSION_NOT_FOUND: 409, ABORT_BAN_PARTY: 422, PROTOCOL_ERROR: 422, STORAGE_ERROR: 500 };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function route(path: string, body: any): Promise<unknown> {
  if (path === "/api/node/dkg/open") {
    kinds.set(body.sessionId, "dkg");
    return keygenStart(ctx, { sessionId: body.sessionId });
  }
  if (path === "/api/node/dkg/commit") {
    const stored = await keygenFinish(ctx, { sessionId: body.sessionId, publicKey: body.publicKey });
    shares.set(stored.publicKey, stored);
    kinds.delete(body.sessionId);
    return { partyId: stored.partyId, publicKey: stored.publicKey };
  }
  if (path === "/api/node/sign/open") {
    const share = shares.get(String(body.publicKey).toLowerCase());
    if (!share) throw new MpcError("BAD_REQUEST", "Unknown wallet");
    if (!isHex(body.unsignedTx)) throw new MpcError("BAD_REQUEST", "unsignedTx must be hex");
    // The node computes the hash itself from what it was asked to sign (CDC 8.3). A real node
    // parses and checks the transaction against the policy decision before this line.
    const messageHash = hexToBytes(keccak256(body.unsignedTx));
    kinds.set(body.sessionId, "sign");
    return signStart(ctx, { sessionId: body.sessionId, share, signers: body.signers, messageHash });
  }
  const step = path.match(/^\/api\/node\/session\/([A-Za-z0-9-]+)\/(step|finish)$/);
  if (step) {
    const [, sessionId, action] = step;
    const kind = kinds.get(sessionId);
    if (!kind) throw new MpcError("SESSION_NOT_FOUND", "Session not found, expired or already used at this round");
    if (action === "finish") return signFinish(ctx, { sessionId, peerLast: body.peerLast });
    if (kind === "dkg") return keygenStep(ctx, { sessionId, round: body.round, messages: body.messages, commitments: body.commitments });
    return signStep(ctx, { sessionId, round: body.round, messages: body.messages });
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const path = req.url ?? "/";
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, partyId });
    if (req.method !== "POST") return send(res, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
    const text = await readBody(req);
    // Authenticate before anything else: no HMAC, no protocol.
    const auth = await verifyRequest({ secret, method: "POST", path, body: text, headers: { get: (name) => (req.headers[name] as string | undefined) ?? null }, nonces });
    if (!auth.ok) return send(res, 401, { error: { code: auth.reason, message: "Request not authenticated" } });
    const out = await route(path, JSON.parse(text));
    if (out === null) return send(res, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
    return send(res, 200, out);
  } catch (err) {
    if (err instanceof MpcError) return send(res, HTTP_STATUS[err.code] ?? 500, { error: { code: err.code, message: err.message, banParty: err.banParty } });
    return send(res, 500, { error: { code: "INTERNAL", message: "Internal error" } });
  }
});
server.listen(port, "127.0.0.1", () => console.log(`node P${partyId + 1} (party id ${partyId}) listening on 127.0.0.1:${port}`));
