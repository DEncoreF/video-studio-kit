// node scripts/rules.mjs [name]            print the table for library/rules/<name>.json (default motion)
// node scripts/rules.mjs --write | --check  regenerate (or verify) every block in the skills marked
//   <!-- rules:<name> --> … <!-- /rules:<name> -->; --check exits 1 when a block is out of date.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { table } from "./lib/rules.mjs";

const TOOL = decodeURIComponent(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2), write = args.includes("--write"), check = args.includes("--check");
const BLOCK = /(<!-- rules:([\w-]+) -->\n)[\s\S]*?(\n<!-- \/rules:\2 -->)/g;

/** Every SKILL.md and reference under .claude/skills that holds a rules block. */
function blockFiles() {
  const root = join(TOOL, ".claude/skills"), out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".md") && /<!-- rules:[\w-]+ -->/.test(readFileSync(p, "utf8"))) out.push(p); } };
  if (existsSync(root)) walk(root);
  return out;
}

if (!write && !check) { console.log(table(args.find((a) => !a.startsWith("--")) ?? "motion")); process.exit(0); }
let stale = 0;
for (const f of blockFiles()) {
  const s = readFileSync(f, "utf8"), next = s.replace(BLOCK, (_, open, name, close) => `${open}${table(name)}${close}`);
  if (next === s) continue;
  stale++;
  if (write) { writeFileSync(f, next); console.log(`updated ${f.slice(TOOL.length)}`); } else console.log(`out of date: ${f.slice(TOOL.length)}（node scripts/rules.mjs --write）`);
}
if (check && !stale) console.log("rules: every table matches library/rules");
process.exit(check && stale ? 1 : 0);
