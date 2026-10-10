// Slice 0 spike: Safe 2-of-3 on Base Sepolia with viem only (no Safe SDK). Gas by the sponsor EOA relay.
// Run: npx tsx spike/safe-spike.ts   (reads sq-mock/.env.local; prints addresses and Basescan links only, never a key)
import {
  concat, createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, getContractAddress, http,
  keccak256, parseAbi, toHex, zeroAddress, type Address, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

process.loadEnvFile("sq-mock/.env.local");
const need = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is not set in sq-mock/.env.local`);
  return v;
};

// Safe v1.4.1 canonical deployments (same address on every chain). Checked with getCode below.
const FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address;
const SINGLETON_L2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address;
const FALLBACK = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address;
const USDC = (process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as Address;

const safeAbi = parseAbi([
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
  "function swapOwner(address prevOwner, address oldOwner, address newOwner)",
  "function getOwners() view returns (address[])",
  "function nonce() view returns (uint256)",
]);
const factoryAbi = parseAbi(["function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)", "function proxyCreationCode() view returns (bytes)"]);

const pub = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL || undefined) });
const sponsor = privateKeyToAccount(need("SQ_GAS_PRIVATE_KEY") as Hex);
const treasury = privateKeyToAccount(need("SQ_DEMO_WALLET_PRIVATE_KEY") as Hex);
const wallet = (account: typeof sponsor) => createWalletClient({ account, chain: baseSepolia, transport: http(process.env.RPC_URL || undefined) });
const link = (h: Hex) => `https://sepolia.basescan.org/tx/${h}`;
const step = (s: string) => console.log(`\n== ${s}`);
const sent = async (hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`transaction reverted: ${hash}`);
  return r;
};

async function execSafe(safe: Address, to: Address, data: Hex, signers: ReturnType<typeof privateKeyToAccount>[]) {
  const nonce = await pub.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });
  const args = [to, 0n, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress] as const;
  const hash = await pub.readContract({ address: safe, abi: safeAbi, functionName: "getTransactionHash", args: [...args, nonce] });
  // Safe wants the signatures sorted by owner address, each signing the safeTxHash directly (v = 27 or 28).
  const sorted = [...signers].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  const sigs = concat(await Promise.all(sorted.map((s) => s.sign({ hash }))));
  const tx = await wallet(sponsor).writeContract({ address: safe, abi: safeAbi, functionName: "execTransaction", args: [...args, sigs] });
  await sent(tx);
  return tx;
}

async function main() {
  step("Chain and contracts");
  console.log("chainId", await pub.getChainId(), "(expected 84532)");
  for (const [n, a] of [["factory", FACTORY], ["singletonL2", SINGLETON_L2], ["fallbackHandler", FALLBACK], ["USDC", USDC]] as const) {
    const code = await pub.getCode({ address: a });
    console.log(n, a, code && code !== "0x" ? "has code" : "NO CODE");
    if (!code || code === "0x") throw new Error(`${n} has no code on Base Sepolia`);
  }
  console.log("sponsor", sponsor.address, "ETH", (Number(await pub.getBalance({ address: sponsor.address })) / 1e18).toFixed(5));
  console.log("treasury", treasury.address, "USDC", Number(await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [treasury.address] })) / 1e6);

  step("Deploy a 2-of-3 Safe through the sponsor");
  const owners = [privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey())]; // P1 P2 P3, in memory only
  const spare = privateKeyToAccount(generatePrivateKey()); // P1' for the swapOwner step
  const initializer = encodeFunctionData({
    abi: safeAbi, functionName: "setup",
    args: [owners.map((o) => o.address), 2n, zeroAddress, "0x", FALLBACK, zeroAddress, 0n, zeroAddress],
  });
  const saltNonce = BigInt(keccak256(toHex(`spike-${Date.now()}`)));
  const deployTx = await wallet(sponsor).writeContract({ address: FACTORY, abi: factoryAbi, functionName: "createProxyWithNonce", args: [SINGLETON_L2, initializer, saltNonce] });
  await sent(deployTx);
  // Counterfactual address = CREATE2(factory, keccak(keccak(initializer) ++ saltNonce), keccak(proxyCreationCode ++ singleton))
  const creation = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "proxyCreationCode" });
  const salt = keccak256(concat([keccak256(initializer), encodeAbiParameters([{ type: "uint256" }], [saltNonce])]));
  const safe = getAddress(getContractAddress({
    opcode: "CREATE2", from: FACTORY, salt, bytecode: concat([creation, encodeAbiParameters([{ type: "uint256" }], [BigInt(SINGLETON_L2)])]),
  }));
  console.log("safe", safe, "\ndeploy", link(deployTx));
  const onchain = await pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" });
  if (onchain.length !== 3) throw new Error("unexpected owner count");

  step("Fund the Safe with 1 USDC from the demo wallet");
  const fundTx = await wallet(treasury).writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [safe, 1_000_000n] });
  await sent(fundTx);
  console.log("fund", link(fundTx));

  step("USDC transfer signed by P1 + P3 (two owners), executed by the sponsor");
  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  const before = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, 250_000n] });
  const t = await execSafe(safe, USDC, transfer, [owners[0], owners[2]]);
  const after = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });
  if (after - before !== 250_000n) throw new Error("recipient balance did not change by 0.25 USDC");
  console.log("transfer", link(t), "recipient", recipient, "+0.25 USDC");

  step("One signature is not enough (must revert)");
  try {
    await execSafe(safe, USDC, transfer, [owners[0]]);
    throw new Error("A SINGLE SIGNATURE WAS ACCEPTED");
  } catch (e) {
    if (e instanceof Error && e.message === "A SINGLE SIGNATURE WAS ACCEPTED") throw e;
    console.log("rejected as expected");
  }

  step("swapOwner P1 -> P1' signed by P2 + P3");
  // Owners are a linked list. prevOwner is the entry pointing at P1 (the sentinel 0x1 if P1 is first).
  const list = await pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" });
  const i = list.findIndex((a) => a.toLowerCase() === owners[0].address.toLowerCase());
  const prev = i === 0 ? ("0x0000000000000000000000000000000000000001" as Address) : list[i - 1];
  const swap = encodeFunctionData({ abi: safeAbi, functionName: "swapOwner", args: [prev, owners[0].address, spare.address] });
  const s = await execSafe(safe, safe, swap, [owners[1], owners[2]]);
  const final = await pub.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" });
  const swapped = final.some((a) => a === spare.address) && !final.some((a) => a === owners[0].address);
  if (!swapped) throw new Error("swapOwner did not take effect");
  console.log("swapOwner", link(s), "\nnew owner set", final.join(", "));

  console.log("\nSPIKE OK: deploy, 2-of-3 USDC transfer, single-signature rejection, swapOwner. Gas path: sponsor EOA relay.");
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e instanceof Error ? e.message.split("\n")[0] : "unknown error");
  process.exit(1);
});
