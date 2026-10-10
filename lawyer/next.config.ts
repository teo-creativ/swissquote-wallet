import type { NextConfig } from "next";

// The lawyer portal is the P2 node: it loads the Node WASM build of DKLs23 on the server.
// The .wasm file must be traced into every serverless function that uses it.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@silencelaboratories/dkls-wasm-ll-node"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@silencelaboratories/dkls-wasm-ll-node/*.wasm"],
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};
export default nextConfig;
