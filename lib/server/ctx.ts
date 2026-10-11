// Runtime context of the client app server: configuration from the environment plus the services the rules need.
// Tests build their own context; routes build it with `getCtx()`.
import { getAddress, type Address } from "viem";
import { CHAIN_ID } from "@/lib/shared/constants";
import { viemClientChain, type ClientChain } from "./chain";
import { getDb, type Db } from "./db";
import { httpPeer, type Peer } from "./peers";

export type ServerConfig = {
  usdc: Address;
  chainId: number;
  explorerUrl: string;
  /** Public URL of the lawyer portal, used to build invitation links (NEXT_PUBLIC_LAWYER_URL). */
  lawyerPortalUrl: string | undefined;
  inviteTtlSeconds: number;
  sessionTtlSeconds: number;
};

export type Ctx = {
  db: Db;
  sq: Peer;
  lawyer: Peer;
  chain: ClientChain;
  config: ServerConfig;
  env: Record<string, string | undefined>;
  now: Date;
  sleep: (ms: number) => Promise<void>;
};

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  if (env.NEXT_PUBLIC_CHAIN_ID && Number(env.NEXT_PUBLIC_CHAIN_ID) !== CHAIN_ID) throw new Error("This service runs on Base Sepolia only");
  return {
    usdc: getAddress(env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    chainId: CHAIN_ID,
    explorerUrl: (env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.basescan.org").replace(/\/+$/, ""),
    lawyerPortalUrl: env.NEXT_PUBLIC_LAWYER_URL,
    inviteTtlSeconds: 7 * 24 * 3600,
    sessionTtlSeconds: 12 * 3600,
  };
}

export function getCtx(env: Record<string, string | undefined> = process.env): Ctx {
  const config = readConfig(env);
  return {
    db: getDb(env), config, env, now: new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    sq: httpPeer("Swissquote", env.SQ_URL, env.APP_TO_SQ_SECRET),
    lawyer: httpPeer("Your lawyer's portal", env.LAWYER_URL, env.APP_TO_LAWYER_SECRET),
    chain: viemClientChain(config.usdc, env),
  };
}
