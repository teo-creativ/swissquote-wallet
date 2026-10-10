// Validates the testnet setup (CDC 15.3: verify the USDC address). Usage: RPC_URL=... USDC_ADDRESS=... npm run check-chain [-- 0xYourAddress]
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const rpc = process.env.RPC_URL ?? "https://sepolia.base.org";
const usdc = (process.env.USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`;
const who = process.argv[2] as `0x${string}` | undefined;
const c = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
const abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"]);

const chainId = await c.getChainId();
const [symbol, decimals] = await Promise.all([c.readContract({ address: usdc, abi, functionName: "symbol" }), c.readContract({ address: usdc, abi, functionName: "decimals" })]);
console.log({ rpc, chainId, expectedChainId: 84532, usdc, symbol, decimals, ok: chainId === 84532 && symbol === "USDC" && decimals === 6 });
if (who) {
  console.log("ETH :", formatUnits(await c.getBalance({ address: who }), 18));
  console.log("USDC:", formatUnits(await c.readContract({ address: usdc, abi, functionName: "balanceOf", args: [who] }), 6));
}
