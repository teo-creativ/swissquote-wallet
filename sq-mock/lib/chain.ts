// Chain access of the Swissquote mock: Base Sepolia only (testnet, CDC rule 1). Two service wallets, both held only here:
// the gas account (SQ_GAS_PRIVATE_KEY) and the demo treasury that sends test USDC (SQ_DEMO_WALLET_PRIVATE_KEY).
// The keys are read from the environment at call time and are never logged or returned.
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { CHAIN_ID } from "../src/shared/constants";
import { ApiError } from "./errors";

export interface Chain {
  getEthBalance(address: Address): Promise<bigint>;
  /** Sends test ETH from the gas account. */
  sendGas(to: Address, amountWei: bigint): Promise<Hex>;
  /** Sends test USDC from the demo treasury. Amount in base units (6 decimals). */
  sendUsdc(to: Address, amount: bigint): Promise<Hex>;
}

function wallet(envName: "SQ_GAS_PRIVATE_KEY" | "SQ_DEMO_WALLET_PRIVATE_KEY", env: Record<string, string | undefined>) {
  const key = env[envName];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ApiError(500, "NOT_CONFIGURED", "A service wallet is not configured.");
  return createWalletClient({ account: privateKeyToAccount(key as Hex), chain: baseSepolia, transport: http(env.RPC_URL || undefined) });
}

export function viemChain(usdcAddress: Address, env: Record<string, string | undefined> = process.env): Chain {
  if (env.CHAIN_ID && Number(env.CHAIN_ID) !== CHAIN_ID) throw new ApiError(500, "NOT_CONFIGURED", "This service runs on Base Sepolia only.");
  return {
    getEthBalance: (address) => createPublicClient({ chain: baseSepolia, transport: http(env.RPC_URL || undefined) }).getBalance({ address }),
    sendGas: (to, amountWei) => wallet("SQ_GAS_PRIVATE_KEY", env).sendTransaction({ to, value: amountWei }),
    sendUsdc: (to, amount) =>
      wallet("SQ_DEMO_WALLET_PRIVATE_KEY", env).writeContract({ address: usdcAddress, abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
  };
}
