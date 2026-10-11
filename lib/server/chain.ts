// Read-only chain access of the client app server (Base Sepolia). The app never sends a transaction: gas is paid by the sponsor.
// The RPC URL may carry a provider key, so reads go through the server and the URL is never sent to the browser.
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { safeAbi } from "@/lib/shared/safe";

export type SafeState = { owners: Address[]; nonce: bigint; threshold: number };

export interface ClientChain {
  getSafeState(safe: Address): Promise<SafeState>;
  usdcBalance(address: Address): Promise<bigint>;
  ethBalance(address: Address): Promise<bigint>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function viemClientChain(usdc: Address, env: Record<string, string | undefined> = process.env): ClientChain {
  const pub = createPublicClient({ chain: baseSepolia, transport: http(env.RPC_URL || undefined) });
  // Public RPC nodes are load balanced: right after a transaction a read can see the old block. Retry a few times.
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
    ethBalance: (address) => pub.getBalance({ address }),
  };
}
