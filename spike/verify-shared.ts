// Checks shared/safe.ts against the chain: our offline safeTxHash must equal Safe.getTransactionHash, and our offline
// CREATE2 prediction must equal the address the factory returns for a dry run. Run: npx tsx spike/verify-shared.ts
import { createPublicClient, http, parseAbi, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { predictSafeAddress, safeFactoryAbi, safeInitializer, saltNonceFor, safeTxHash, SAFE_FACTORY, SAFE_SINGLETON_L2, usdcTransferTx } from "../shared/safe";

const pub = createPublicClient({ chain: baseSepolia, transport: http() });
const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const SAFE = "0xa14072e78D994dB07a6098927020eDD4237BAE90" as const; // deployed by spike/safe-spike.ts
const abi = parseAbi(["function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)"]);

async function main() {
  const to = privateKeyToAccount(generatePrivateKey()).address;
  const tx = usdcTransferTx(usdc, to, 123_456n);
  for (const nonce of [0n, 2n, 7n]) {
    const onchain = await pub.readContract({ address: SAFE, abi, functionName: "getTransactionHash", args: [tx.to, tx.value, tx.data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce] });
    const ours = safeTxHash({ safe: SAFE, tx, nonce });
    console.log("safeTxHash nonce", nonce, ours === onchain ? "MATCH" : "DIFFERENT");
    if (ours !== onchain) process.exit(1);
  }
  const owners = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()).address) as [`0x${string}`, `0x${string}`, `0x${string}`];
  const saltNonce = saltNonceFor("00000000-0000-4000-8000-000000000000");
  const proxyCreationCode = await pub.readContract({ address: SAFE_FACTORY, abi: safeFactoryAbi, functionName: "proxyCreationCode" });
  const { result } = await pub.simulateContract({
    address: SAFE_FACTORY, abi: safeFactoryAbi, functionName: "createProxyWithNonce", args: [SAFE_SINGLETON_L2, safeInitializer(owners), saltNonce], account: owners[0],
  });
  const ours = predictSafeAddress({ owners, saltNonce, proxyCreationCode });
  console.log("predicted address", ours === result ? "MATCH" : "DIFFERENT");
  if (ours !== result) process.exit(1);
}
main();
