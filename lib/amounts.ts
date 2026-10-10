// USDC has 6 decimals. UI amounts are decimal strings ("5.00"); the engine uses integer base units ("5000000").
export const toBase = (usdc: string): string => {
  if (!/^\d+(\.\d{1,6})?$/.test(usdc)) throw new Error("INVALID_AMOUNT");
  const [i, f = ""] = usdc.split(".");
  return (BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"))).toString();
};
export const fromBase = (base: string): string => {
  if (!/^\d+$/.test(base)) throw new Error("INVALID_AMOUNT");
  const v = BigInt(base);
  return `${v / 1_000_000n}.${(v % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
};
