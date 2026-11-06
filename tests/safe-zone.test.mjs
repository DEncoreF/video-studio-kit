// scripts/measure/safe-zone.mjs: words and the logo against the safe boxes, read from the composition (an earlier film 2026-10-29,
// user: 「logo 在哪？主畫面要在哪？」). A tiny composition with a hand-written timeline (seek sets positions directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fresh, join, readFileSync, root, writeFileSync } from "./helpers.mjs";

const page = (body, seek) => `<!doctype html><html><head><style>*{margin:0}body{width:1920px;height:1080px;position:relative;background:#111}
.a{position:absolute;font:700 60px/1 sans-serif;color:#fff;white-space:nowrap}#fade{position:absolute;inset:0;background:#000;opacity:0}</style></head>
<body><div data-composition-id="t" data-duration="2">${body}<div id="fade"></div></div>
<script>window.__timelines={t:{seek(t){${seek}},duration(){return 2}}};</script></body></html>`;

const run = (dir) => { const out = join(dir, "sz.json"); const r = spawnSync(process.execPath, [join(root, "scripts/measure/safe-zone.mjs"), dir, "--json", out, "--step", "0.5"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(readFileSync(out, "utf8")).findings; };

test("text in the outer 5% fails, text outside title-safe warns, a bleed off the edge and text under an opaque cover are ignored", () => {
  const dir = fresh("safe-zone-text");
  writeFileSync(join(dir, "index.html"), page(`<div class="a" id="edge" style="left:40px;top:500px">貼邊</div>
<div class="a" id="title" style="left:120px;top:300px">字卡</div><div class="a" id="ok" style="left:400px;top:500px">安全</div>
<div class="a" id="bleed" style="left:1850px;top:700px">出血的字</div>
<div class="a" id="hidden" style="left:20px;top:900px">被蓋住</div><div style="position:absolute;left:0;top:880px;width:400px;height:120px;background:#222"></div>`, ""));
  const F = run(dir), k = (sel) => F.filter((f) => f.sel === sel).map((f) => f.kind);
  assert.deepEqual(k("#edge"), ["action"]);
  assert.deepEqual(k("#title"), ["title"]);
  assert.deepEqual(k("#ok"), []);
  assert.deepEqual(k("#bleed"), []);
  assert.deepEqual(k("#hidden"), []);
});

test("a logo that moves after it is fully in fails; one that stays put passes", () => {
  const dir = fresh("safe-zone-logo");
  writeFileSync(join(dir, "logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="36"><rect width="120" height="36" fill="#fff"/></svg>`);
  writeFileSync(join(dir, "index.html"), page(`<img id="logo" src="logo.svg" style="position:absolute;left:100px;top:60px;height:36px">`,
    `document.getElementById("logo").style.left = (t < 1 ? 100 : 140) + "px";`));
  assert.deepEqual(run(dir).map((f) => f.kind), ["logo-moved"]);
  writeFileSync(join(dir, "index.html"), page(`<img id="logo" src="logo.svg" style="position:absolute;left:100px;top:60px;height:36px">`, ""));
  assert.deepEqual(run(dir), []);
});
