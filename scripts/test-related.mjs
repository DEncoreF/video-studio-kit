// test-related.mjs: run only the tests that touch the changed files (the whole suite takes ~6 minutes, so it was run by hand and
// sometimes not at all). A test is related when it names a changed file (its path or file name), names a script that imports
// a changed file, or is itself changed. Docs, skills' prose and data that no test reads run nothing.
//   node scripts/test-related.mjs [--staged | <file> ...] [--list]   (.githooks/pre-commit runs --staged; npm test runs everything)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
// not lib/paths.mjs: it writes VSO_WORKSPACE / VSO_BRAND_KITS into the environment, and the tests' children would inherit the
// toolkit's demo kits (brand-qa's Kestrel film found no Kestrel kit and failed, only when run from here)
const TOOL = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/$/, "");

const args = process.argv.slice(2), list = args.includes("--list");
const changed = args.includes("--staged")
  ? execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { cwd: TOOL, encoding: "utf8" }).split("\n").filter(Boolean)
  : args.filter((a) => !a.startsWith("--")).map((f) => relative(TOOL, join(process.cwd(), f)));
const code = changed.filter((f) => /\.(mjs|js|py|json|swift|sh)$/.test(f) && !f.startsWith("tests/.tmp/"));

const read = (f) => { try { return readFileSync(join(TOOL, f), "utf8"); } catch { return ""; } };
const files = (dir, re) => { const out = []; const walk = (d) => { for (const n of readdirSync(join(TOOL, d), { withFileTypes: true })) {
  if (n.name === "node_modules" || n.name.startsWith(".")) continue; const p = join(d, n.name);
  if (n.isDirectory()) walk(p); else if (re.test(n.name)) out.push(p); } }; if (existsSync(join(TOOL, dir))) walk(dir); return out; };
const tests = files("tests", /\.test\.mjs$/);
const sources = [...files("scripts", /\.(mjs|py)$/), ...files("pipelines", /\.(mjs|py)$/)];
const names = (f) => [f, basename(f)];
// a changed module also counts through every script that imports it (one level: lib → script → test)
const via = (f) => sources.filter((s) => s !== f && read(s).includes(basename(f)));
const pick = new Set(code.filter((f) => f.startsWith("tests/") && f.endsWith(".test.mjs")));
for (const f of code) for (const g of [f, ...via(f)]) for (const t of tests) if (names(g).some((n) => read(t).includes(n))) pick.add(t);
const run = [...pick].filter((t) => existsSync(join(TOOL, t))).sort();
if (list || !run.length) { console.log(run.length ? run.join("\n") : `test-related: ${code.length ? "沒有測試碰到改的檔" : "沒有改到程式"}，不跑`); process.exit(0); }
console.log(`test-related: ${run.length} 個測試檔（${code.length} 個改到的檔）`);
// one file at a time, one line each; a file that fails is run once more and called flaky if it then passes (a real failure fails twice)
// without the hook's GIT_* variables (GIT_INDEX_FILE, GIT_DIR…): a test that runs git in a temp copy would act on this repo
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const once = (t) => { const r = spawnSync(process.execPath, ["--test", "--test-reporter=dot", t], { cwd: TOOL, encoding: "utf8", env });
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() }; };
const failed = [];
for (const t of run) {
  const t0 = Date.now(); let r = once(t), note = "";
  if (!r.ok) { const again = once(t); if (again.ok) note = "（第一次失敗、重跑通過：偶發，記一下）"; else r = again; }
  console.log(`${r.ok ? "✓" : "✗"} ${t} ${((Date.now() - t0) / 1000).toFixed(0)} s${note}`);
  if (!r.ok) failed.push([t, r.out]);
}
for (const [t, out] of failed) console.log(`\n--- ${t}\n${out.split("\n").slice(-40).join("\n")}`);
if (failed.length) console.log(`\n✗ ${failed.length} 個測試檔沒過；修好再 commit（真的要先 commit：git commit --no-verify，並說明原因）`);
process.exit(failed.length ? 1 : 0);
