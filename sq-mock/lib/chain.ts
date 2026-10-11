// Chain access of the Swissquote mock: Base Sepolia only (testnet, CDC rule 1). Two service wallets, both held only here:
// the sponsor / gas account (SQ_GAS_PRIVATE_KEY) that pays the gas of Safe deployments and executions, and the demo treasury
// (SQ_DEMO_WALLET_PRIVATE_KEY) that sends test USDC. Keys are read from the environment at call time, never logged or returned.
// Custody model: Safe 2-of-3 smart account (not MPC). The sponsor is a plain EOA relay: it signs nothing on behalf of an owner.
import {
  createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { CHAIN_ID } from "../src/shared/constants";
import { SAFE_FACTORY, SAFE_SINGLETON_L2, safeAbi, safeFactoryAbi, safeInitializer, type SafeTx } from "../src/shared/safe";
import { ApiError } from "./errors";

export type SafeState = { owners: Address[]; nonce: bigint; threshold: number };

export interface Chain {
  getEthBalance(address: Address): Promise<bigint>;
  /** Sends test ETH from the gas account. */
  sendGas(to: Address, amountWei: bigint): Promise<Hex>;
  /** Sends test USDC from the demo treasury. Amount in base units (6 decimals). */
  sendUsdc(to: Address, amount: bigint): Promise<Hex>;

  getCode(address: Address): Promise<Hex | undefined>;
  /** Creation code of the Safe proxy, read once from the factory. */
  proxyCreationCode(): Promise<Hex>;
  /** Owners, nonce and threshold read from the Safe. Retries while a load balanced RPC node has not seen the latest block. */
  getSafeState(safe: Address): Promise<SafeState>;
  sponsorBalance(): Promise<bigint>;
  /** The sponsor deploys the Safe proxy. Resolves the transaction hash once mined. */
  deploySafe(args: { owners: readonly Address[]; saltNonce: bigint }): Promise<Hex>;
  /** The sponsor submits execTransaction. The call is simulated first, so a bad signature set costs no gas. */
  execSafe(args: { safe: Address; tx: SafeTx; signatures: Hex }): Promise<Hex>;
}

type EnvName = "SQ_GAS_PRIVATE_KEY" | "SQ_DEMO_WALLET_PRIVATE_KEY";

function account(envName: EnvName, env: Record<string, string | undefined>) {
  const key = env[envName];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ApiError(500, "NOT_CONFIGURED", "A service wallet is not configured.");
  return privateKeyToAccount(key as Hex);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One sponsor transaction at a time per server instance, so two requests never reuse the same account nonce.
let sponsorQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const run = sponsorQueue.then(job, job);
  sponsorQueue = run.catch(() => undefined);
  return run;
}

export function viemChain(usdcAddress: Address, env: Record<string, string | undefined> = process.env): Chain {
  if (env.CHAIN_ID && Number(env.CHAIN_ID) !== CHAIN_ID) throw new ApiError(500, "NOT_CONFIGURED", "This service runs on Base Sepolia only.");
  const transport = () => http(env.RPC_URL || undefined);
  const pub = createPublicClient({ chain: baseSepolia, transport: transport() });
  const wallet = (envName: EnvName) => createWalletClient({ account: account(envName, env), chain: baseSepolia, transport: transport() });
  // Public RPC nodes are load balanced: a read right after a receipt can return empty data. Retry a few times.
  const settle = async <T>(read: () => Promise<T>): Promise<T> => {
    let last: unknown;
    for (let i = 0; i < 6; i++) {
      try { return await read(); } catch (e) { last = e; await wait(1500); }
    }
    throw last;
  };
  const mined = async (hash: Hex) => {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") throw new ApiError(422, "EXECUTION_REVERTED", "The transaction was reverted on chain.");
    await wait(2000);
    return hash;
  };

  return {
    getEthBalance: (address) => pub.getBalance({ address }),
    sendGas: (to, amountWei) => wallet("SQ_GAS_PRIVATE_KEY").sendTransaction({ to, value: amountWei }),
    sendUsdc: (to, amount) =>
      wallet("SQ_DEMO_WALLET_PRIVATE_KEY").writeContract({ address: usdcAddress, abi: erc20Abi, functionName: "transfer", args: [to, amount] }),

    getCode: (address) => pub.getCode({ address }),
    proxyCreationCode: () => settle(() => pub.readContract({ address: SAFE_FACTORY, abi: safeFactoryAbi, functionName: "proxyCreationCode" })),
    async getSafeState(safe) {
      return settle(async () => {
        const [owners, nonce, threshold] = await Promise.all([
          pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" }),
          pub.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          pub.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold" }),
        ]);
        return { owners: [...owners], nonce, threshold: Number(threshold) };
      });
    },
    sponsorBalance: () => pub.getBalance({ address: account("SQ_GAS_PRIVATE_KEY", env).address }),

    deploySafe: ({ owners, saltNonce }) =>
      serialized(async () => {
        const w = wallet("SQ_GAS_PRIVATE_KEY");
        const hash = await w.writeContract({
          address: SAFE_FACTORY, abi: safeFactoryAbi, functionName: "createProxyWithNonce", args: [SAFE_SINGLETON_L2, safeInitializer(owners), saltNonce],
        });
        return mined(hash);
      }),

    execSafe: ({ safe, tx, signatures }) =>
      serialized(async () => {
        const w = wallet("SQ_GAS_PRIVATE_KEY");
        const args = [tx.to, tx.value, tx.data, 0, 0n, 0n, 0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", signatures] as const;
        let request;
        try {
          ({ request } = await pub.simulateContract({ address: safe, abi: safeAbi, functionName: "execTransaction", args, account: w.account }));
        } catch {
          // Bad signatures, wrong nonce, failing call: nothing was sent and no gas was spent.
          throw new ApiError(422, "EXECUTION_REVERTED", "The transaction would fail on chain. Nothing was sent.");
        }
        return mined(await w.writeContract(request));
      }),
  };
}
