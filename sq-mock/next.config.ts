import type { NextConfig } from "next";

// API-only service (simulated Swissquote). No CORS header is ever sent: browsers never call it (CDC 3.10).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Cache-Control", value: "no-store" },
      ],
    }];
  },
};
export default nextConfig;
