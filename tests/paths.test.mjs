// Personal layer and path split: tool files stay with the tool; taste, references, inbox and
// personal styles live in the profile; workspace and brand kits resolve on their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const resolved = (env, cwd = root) => {
  const code = 'import("./scripts/lib/paths.mjs").then((m) => console.log(JSON.stringify({ ...m.paths, ids: m.recipeIds(), collage: m.recipePath("collage"), mine: m.recipePath("my-zine"), cat: m.styleCatalog().styles.filter((s) => s.personal).map((s) => s.id) })))';
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code.replace("./scripts", join(root, "scripts"))], { cwd, encoding: "utf8", env: { ...process.env, VSO_WORKSPACE: "", VSO_BRAND_KITS: "", ...env } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test("profile, workspace and brand kits resolve from env, then the profile's config.json, then defaults", () => {
  const d = fresh("paths-resolve"), prof = join(d, "me"), ws = join(d, "work"), kits = join(d, "kits");
  mkdirSync(join(ws, "videos"), { recursive: true });
  mkdirSync(kits, { recursive: true });
  let p = resolved({ VSO_PROFILE: prof });
  assert.equal(p.PROFILE, prof);
  assert.equal(p.TOOL, root.replace(/\/$/, ""));
  assert.equal(p.WORKSPACE, root.replace(/\/$/, ""), "no config and no videos/ in cwd → the tool folder");
  assert.equal(p.REFS_LOG, join(prof, "references-log.jsonl"));
  p = resolved({ VSO_PROFILE: prof }, ws);
  assert.equal(p.WORKSPACE, ws, "a folder with videos/ is the workspace");
  mkdirSync(prof, { recursive: true });
  writeFileSync(join(prof, "config.json"), JSON.stringify({ workspace: ws, brand_kits: kits }));
  p = resolved({ VSO_PROFILE: prof });
  assert.equal(p.WORKSPACE, ws);
  assert.equal(p.KITS, kits);
  p = resolved({ VSO_PROFILE: prof, VSO_BRAND_KITS: join(root, "brand-kits") });
  assert.equal(p.KITS, join(root, "brand-kits"), "env beats config");
});

test("personal styles are found first and merged into the gallery catalog", () => {
  const prof = join(fresh("paths-styles"), "me");
  mkdirSync(join(prof, "styles/recipes"), { recursive: true });
  writeFileSync(join(prof, "styles/recipes/my-zine.md"), "---\nstatus: radar\ntags: [社群]\n---\n## 方向\n手工影印小誌\n");
  writeFileSync(join(prof, "styles/recipes/collage.md"), "---\nstatus: trial\n---\n## 方向\n我的拼貼版本\n");
  writeFileSync(join(prof, "styles/catalog.json"), JSON.stringify({ styles: [{ id: "my-zine", zh: "影印小誌", group: "E" }] }));
  const p = resolved({ VSO_PROFILE: prof });
  assert.equal(p.mine, join(prof, "styles/recipes/my-zine.md"));
  assert.equal(p.collage, join(prof, "styles/recipes/collage.md"), "same id: personal version wins");
  assert.ok(p.ids.includes("my-zine") && p.ids.includes("bauhaus"));
  assert.deepEqual(p.cat, ["my-zine"]);
});

test("references and the inbox live in the profile, not in the tool's library/", () => {
  const d = fresh("paths-refs"), prof = join(d, "me"), v = join(d, "videos/demo");
  mkdirSync(v, { recursive: true });
  const env = { VSO_PROFILE: prof };
  let r = node("scripts/profile.mjs", ["init", "--name", "測試"], env);
  assert.equal(r.code, 0, r.out);
  const toolLog = join(root, "library/references-log.jsonl"), before = existsSync(toolLog) ? readFileSync(toolLog, "utf8") : null;
  writeFileSync(join(prof, "inbox/shot.png"), "x");
  assert.match(node("scripts/refs.mjs", ["inbox"], env).out, /shot\.png/);
  r = node("scripts/refs.mjs", ["add", v, "--file", join(prof, "inbox/shot.png"), "--title", "使用者截圖", "--why", "膠帶角度", "--by", "user"], env);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(prof, "references-log.jsonl"), "utf8"), /使用者截圖/);
  assert.match(readFileSync(join(v, "references.md"), "utf8"), /使用者提供/);
  assert.match(node("scripts/refs.mjs", ["inbox"], env).out, /nothing new/);
  assert.equal(existsSync(toolLog) ? readFileSync(toolLog, "utf8") : null, before, "the tool's library/ is untouched");
});

test("profile init never overwrites an existing taste file", () => {
  const prof = join(fresh("paths-init"), "me"), env = { VSO_PROFILE: prof };
  node("scripts/profile.mjs", ["init"], env);
  writeFileSync(join(prof, "taste.md"), "# 我的品味\n- 喜歡：剪紙拼貼\n");
  const r = node("scripts/profile.mjs", ["init", "--name", "再一次"], env);
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(prof, "taste.md"), "utf8"), /剪紙拼貼/);
  assert.equal(JSON.parse(readFileSync(join(prof, "config.json"), "utf8")).name, "再一次");
  assert.ok(existsSync(join(prof, "assets/library.json")), "personal asset library is ready");
});

test("styles belong to a presentation effect, palettes are separate, and a personal catalog can extend both", () => {
  const prof = join(fresh("paths-families"), "me");
  mkdirSync(join(prof, "styles"), { recursive: true });
  writeFileSync(join(prof, "styles/catalog.json"), JSON.stringify({ families: { "kinetic-type": { textEffects: ["my-move"] }, "my-effect": { zh: "我的效果", define: { 構圖: "x" } } },
    styles: [{ id: "my-zine", zh: "影印小誌", family: "print-collage", preview: { bg: "#fff", fg: "#000", accents: ["#f00"] } }] }));
  writeFileSync(join(prof, "styles/palettes.json"), JSON.stringify({ palettes: [{ id: "my-zine", zh: "我的色票", colors: { bg: "#fff", fg: "#000", accents: ["#f00"] }, from: ["my-zine"] }] }));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `import { styleCatalog, paletteList } from ${JSON.stringify(join(root, "scripts/lib/paths.mjs"))};
    const c = styleCatalog(), p = paletteList();
    console.log(JSON.stringify({ fams: Object.keys(c.families).length, kt: c.families["kinetic-type"].textEffects, mine: c.families["my-effect"].zh,
      orphans: c.styles.filter((s) => !c.families[s.family]).map((s) => s.id), pal: p.length, mypal: p.find((x) => x.id === "my-zine")?.personal })); `], { env: { ...process.env, VSO_PROFILE: prof }, encoding: "utf8" });
  const o = JSON.parse(r.stdout);
  assert.equal(o.fams, 22, "21 built-in + 1 personal");
  assert.ok(o.kt.includes("headline-slam") && o.kt.at(-1) === "my-move", "personal textEffects are appended");
  assert.equal(o.mine, "我的效果");
  assert.deepEqual(o.orphans, [], "every style names an existing presentation effect");
  assert.ok(o.pal >= 41 && o.mypal === true);
});

test("a project folder holds films and tests: ids are paths, refs carry the project, the library falls back to the project's", () => {
  const d = fresh("paths-project"), ws = join(d, "work"), prof = join(d, "me"), P = join(ws, "videos/demo");
  for (const f of ["films/focus", "films/steps/assets-library", "tests/_morph", "assets-library"]) mkdirSync(join(P, f), { recursive: true });
  mkdirSync(join(ws, "videos/solo"), { recursive: true });
  writeFileSync(join(P, "PROJECT.md"), "# demo\n");
  const code = `const m = await import(${JSON.stringify(join(root, "scripts/lib/paths.mjs"))}), l = await import(${JSON.stringify(join(root, "scripts/lib/library.mjs"))});
    const P = ${JSON.stringify(P)}, r = await import(${JSON.stringify(join(root, "scripts/lib/refs.mjs"))});
    const e = r.addRef({ url: "https://example.com/a", title: "a", why: "w" }, P + "/films/focus").entry;
    console.log(JSON.stringify({ id: m.filmId(P + "/films/focus"), proj: m.projectOf(P + "/films/focus"), solo: m.projectOf(${JSON.stringify(join(ws, "videos/solo"))}),
      lib: m.libraryFor(P + "/films/focus"), own: m.libraryFor(P + "/films/steps"), names: l.videoNames(), e }));`;
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ws, encoding: "utf8", env: { ...process.env, VSO_WORKSPACE: ws, VSO_PROFILE: prof, VSO_LINK_CHECK: "off" } });
  assert.equal(out.status, 0, out.stderr);
  const j = JSON.parse(out.stdout);
  assert.equal(j.id, "demo/films/focus");
  assert.equal(j.proj, "demo");
  assert.equal(j.solo, "", "a bare film folder is in no project");
  assert.equal(j.lib, join(P, "assets-library"), "no own library → the project's");
  assert.equal(j.own, join(P, "films/steps/assets-library"));
  assert.deepEqual(j.names, ["demo/films/focus", "demo/films/steps", "demo/tests/_morph", "solo"]);
  assert.equal(j.e.video, "demo/films/focus");
  assert.equal(j.e.project, "demo");
  assert.ok(existsSync(join(P, "films/focus/references.md")));
});
