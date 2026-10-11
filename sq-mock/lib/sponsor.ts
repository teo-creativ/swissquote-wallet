// Sponsored gas (Safe 2-of-3). The owners hold no ETH: the sponsor wallet (SQ_GAS_PRIVATE_KEY) deploys the Safe and submits
// execTransaction. It is a plain EOA relay, not an ERC-4337 paymaster. Abuse limits: only Safes of this bank's own clients, only
// plain calls with no ETH value, a cap per Safe and per day, a global cap per day, and a minimum sponsor balance.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { SAFE_THRESHOLD, predictSafeAddress, saltNonceFor } from "../src/shared/safe";
import { appendAudit } from "./audit";
import { ApiError } from "./errors";
import { address, clientBySqRef, since24h, text, type Deps, type Input } from "./services";

const invalid = (message: string) => new ApiError(400, "INVALID_INPUT", message);
const SIGNATURE_BYTES = 65;

async function requireSponsorFunds({ chain, config }: Deps) {
  if ((await chain.sponsorBalance()) < config.sponsorMinBalanceWei) throw new ApiError(503, "SPONSOR_OUT_OF_FUNDS", "Gas sponsoring is paused. Try again later.");
}

/** POST /api/gas/deploy {sqRef, owners[3], threshold, saltNonce}. Idempotent per account. */
export async function gasDeploy(deps: Deps, input: Input): Promise<{ address: Address; txHash: Hex | null; alreadyDeployed: boolean }> {
  const { store, chain, config, now } = deps;
  const client = await clientBySqRef(store, input);

  const rawOwners = input.owners;
  if (!Array.isArray(rawOwners) || rawOwners.length !== 3) throw invalid("Field owners must hold exactly three addresses.");
  const owners = rawOwners.map((o) => {
    if (typeof o !== "string" || !isAddress(o, { strict: false })) throw invalid("Field owners holds an invalid address.");
    return getAddress(o);
  }) as [Address, Address, Address];
  if (new Set(owners.map((o) => o.toLowerCase())).size !== 3) throw invalid("Owners must be distinct.");
  if (input.threshold !== SAFE_THRESHOLD) throw invalid("The threshold must be 2.");
  const saltRaw = text(input, "saltNonce", 80);
  if (!/^\d+$/.test(saltRaw) || BigInt(saltRaw) !== saltNonceFor(client.sqRef)) throw invalid("The salt does not belong to this account.");
  const saltNonce = BigInt(saltRaw);

  // The bank only sponsors Safes in which its own P3 key is the third owner.
  const p3 = await store.getOwnerShare(client.sqRef);
  if (!p3) throw new ApiError(409, "OWNER_NOT_CREATED", "Create the Swissquote owner key first.");
  if (owners[2].toLowerCase() !== p3.address.toLowerCase()) throw new ApiError(403, "NOT_OUR_OWNER", "The third owner is not the Swissquote key of this account.");

  const predicted = predictSafeAddress({ owners, saltNonce, proxyCreationCode: await chain.proxyCreationCode() });
  const known = await store.getSafeAccount(client.sqRef);
  if (known) {
    if (known.safeAddress !== predicted.toLowerCase()) throw new ApiError(409, "SAFE_EXISTS", "This account already has a different wallet.");
    return { address: predicted, txHash: (known.deployTxHash as Hex | null) ?? null, alreadyDeployed: true };
  }
  const code = await chain.getCode(predicted);
  if (code && code !== "0x") throw new ApiError(409, "SAFE_EXISTS", "This wallet address is already deployed.");

  if ((await store.countSponsorActionsSince("deploy", since24h(now))) >= config.sponsorMaxDeploysPerDay)
    throw new ApiError(429, "SPONSOR_DAILY_CAP", "The daily limit of sponsored wallet creations is reached.");
  await requireSponsorFunds(deps);

  const txHash = await chain.deploySafe({ owners, saltNonce });
  const deployed = await chain.getCode(predicted);
  if (!deployed || deployed === "0x") throw new ApiError(502, "DEPLOY_NOT_VISIBLE", "The wallet was created but is not visible yet. Retry in a moment.");
  const stored = predicted.toLowerCase();
  await store.insertSafeAccountIfAbsent({
    sqRef: client.sqRef, safeAddress: stored, p1Address: owners[0].toLowerCase(), p2Address: owners[1].toLowerCase(), p3Address: owners[2].toLowerCase(),
    saltNonce: saltRaw, deployTxHash: txHash, createdAt: now.toISOString(),
  });
  // The Safe is now the wallet linked to the client (resolve-account, bank transfer).
  if (!(await store.getLinkByAddress(stored))) await store.addLink({ clientId: client.clientId, address: stored, linkedAt: now.toISOString() });
  await store.addSponsorAction({ kind: "deploy", sqRef: client.sqRef, safeAddress: stored, txHash, createdAt: now.toISOString() });
  await appendAudit(store, "SAFE_DEPLOYED", { sqRef: client.sqRef, safe: stored, txHash, gas: "sponsor" }, now);
  return { address: predicted, txHash, alreadyDeployed: false };
}

/** POST /api/gas/exec {safeAddress, safeTx: {to, value, data}, signatures}. The sponsor submits; the owners authorized with signatures. */
export async function gasExec(deps: Deps, input: Input): Promise<{ txHash: Hex }> {
  const { store, chain, config, now } = deps;
  const safe = getAddress(address(input, "safeAddress"));
  const account = await store.getSafeAccountByAddress(safe.toLowerCase());
  if (!account) throw new ApiError(404, "UNKNOWN_SAFE", "This wallet is not one of ours.");

  const tx = input.safeTx as Record<string, unknown> | undefined;
  if (!tx || typeof tx !== "object") throw invalid("Field safeTx is missing.");
  if (typeof tx.to !== "string" || !isAddress(tx.to, { strict: false })) throw invalid("safeTx.to is not a valid address.");
  if (typeof tx.data !== "string" || !isHex(tx.data) || tx.data.length > 4096) throw invalid("safeTx.data is not valid hex.");
  if (tx.value !== "0" && tx.value !== 0) throw new ApiError(400, "VALUE_NOT_ALLOWED", "Only calls with no ETH value are sponsored.");
  const signatures = text(input, "signatures", SIGNATURE_BYTES * 3 * 2 + 2);
  if (!isHex(signatures) || (signatures.length - 2) % (SIGNATURE_BYTES * 2) !== 0) throw invalid("Field signatures is not a list of 65 byte signatures.");
  const count = (signatures.length - 2) / (SIGNATURE_BYTES * 2);
  if (count < SAFE_THRESHOLD || count > 3) throw invalid("Two or three signatures are required.");

  const since = since24h(now);
  if ((await store.countSponsorActionsSince("exec", since, account.safeAddress)) >= config.sponsorMaxExecsPerSafePerDay)
    throw new ApiError(429, "SPONSOR_SAFE_CAP", "This wallet reached its daily limit of sponsored transactions.");
  if ((await store.countSponsorActionsSince("exec", since)) >= config.sponsorMaxExecsPerDay)
    throw new ApiError(429, "SPONSOR_DAILY_CAP", "The daily limit of sponsored transactions is reached.");
  await requireSponsorFunds(deps);

  const txHash = await chain.execSafe({ safe, tx: { to: getAddress(tx.to), value: 0n, data: tx.data as Hex }, signatures: signatures as Hex });
  await store.addSponsorAction({ kind: "exec", sqRef: account.sqRef, safeAddress: account.safeAddress, txHash, createdAt: now.toISOString() });
  await appendAudit(store, "SAFE_EXECUTED", { sqRef: account.sqRef, safe: account.safeAddress, txHash, gas: "sponsor" }, now);
  return { txHash };
}
