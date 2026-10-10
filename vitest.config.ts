import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"], env: { NEXT_PUBLIC_LAWYER_URL: "https://lawyer.test" } } });
