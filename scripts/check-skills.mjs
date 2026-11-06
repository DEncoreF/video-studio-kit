#!/usr/bin/env node
// The toolkit's skills load only from here: sessions in a work folder (studio) add the toolkit with --add-dir (or
// /add-dir, or "add folder" in Claude Desktop), and Claude Code then loads <tool>/.claude/skills. A personal skill
// (~/.claude/skills/<name>) with the same name wins over the toolkit's, so none may exist.
//   node scripts/check-skills.mjs          remove personal links into the toolkit, report personal copies
//   node scripts/check-skills.mjs --check  report only (exit 1 when a personal skill shadows a toolkit skill)
import { existsSync, lstatSync, readdirSync, readlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const TOOL = resolve(dirname(new URL(import.meta.url).pathname), "..");
const OWN = join(TOOL, ".claude/skills"), HOME = join(homedir(), ".claude/skills");
const check = process.argv.includes("--check");
const ours = new Set(readdirSync(OWN).filter((n) => existsSync(join(OWN, n, "SKILL.md"))));
let bad = 0;
for (const name of existsSync(HOME) ? readdirSync(HOME) : []) {
  const link = join(HOME, name), st = lstatSync(link);
  const into = st.isSymbolicLink() && resolve(HOME, readlinkSync(link)).startsWith(OWN + "/");
  if (!ours.has(name) && !into) continue;
  if (into && !check) { unlinkSync(link); console.log(`- ${name}: removed the personal link (loads from the toolkit now)`); continue; }
  bad++;
  console.log(`✗ ${name}: ${link} ${into ? "links into the toolkit (run without --check to remove it)" : "is a personal copy that shadows the toolkit's; remove it (npx skills remove -g " + name + ")"}`);
}
console.log(bad ? `${bad} personal skill(s) shadow the toolkit` : `✓ no personal skill shadows the toolkit's ${ours.size} skills`);
console.log(`studio sessions: add ${TOOL} as a folder (--add-dir / /add-dir / Claude Desktop "add folder")`);
process.exitCode = bad ? 1 : 0;
