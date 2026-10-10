// Non-secret settings read from the environment (CDC annex C). Private keys are read in lib/chain.ts only.
import { getAddress, type Address } from "viem";

export type Config = {
  usdcAddress: Address;
  recoveryDelaySeconds: number;
  /** Fixed amount of one gas drip (CDC 3.6: 0.0003 ETH). */
  gasDripWei: bigint;
  /** A wallet is topped up only below this balance (CDC 3.6: 0.0001 ETH). */
  gasDripMinBalanceWei: bigint;
  /** Global number of drips per 24 h. */
  gasDripDailyCap: number;
  kycDelayMs: number;
  /** Expected answer to the simulated banking question. Undefined means every identity check fails. */
  bankingAnswer: string | undefined;
};

const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 0 ? n : fallback;
}
function wei(value: string | undefined, fallback: bigint): bigint {
  return value && /^\d+$/.test(value) ? BigInt(value) : fallback;
}

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    usdcAddress: getAddress(env.USDC_ADDRESS || DEFAULT_USDC),
    recoveryDelaySeconds: positiveInt(env.RECOVERY_DELAY_SECONDS, 120),
    gasDripWei: wei(env.GAS_DRIP_WEI, 300_000_000_000_000n),
    gasDripMinBalanceWei: wei(env.GAS_DRIP_MIN_BALANCE_WEI, 100_000_000_000_000n),
    gasDripDailyCap: positiveInt(env.GAS_DRIP_DAILY_CAP, 50),
    kycDelayMs: 2000,
    bankingAnswer: env.SQ_DEMO_BANKING_ANSWER || undefined,
  };
}
