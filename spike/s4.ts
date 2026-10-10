// S4: real USDC transfer on Base Sepolia, signed by the (P1, P2) pair via MPC.
// Run: npx tsx s4.ts            -> prints the wallet address and balances, sends nothing
//      npx tsx s4.ts --send     -> sends 1 USDC (optional: --to 0x... to choose the recipient)
// Testnet only. The RPC URL is read from the root .env.local and never printed.
import { join } from "node:path";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  hexToBytes,
  http,
  isAddress,
  isAddressEqual,
  keccak256,
  parseUnits,
  recoverTransactionAddress,
  serializeTransaction,
} from "viem";
import type { Address, TransactionSerializableEIP1559 } from "viem";
import { baseSepolia } from "viem/chains";
import { SPIKE_DIR, loadShare, loadWallet, readEnvValue, report, signPair, toEthSignature } from "./lib.ts";

const DEFAULT_RPC = "https://sepolia.base.org";
const EXPLORER = "https://sepolia.basescan.org";
const USDC_DECIMALS = 6;
// Default recipient: the conventional burn address, so the test never depends on a second wallet.
const DEFAULT_RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

const root = join(SPIKE_DIR, "..");
const rpcUrl = readEnvValue(join(root, ".env.local"), "RPC_URL") ?? DEFAULT_RPC;
const usdc = readEnvValue(join(root, ".env.example"), "USDC_ADDRESS") as Address | undefined;

// Error texts from the RPC client can embed the endpoint: scrub it before printing.
function safeMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string };
  return String(e?.shortMessage ?? e?.message ?? err).split(rpcUrl).join("[RPC_URL]").split("\n")[0];
}

async function main(): Promise<void> {
  if (!usdc || !isAddress(usdc)) throw new Error("USDC_ADDRESS missing or invalid in the root .env.example");
  const { address } = loadWallet();
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  const chainId = await client.getChainId();
  if (chainId !== baseSepolia.id) throw new Error(`wrong chain id ${chainId}, expected ${baseSepolia.id} (testnet only)`);

  const usdcBalance = (who: Address) => client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });
  const eth = await client.getBalance({ address });
  const before = await usdcBalance(address);

  console.log("S4 real transaction on Base Sepolia (chain 84532)");
  console.log(`Wallet address: ${address}`);
  console.log(`ETH balance:    ${formatEther(eth)}`);
  console.log(`USDC balance:   ${formatUnits(before, USDC_DECIMALS)} (contract ${usdc})`);

  if (!process.argv.includes("--send")) {
    console.log("");
    console.log("STOP: fund this address with Base Sepolia ETH (gas) and at least 1 test USDC, then run: npx tsx s4.ts --send");
    return;
  }

  const toArg = process.argv[process.argv.indexOf("--to") + 1];
  const recipient = process.argv.includes("--to") ? (toArg as Address) : DEFAULT_RECIPIENT;
  if (!isAddress(recipient)) throw new Error("--to is not a valid address");
  const amount = parseUnits("1", USDC_DECIMALS);
  if (before < amount) throw new Error("not enough USDC: fund the wallet with at least 1 test USDC");

  // Build the unsigned EIP-1559 transaction.
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] });
  const [nonce, fees, gas] = await Promise.all([
    client.getTransactionCount({ address, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.estimateGas({ account: address, to: usdc, data }),
  ]);
  const tx: TransactionSerializableEIP1559 = {
    type: "eip1559",
    chainId,
    nonce,
    to: usdc,
    value: 0n,
    data,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
  if (eth < gas * fees.maxFeePerGas) throw new Error("not enough ETH for gas: fund the wallet with Base Sepolia ETH");
  const recipientBefore = await usdcBalance(recipient);

  // The signing hash is the keccak256 of the serialized unsigned transaction.
  const hash = keccak256(serializeTransaction(tx));
  const started = performance.now();
  const { signatures } = signPair([loadShare(0), loadShare(1)], hexToBytes(hash));
  const signMs = Math.round(performance.now() - started);
  const signature = await toEthSignature(signatures[0], hash, address);
  if (!signature) throw new Error("MPC signature does not recover the wallet address");

  // Assemble, then verify the signed transaction before broadcasting it.
  const signed = serializeTransaction(tx, signature);
  const signer = await recoverTransactionAddress({ serializedTransaction: signed });
  if (!isAddressEqual(signer, address)) throw new Error("signed transaction does not recover the wallet address");
  console.log(`Signed by P1 + P2 via MPC in ${signMs} ms, sending 1 USDC to ${recipient}`);

  const txHash = await client.sendRawTransaction({ serializedTransaction: signed });
  console.log(`Transaction hash: ${txHash}`);
  console.log(`Basescan: ${EXPLORER}/tx/${txHash}`);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  const after = await usdcBalance(address);
  const recipientAfter = await usdcBalance(recipient);
  console.log(`Block ${receipt.blockNumber}, status ${receipt.status}, gas used ${receipt.gasUsed}`);
  console.log(`Wallet USDC: ${formatUnits(before, USDC_DECIMALS)} -> ${formatUnits(after, USDC_DECIMALS)}`);
  console.log(`Recipient USDC: ${formatUnits(recipientBefore, USDC_DECIMALS)} -> ${formatUnits(recipientAfter, USDC_DECIMALS)}`);

  report([
    ["transaction accepted and mined with status success", receipt.status === "success"],
    ["wallet USDC balance decreased by exactly 1 USDC", before - after === amount],
    ["recipient USDC balance increased by exactly 1 USDC", recipientAfter - recipientBefore === amount],
  ]);
}

main().catch((err) => {
  console.log(`FAIL  ${safeMessage(err)}`);
  console.log("RESULT: FAIL");
  process.exit(1);
});
