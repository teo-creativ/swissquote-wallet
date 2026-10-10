// Checks that a deployed URL serves the client routes (CLAUDE.md rule 9: check the production URL after every deploy).
// Usage: npm run check-routes -- https://sq-keys-iota.vercel.app
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const routes = ["/", "/login", "/verify", "/documents", "/lawyer", "/key", "/creating", "/home", "/send", "/security", "/recovery", "/legal/terms", "/dev/passkey", "/api/public-config", "/console"];

async function main() {
let bad = 0;
for (const r of routes) {
  const res = await fetch(base + r, { redirect: "manual" });
  const ok = res.status < 400;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${r}`);
}
if (bad > 0) {
  console.error(`check-routes: ${bad} route(s) failed on ${base}. The deployment is probably older than the code: run \`npx vercel --prod\`.`);
  process.exit(1);
}
console.log(`check-routes: all ${routes.length} routes served by ${base}`);
}

void main();
