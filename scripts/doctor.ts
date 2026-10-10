// `npm run doctor`: checks that this machine matches the team setup. Exit 1 on errors, warnings never fail.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
let errors = 0, warns = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const warn = (m: string) => { warns++; console.log(`  WARN  ${m}`); };
const err = (m: string) => { errors++; console.log(`  FAIL  ${m}`); };
const sh = (c: string) => { try { return execSync(c, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };

console.log("SQ Keys doctor");
const major = Number(process.versions.node.split(".")[0]);
major >= 22 ? ok(`Node ${process.versions.node}`) : err(`Node ${process.versions.node}: need >= 22 (run: nvm use)`);
const branch = sh("git rev-parse --abbrev-ref HEAD");
branch ? ok(`git branch: ${branch}`) : warn("not a git repository");
if (branch === "main") warn("you are on main: work on your own branch (teo/ui, theotime/sq)");
if (sh("git ls-files | grep -E '(^|/)\\.env($|\\.local)' || true")) err("an .env file is tracked by git");

const projects = [".", "lawyer", "sq-mock", "exit"].filter((p) => existsSync(join(root, p, "package.json")));
for (const p of projects) {
  console.log(`\n[${p === "." ? "client (root)" : p}]`);
  const dir = join(root, p);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
  const loose = Object.entries(deps).filter(([, v]) => /^[\^~]/.test(v)).map(([k]) => k);
  loose.length ? err(`non-exact versions: ${loose.join(", ")} (use npm i --save-exact)`) : ok("all versions pinned");
  existsSync(join(dir, "package-lock.json")) ? ok("package-lock.json present (use `npm ci`)") : err("no package-lock.json");
  existsSync(join(dir, "node_modules")) ? ok("node_modules installed") : err("node_modules missing: run `npm ci`");
  const ex = join(dir, ".env.example"), env = join(dir, ".env.local");
  if (existsSync(ex)) {
    if (!existsSync(env)) warn(".env.local missing (cp .env.example .env.local, then npm run gen-secrets)");
    else {
      const have = new Map(readFileSync(env, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
      const want = readFileSync(ex, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => l.split("=")[0]);
      const missing = want.filter((k) => !have.get(k));
      missing.length ? warn(`empty or missing in .env.local: ${missing.join(", ")}`) : ok(".env.local complete");
    }
  }
}
console.log("");
const shared = sh("npx tsx scripts/sync-shared.ts --check 2>&1 || echo DIFF");
shared.includes("DIFF") || shared.includes("DIFFERS") ? err("shared copies differ from /shared: run npm run sync-shared") : ok("shared/ copies in sync");
console.log(`\n${errors ? "NOT READY" : "READY"}: ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
