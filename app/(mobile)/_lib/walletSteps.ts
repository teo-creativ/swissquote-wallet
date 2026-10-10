import type { WalletStep } from "@/lib/sqkeys";

/** The 7 WalletStep values with the exact labels of annex F.2 (C6, and the new wallet of a recovery). */
export const STEPS: { id: WalletStep; label: string }[] = [
  { id: "preparing", label: "Preparing" },
  { id: "creating_keys", label: "Creating your key (nobody ever sees the whole key)" },
  { id: "checking_keys", label: "Checking the key" },
  { id: "saving_key_on_device", label: "Saving your part on this phone" },
  { id: "linking_wallet", label: "Linking your wallet to your Swissquote account" },
  { id: "funding_gas", label: "Adding network fees" },
  { id: "done", label: "Done" },
];
