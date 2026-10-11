// Read-only chain access of the lawyer node (Base Sepolia). The node never sends a transaction: gas is paid by the sponsor.
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { safeAbi } from "@/src/shared/safe";

export type SafeState = { owners: Address[]; nonce: bigint; threshold: number };

export interface NodeChain {
  /** Retries while a load balanced RPC node has not seen the latest block. */
  getSafeState(safe: Address): Promise<SafeState>;
  usdcBalance(address: Address): Promise<bigint>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function viemNodeChain(usdc: Address, env: Record<string, string | undefined> = process.env): NodeChain {
  const pub = createPublicClient({ chain: baseSepolia, transport: http(env.RPC_URL || undefined) });
  const settle = async <T,>(read: () => Promise<T>): Promise<T> => {
    let last: unknown;
    for (let i = 0; i < 5; i++) {
      try { return await read(); } catch (e) { last = e; await wait(1200); }
    }
    throw last;
  };
  return {
    getSafeState: (safe) =>
      settle(async () => {
        const [owners, nonce, threshold] = await Promise.all([
          pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" }),
          pub.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          pub.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold" }),
        ]);
        return { owners: [...owners], nonce, threshold: Number(threshold) };
      }),
    usdcBalance: (address) => settle(() => pub.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] })),
  };
}
