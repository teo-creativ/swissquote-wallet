import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["shared/**/*.test.ts", "bitcoin/**/*.test.ts"], testTimeout: 60_000 } });
