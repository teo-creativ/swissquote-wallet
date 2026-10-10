// Build in mock mode with the public URLs the app needs, then run the Playwright walk. NEXT_PUBLIC_* is inlined at build time.
import { spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_PUBLIC_SQKEYS_MODE: "mock", NEXT_PUBLIC_LAWYER_URL: "https://lawyer.test" };
for (const cmd of ["npm run build", "npx playwright test"]) {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
