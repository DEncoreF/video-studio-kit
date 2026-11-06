// Reading light and material off a reference (video-direction references/look-extraction.md): css-effects.mjs reads a page's
// effects exactly, finish.py recovers a glow's and a shadow's blur, offset and alpha from the screenshot of known CSS within the
// accuracy the reference promises, refuses a line that is not one blurred edge, and sees grain; library/finish-recipes.json is
// well formed and names registry blocks that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, fresh, join, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const PY = join(root, ".venv/bin/python"), FINISH = join(root, "scripts/measure/finish.py");
const noPy = existsSync(PY) ? false : "needs the toolkit's .venv with numpy (README: python3 -m venv .venv && .venv/bin/pip install numpy)";
const finish = (...a) => { const r = spawnSync(PY, [FINISH, ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
const page = (grain) => `<!doctype html><html><body style="margin:0;width:1280px;height:720px;position:relative;font:16px sans-serif">
<div style="position:absolute;left:0;top:0;width:640px;height:720px;background:#0b0d18"></div>
<div id="glow" style="position:absolute;left:220px;top:260px;width:200px;height:200px;background:#fff;box-shadow:0 0 40px 0 #4f8cff"></div>
<div style="position:absolute;left:640px;top:0;width:640px;height:720px;background:#eef0f6"></div>
<div id="card" style="position:absolute;left:860px;top:200px;width:200px;height:200px;background:#fff;box-shadow:0 24px 30px rgba(0,0,0,.4)"></div>
<div class="glass" style="position:absolute;left:700px;top:560px;width:300px;height:100px;background:rgba(255,255,255,.35);backdrop-filter:blur(20px)"></div>
${grain ? `<style>.grain{position:absolute;inset:0;opacity:.06;background-image:${GRAIN}}</style><div class="grain"></div>` : ""}</body></html>`;

test("css-effects reads a page's shadows and backdrop blur exactly; finish.py gets the glow and the shadow back from its screenshot", { skip: noPy }, () => {
  const d = fresh("finish");
  writeFileSync(join(d, "page.html"), page(false));
  const r = node("scripts/measure/css-effects.mjs", [join(d, "page.html"), "--width", "1280", "--height", "720", "--wait", "200", "--shot", join(d, "shot.png"), "--json", join(d, "fx.json")]);
  assert.equal(r.code, 0, r.out);
  const fx = JSON.parse(readFileSync(join(d, "fx.json"), "utf8")).effects, has = (p, v) => fx.some((g) => g.prop === p && g.value === v);
  assert.ok(has("box-shadow", "rgb(79, 140, 255) 0px 0px 40px 0px"), JSON.stringify(fx));
  assert.ok(has("box-shadow", "rgba(0, 0, 0, 0.4) 0px 24px 30px 0px"));
  assert.ok(has("backdrop-filter", "blur(20px)"));

  const shot = join(d, "shot.png");
  const glow = finish(shot, "glow", "--line", "420,360,600,360");
  assert.ok(glow.ok, JSON.stringify(glow));
  assert.ok(Math.abs(glow.css_blur_px - 40) <= 40 * 0.2, `glow blur ${glow.css_blur_px} vs 40`);
  const sh = finish(shot, "shadow", "--line", "960,400,960,520");
  assert.ok(sh.ok, JSON.stringify(sh));
  assert.ok(Math.abs(sh.css_blur_px - 30) <= 30 * 0.15, `shadow blur ${sh.css_blur_px} vs 30`);
  assert.ok(Math.abs(sh.edge_offset_px - 24) <= 4, `offset ${sh.edge_offset_px} vs 24`);
  assert.ok(Math.abs(sh.alpha - 0.4) <= 0.03, `alpha ${sh.alpha} vs .4`);
  assert.equal(sh.tint, "neutral");

  // across the whole glowing box and out the other side: two edges, not one
  const across = finish(shot, "glow", "--line", "150,360,500,360");
  assert.equal(across.ok, false, JSON.stringify(across));
});

test("finish.py frame: a 6 % grain overlay shows as grain where the plain page has none", { skip: noPy }, () => {
  const d = fresh("finish-grain");
  for (const [name, g] of [["plain", false], ["grain", true]]) {
    writeFileSync(join(d, `${name}.html`), page(g));
    const r = node("scripts/measure/css-effects.mjs", [join(d, `${name}.html`), "--width", "1280", "--height", "720", "--wait", "200", "--shot", join(d, `${name}.png`)]);
    assert.equal(r.code, 0, r.out);
  }
  const plain = finish(join(d, "plain.png"), "frame"), grain = finish(join(d, "grain.png"), "frame");
  assert.ok(plain.grain_std < 0.2, JSON.stringify(plain));
  assert.ok(grain.grain_std > plain.grain_std + 0.5, `grain ${grain.grain_std} vs plain ${plain.grain_std}`);
});

test("finish-recipes.json: unique ids, known kinds and statuses, a source behind every measured or approved recipe, registry blocks that exist", () => {
  const { recipes } = JSON.parse(readFileSync(join(root, "library/finish-recipes.json"), "utf8"));
  const ids = recipes.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of recipes) {
    assert.ok(["glow", "shadow", "glass", "grain", "edge"].includes(r.kind), r.id);
    assert.ok(["approved", "measured", "untested"].includes(r.status), r.id);
    assert.ok(r.zh && r.en && r.look && (r.how?.css || r.how?.registry?.length), r.id);
    if (r.status !== "untested") assert.ok(r.source?.length && r.numbers, `${r.id}: ${r.status} needs source and numbers`);
  }
  const cat = spawnSync(join(root, "node_modules/.bin/hyperframes"), ["catalog", "--json"], { encoding: "utf8" });
  const items = JSON.parse(cat.stdout), names = new Set((Array.isArray(items) ? items : items.items).map((i) => i.name));
  for (const r of recipes) for (const b of r.how.registry ?? []) assert.ok(names.has(b), `${r.id}: no registry block ${b}`);
});
