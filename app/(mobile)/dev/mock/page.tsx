import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isMockMode } from "@/lib/sqkeys.mode";
import { MockPanel } from "./MockPanel";

// Dev control panel for lib/sqkeys.mock.ts. Only exists when NEXT_PUBLIC_SQKEYS_MODE=mock (default).
export const metadata: Metadata = { title: "Mock panel · SQ Keys", robots: { index: false, follow: false } };

export default function MockPanelPage() {
  if (!isMockMode) notFound();
  return <MockPanel />;
}
