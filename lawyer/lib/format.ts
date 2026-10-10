// Small display helpers shared by the lawyer screens. Pure, so they are easy to test.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "4 min ago", "2 h ago", "3 days ago". Future dates read as "just now". */
export function formatAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < MINUTE) return "just now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)} h ago`;
  const days = Math.floor(seconds / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** "Updated 3 s ago" (design.md section 3). Past a minute it switches to minutes. */
export function formatUpdated(updatedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  return seconds < MINUTE ? `Updated ${seconds} s ago` : `Updated ${Math.floor(seconds / MINUTE)} min ago`;
}

/** "0x9c1D…b7c4": enough to recognise an address, never a substitute for the full value. */
export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** "0x9f2c41…b3c4d" for the intent hash (design.md L6). Adds the 0x prefix when missing. */
export function shortHash(hash: string): string {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return h.length <= 18 ? h : `${h.slice(0, 8)}…${h.slice(-5)}`;
}
