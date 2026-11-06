// scripts/measure/layout.mjs: placement read from the composition (an earlier film 2026-10-31, beat 03 — a name 66 px off its
// machine and a pair 40 px right of centre; user: 「注意每顆鏡頭的物件、文字、的位置是否合理」).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fresh, join, readFileSync, root, writeFileSync } from "./helpers.mjs";

const page = (body) => `<!doctype html><html><head><style>*{margin:0}body{width:1920px;height:1080px;position:relative;background:#eee}
.box{position:absolute;width:500px;height:600px;top:380px;background:#999}.lab{position:absolute;top:200px;width:400px;text-align:center;font:700 60px/1 sans-serif}
.ch{display:inline-block}</style></head><body><div data-composition-id="t" data-duration="1">${body}</div>
<script>window.__timelines={t:{seek(){},duration(){return 1}}};</script></body></html>`;
const run = (dir) => { const out = join(dir, "ly.json"); const r = spawnSync(process.execPath, [join(root, "scripts/measure/layout.mjs"), dir, "--json", out, "--step", "0.5"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(readFileSync(out, "utf8")).findings; };

test("a pair off the centre line and a label off its subject fail", () => {
  const dir = fresh("layout-bad");
  // boxes centred at 580 and 1420 (midpoint 1000), the left name centred at 646
  writeFileSync(join(dir, "index.html"), page(`<div class="box" style="left:330px"></div><div class="box" style="left:1170px"></div>
<div class="lab" style="left:446px"><span class="ch">教</span><span class="ch">學</span></div>`));
  const F = run(dir);
  assert.deepEqual(F.map((f) => f.kind).sort(), ["asymmetric", "label-off"]);
  assert.equal(F.find((f) => f.kind === "asymmetric").off, 40);
  assert.equal(F.find((f) => f.kind === "label-off").off, 66);
});

test("a mirrored pair with centred names passes; a subtree marked data-layout-free is skipped", () => {
  const dir = fresh("layout-good");
  writeFileSync(join(dir, "index.html"), page(`<div class="box" style="left:290px"></div><div class="box" style="left:1130px"></div>
<div class="lab" style="left:340px">資料</div><div class="lab" style="left:1180px">流程</div>`));
  assert.deepEqual(run(dir), []);
  writeFileSync(join(dir, "index.html"), page(`<div data-layout-free><div class="box" style="left:330px"></div><div class="box" style="left:1170px"></div></div>`));
  assert.deepEqual(run(dir), []);
});

test("words overlapping words and a row of cells at three sizes fail; the same row evened out passes", () => {
  const dir = fresh("layout-overlap-row");
  const row = (ws) => { let x = 300; return ws.map((w) => { const h = `<div class="cell" style="position:absolute;top:700px;left:${x}px;width:${w}px;height:200px;background:#fff"></div>`; x += w + 20; return h; }).join(""); };
  writeFileSync(join(dir, "index.html"), page(`<div class="lab" style="left:760px;top:300px">產品介紹</div><div class="lab" style="left:760px;top:340px">流程管理</div>${row([254, 254, 240, 240])}`));
  const F = run(dir);
  assert.deepEqual(F.map((f) => f.kind).sort(), ["text-overlap", "uneven-row"]);
  writeFileSync(join(dir, "index.html"), page(`<div class="lab" style="left:760px;top:300px">產品介紹</div><div class="lab" style="left:760px;top:400px">流程管理</div>${row([240, 240, 240, 240])}`));
  assert.deepEqual(run(dir), []);
});

test("a unicode-range fill cut from a variable font fails; a static fill passes", async () => {
  const { copyFileSync } = await import("node:fs");
  const dir = fresh("layout-fill-variable");
  copyFileSync(join(root, "brand-kits/_fonts/NotoSansTC-VF.ttf"), join(dir, "vf.ttf"));
  copyFileSync(join(root, "brand-kits/_fonts/InstrumentSerif-Regular.ttf"), join(dir, "st.ttf"));
  const face = (f) => page(`<style>@font-face{font-family:Fill;src:url("${f}");unicode-range:U+6587}</style><div class="lab" style="left:760px;font-family:sans-serif,Fill">文件</div>`);
  writeFileSync(join(dir, "index.html"), face("vf.ttf"));
  assert.deepEqual(run(dir).map((f) => f.kind), ["fill-variable"]);
  writeFileSync(join(dir, "index.html"), face("st.ttf"));
  assert.deepEqual(run(dir), []);
});
