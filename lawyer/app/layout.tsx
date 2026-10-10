import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQ Keys Lawyer",
  description: "Student prototype. Not an official Swissquote product. Testnet only: no real funds.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#262A33" };

// The "Simulated lawyer" strip lives in each layout group ((portal), and the sign-in screens later).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface">
        {children}
        <footer className="px-4 py-3 text-center text-xs text-muted md:pb-3 max-md:pb-24">
          Student prototype. Not an official Swissquote product. Testnet only: no real funds.
          <br />We only use cookies that are strictly necessary.
        </footer>
      </body>
    </html>
  );
}
