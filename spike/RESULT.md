# Spike result (Slice 0): BLOCKED on funding, not on Safe

Run: `npx tsx spike/safe-spike.ts` (viem only, sponsor EOA relay path).

Passed:
- Base Sepolia chain id 84532.
- Safe v1.4.1 factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, L2 singleton `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` and fallback handler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` all have code.
- USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` has code. Demo wallet `0x057a0280a21FDdE8B3D501bF8C4e50e162C53B08` holds 20 USDC.

Failed at "Deploy a 2-of-3 Safe through the sponsor":
`The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.`
The sponsor `0x521109CBaE98C8C1e79347884B7DAD9ECD2903F2` holds 0 Base Sepolia ETH.

Needed from Téo (prerequisite in 01-safe-live.md Slice 0):
- Send about 0.05 Base Sepolia ETH to the sponsor address above.
- Send a little (about 0.005) Base Sepolia ETH to the demo wallet `0x057a...3B08`: it also pays gas for its own USDC transfers (the bank transfer), unless that transfer is moved to the Candide path.
- Check with `npm run check-chain -- <address>`.

The Candide path was not tried: it needs the same demo-wallet ETH for the bank transfer, and the sponsor path needs no third party. Candide is attempted after the relay passes (45 min time box starts again once funded).
Not yet verified: transfer with two signatures, rejection of one signature, swapOwner. The script covers all of them.
