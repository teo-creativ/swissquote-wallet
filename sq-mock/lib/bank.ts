// Bank transfer (simulated Swissquote account, REAL USDC). POST /api/bank/transfer {sqRef, to, amountUsdc}: the demo wallet sends
// test USDC on Base Sepolia to the client's own Safe. The CHF balance and the rate are simulated; the transaction is not.
// amountUsdc is an integer string in USDC base units (6 decimals).
import { getAddress } from "viem";
import { appendAudit } from "./audit";
import { ApiError } from "./errors";
import { CHF_PER_USDC, TRANSFER_MAX_USDC, address, clientBySqRef, since24h, text, type Deps, type Input } from "./services";

export async function bankTransfer({ store, chain, config, now }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  const to = address(input, "to");
  const raw = text(input, "amountUsdc", 20);
  if (!/^[1-9]\d*$/.test(raw)) throw new ApiError(400, "INVALID_INPUT", "Field amountUsdc must be a positive integer string in base units.");
  const amount = BigInt(raw);
  if (amount > TRANSFER_MAX_USDC) throw new ApiError(400, "AMOUNT_ABOVE_LIMIT", "The maximum is 10 USDC per transfer.");

  if (client.kycStatus !== "verified") throw new ApiError(403, "KYC_REQUIRED", "The identity check must be completed before a transfer.");
  const account = await store.getSafeAccount(client.sqRef);
  if (!account) throw new ApiError(403, "NO_WALLET", "This client has no wallet yet.");
  if (account.safeAddress !== to.toLowerCase()) throw new ApiError(403, "RECIPIENT_NOT_YOUR_WALLET", "The bank only sends to the client's own wallet.");
  if (await store.getSanction(account.safeAddress)) throw new ApiError(403, "SANCTIONED_ADDRESS", "Transfers to this address are blocked.");
  if ((await store.countTransfersSince(client.clientId, since24h(now))) >= config.bankMaxTransfersPerDay)
    throw new ApiError(429, "DAILY_LIMIT_REACHED", `The maximum is ${config.bankMaxTransfersPerDay} transfers per 24 hours.`);
  const debitChf = Math.round((Number(amount) / 1e6) * CHF_PER_USDC * 100) / 100;
  if (client.cashChf < debitChf) throw new ApiError(409, "INSUFFICIENT_FUNDS", "The cash balance is too low.");

  const txHash = await chain.sendUsdc(getAddress(account.safeAddress), amount);
  await store.addTransfer({ clientId: client.clientId, address: account.safeAddress, amountUsdc: raw, txHash, createdAt: now.toISOString() });
  await store.updateClient(client.clientId, { cashChf: Math.round((client.cashChf - debitChf) * 100) / 100 });
  await appendAudit(store, "BANK_TRANSFER", { clientId: client.clientId, safe: account.safeAddress, amountUsdc: raw, debitChf, txHash }, now);
  return { txHash, debitedChf: debitChf, bankDebitSimulated: true };
}
