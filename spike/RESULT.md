# Spike result (Slice 0): PASSED, gas path = sponsor EOA relay

Run: `npx tsx spike/safe-spike.ts` (viem only, no Safe SDK). Network: Base Sepolia (84532). Safe v1.4.1 canonical contracts.
Gas is paid by the sponsor EOA (`SQ_GAS_PRIVATE_KEY`); the three Safe owners hold no ETH.

Last run (all steps passed):
- Safe 2-of-3 deployed: `0xa14072e78D994dB07a6098927020eDD4237BAE90`, tx https://sepolia.basescan.org/tx/0x167148bbacd324e8da3b1e465f951a8ac8f8ba12851f4fc771107f5c5ed3519c
- Funded with 1 USDC from the demo wallet: https://sepolia.basescan.org/tx/0x0ba5e22d11f86a5b77b7bfa7eb527b90f7bade9a7239f0704b9b9044969cb8e4
- USDC transfer signed by two owners (P1 + P3): https://sepolia.basescan.org/tx/0x4dba2a64fcef91e8c5398d31be44d5edbb69d567e8cece8fed8994b0d818cc2c (recipient balance +0.25 USDC, checked)
- A single signature is rejected (simulation reverts, nothing is sent).
- `swapOwner` P1 -> P1' signed by P2 + P3: https://sepolia.basescan.org/tx/0x9b848270fd2eb9ca0d188a6dcdb1caa90989cda02458c4612543bcefac8b3b57 (owner set checked: P1 gone, P1' present)

The computed counterfactual address (CREATE2 from factory, initializer, saltNonce) matches the deployed proxy.

Lessons
- Public Base Sepolia RPC nodes are load balanced: a read right after a receipt can return empty data. The spike waits 4 s after each receipt; the production code must retry reads.
- Signatures are sorted by owner address and sign the `safeTxHash` directly (v = 27/28), no eth_sign wrapping.

Candide (first choice in the brief): NOT attempted. Sponsored user operations need the ERC-4337 variant of the Safe (the Safe4337 module and its own factory), so the Safe address, the signature format (userOp hash) and the `swapOwner` recovery flow would all differ from the plain Safe validated here. With the deadline, the plain Safe plus the sponsor relay is the path that runs. Candide stays a documented option for later.
