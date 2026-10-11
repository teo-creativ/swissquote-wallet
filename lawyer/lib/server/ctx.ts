// Runtime context of the lawyer node: configuration read from the environment, plus the services the rules need
// (database, chain, clock). Tests build their own context; routes build it with `getCtx()`.
import { type Address, getAddress } from "viem";
import { CHAIN_ID } from "@/src/shared/constants";
import { viemNodeChain, type NodeChain } from "./chain";
import { getDb, type Db } from "./db";

export type NodeConfig = {
  /** Public origin of the portal, from LAWYER_ORIGIN. WebAuthn origin and rpID are derived from it, never from request headers. */
  origin: string;
  rpId: string;
  /** Client app base URL (server to server callbacks). */
  appUrl: string;
  usdc: Address;
  chainId: number;
  inviteTtlSeconds: number;
  sessionTtlSeconds: number;
  requestTtlSeconds: number;
  lawyerDecisionTtlSeconds: number;
  autoDecisionTtlSeconds: number;
  exitDelaySeconds: number;
  /** Disables Secure cookies on plain-http local development only. */
  secureCookies: boolean;
};

export type Ctx = {
  db: Db;
  chain: NodeChain;
  config: NodeConfig;
  env: Record<string, string | undefined>;
  now: Date;
  sleep: (ms: number) => Promise<void>;
};

const int = (v: string | undefined, fallback: number) => (v && /^\d+$/.test(v) ? Number(v) : fallback);

export function readConfig(env: Record<string, string | undefined> = process.env): NodeConfig {
  const dev = env.NODE_ENV === "development";
  const origin = (env.LAWYER_ORIGIN || (dev ? "http://localhost:3001" : "")).replace(/\/+$/, "");
  if (!origin) throw new Error("LAWYER_ORIGIN is not set");
  if (env.NEXT_PUBLIC_CHAIN_ID && Number(env.NEXT_PUBLIC_CHAIN_ID) !== CHAIN_ID) throw new Error("This service runs on Base Sepolia only");
  return {
    origin,
    rpId: new URL(origin).hostname,
    appUrl: (env.APP_URL || (dev ? "http://localhost:3000" : "")).replace(/\/+$/, ""),
    usdc: getAddress(env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    chainId: CHAIN_ID,
    inviteTtlSeconds: 7 * 24 * 3600,
    sessionTtlSeconds: 8 * 3600,
    requestTtlSeconds: int(env.REQUEST_TTL_SECONDS, 172_800),
    lawyerDecisionTtlSeconds: int(env.LAWYER_DECISION_TTL_SECONDS, 1_800),
    autoDecisionTtlSeconds: int(env.AUTO_DECISION_TTL_SECONDS, 120),
    exitDelaySeconds: int(env.EXIT_DELAY_SECONDS, 86_400),
    secureCookies: origin.startsWith("https://"),
  };
}

export function getCtx(env: Record<string, string | undefined> = process.env): Ctx {
  const config = readConfig(env);
  return {
    db: getDb(env), chain: viemNodeChain(config.usdc, env), config, env, now: new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
