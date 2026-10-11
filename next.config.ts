import type { NextConfig } from "next";

// WASM (DKLs23 / Silence Laboratories) needs webpack's asyncWebAssembly.
// Scripts use `next dev --webpack` / `next build --webpack` for that reason.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A second dev server for the same project (the live end-to-end test) needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
