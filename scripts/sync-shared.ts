// Copies /shared into each project (CDC annex G). `--check` fails if a copy differs.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, "shared");
const targets = ["lib/shared", "lawyer/src/shared", "sq-mock/src/shared", "exit/shared"];
const check = process.argv.includes("--check");

const list = (d: string): string[] =>
  !existsSync(d) ? [] : readdirSync(d).filter((f) => f !== ".gitkeep").flatMap((f) => (statSync(join(d, f)).isDirectory() ? list(join(d, f)).map((x) => join(f, x)) : [f]));

let bad = 0;
for (const t of targets) {
  const dest = join(root, t);
  if (!existsSync(join(root, t.split("/")[0]))) continue; // project not present yet
  if (check) {
    const a = list(src), b = list(dest);
    const same = a.length === b.length && a.every((f) => existsSync(join(dest, f)) && readFileSync(join(src, f)).equals(readFileSync(join(dest, f))));
    if (!same) { console.error(`DIFFERS: ${t}`); bad++; }
  } else {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log(`synced -> ${t}`);
  }
}
if (bad) process.exit(1);
