import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQ Keys",
  description: "Student prototype. Not an official Swissquote product. Testnet only: no real funds.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FA5B35" };

// Bare root layout. The mobile column lives in app/(mobile)/layout.tsx; the desktop console in app/console/layout.tsx.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
