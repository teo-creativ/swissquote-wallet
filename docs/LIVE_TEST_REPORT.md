# Live test report

Run: 2026-10-11T01:47:41.882Z (local dev servers). Result: **PASSED**.

Custody model: Safe 2-of-3 smart account on Base Sepolia (not MPC). Real: passkeys, keys, Safe, USDC, gas sponsoring, lawyer approvals, recovery, console state.
Simulated (labelled on screen): Swissquote login, identity check, bank account (CHF).

Wallet: 0x6c20f4F766700Af7961FEEaB4984b3E4Fe0056fC (https://sepolia.basescan.org/address/0x6c20f4F766700Af7961FEEaB4984b3E4Fe0056fC)

| Step | Result | Seconds | Note |
|---|---|---|---|
| Start the three apps (client 3200, lawyer 3201, Swissquote mock 3202) | OK | 25.3 |  |
| 1. Sign in with Swissquote (simulated login, labelled) and pass the identity check (simulated, labelled) | OK | 34.5 |  |
| 2. Accept the four documents | OK | 6.3 |  |
| 3. Invite the lawyer: a deployed-style https link built from NEXT_PUBLIC_LAWYER_URL, no localhost fallback | OK | 16.2 |  |
| 4. The lawyer opens the link on their laptop, creates an account and a passkey (real WebAuthn) | OK | 29.4 |  |
| 5. The client app notices the acceptance (polling) | OK | 2.3 |  |
| 6. One tap: passkey, key P1 in the browser, P2 + P3 addresses, Safe deployed by the sponsor, three real share cards | OK | 11.7 |  |
| 6b. The owners hold no ETH (gas is sponsored) | OK | 1.2 |  |
| 7. Fund the wallet from the Swissquote account: a real USDC transfer from the bank mock (account is simulated, labelled) | OK | 9.9 |  |
| 7b. The receive screen shows the real address, the real balance and the faucet help | OK | 4.1 |  |
| 8. Send to a NEW recipient: needs the lawyer. The lawyer approves with a passkey and adds the recipient | OK | 27.4 |  |
| 9. Send UNDER the threshold to the now-known recipient: instant (AUTO), no lawyer | OK | 6.9 |  |
| 10. Send OVER the threshold (5.50 > 5.00): the lawyer must approve | OK | 16.2 |  |
| 11. The lawyer DECLINES a transfer to another new recipient: nothing is sent | OK | 8.1 |  |
| 12. On-chain check: the recipient received exactly what was approved | OK | 0.2 |  |
| 13. ATTACKER with the stolen phone and e-mail: the console is set to 'check fails', the recovery ends refused | OK | 59.6 |  |
| 14. The real owner still controls the wallet after the attack | OK | 15.1 |  |
| 15. RECOVERY on a new phone: identity check, new passkey and key, lawyer approval, delay, swapOwner (same address) | OK | 46.5 |  |
| 16. The old key lost control, the wallet address and funds are unchanged, the new key works | OK | 12.4 |  |
| 17. The console and the lawyer journal show the real state | OK | 3.4 |  |
| 18. Nothing mock leaked into the live build | OK | 0 |  |

## Transactions on Basescan

- Safe 2-of-3 deployment (gas by the sponsor, owners hold no ETH): https://sepolia.basescan.org/tx/0x99e1d4454afa92157ca14c30f879ef040ac1e1ea0f232cad0f1c5dad28852501
- Bank transfer to the wallet: https://sepolia.basescan.org/tx/0x8abc97ba2c1b2763bc19e5c636ce4f4b138462e81c37b2274086bbcc48baef11
- Send 1.00 USDC to a new recipient (lawyer approved): https://sepolia.basescan.org/tx/0xc1a715c98b93b620b0be47624a74713a590d4f5689c0c10bc44e6dbdf0be7c92
- Send 1.00 USDC under the threshold (AUTO): https://sepolia.basescan.org/tx/0x575bcba093226ae3da088e1eb6c558632e01ac79c4e96a1d6e683d8cf9dbb726
- Send 5.50 USDC over the threshold (lawyer approved): https://sepolia.basescan.org/tx/0x1d970a50c983df631c63811bb48bdc419abc414990e40114fcef27859f653a38
- Send 0.50 USDC after the refused attack: https://sepolia.basescan.org/tx/0xb9b66da4f911b55d329fb9a1c7ceb069da598b17697423b85d8934485c209451
- Recovery: swapOwner signed by the lawyer (P2) and Swissquote (P3): https://sepolia.basescan.org/tx/0x344f1a04dad975a20dcb2713e419c0fc3e4ea054aee1ac313601341679be5f42
- Send 0.20 USDC from the new phone: https://sepolia.basescan.org/tx/0xcc168a0d20143c810e342fd2235807f2222a15dc10855065867b67cd86f80544

Two virtual authenticators with PRF (Chrome, CDP) stand in for the phone and the laptop. Face ID on a real iPhone is tested by hand: see the final report.
