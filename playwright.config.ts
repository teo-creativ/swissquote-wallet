import { defineConfig } from "@playwright/test";

// E2E walk against a production build in mock mode. Uses the installed Chrome (channel "chrome"), no browser download.
// Build first: `npm run build`. `npm run test:e2e` builds and runs.
const PORT = 3100;
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { NEXT_PUBLIC_SQKEYS_MODE: "mock" },
  },
});
