// The motion pass (scripts/lib/motion-pass.mjs), part of the draft gate since 2026-11-05: an ease GSAP cannot read fails, the warnings
// and the exemplars come back in MOTION.md each version, --check verifies the answers, a candidate skips it, --link ties a preview to
// its reviews. Why: 「有跑 motion skill 嗎」, asked eight times in one session, each run finding real defects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync } from "node:fs";
import { existsSync, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const FF = createRequire(import.meta.url)("ffmpeg-static");
function clip(ease, { script = {}, extra = "" } = {}) {
  const dir = join(fresh("motion-pass"), "videos/p/tests/_m");
  mkdirSync(join(dir, "vendor"), { recursive: true }); mkdirSync(join(dir, "out")); mkdirSync(join(dir, "direction"));
  copyFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), join(dir, "vendor/gsap.min.js"));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><body><div id="root" data-composition-id="m" data-start="0" data-width="320" data-height="180" data-duration="3"><div id="b"></div></div>
<script src="vendor/gsap.min.js"></script><script>${extra}const tl = gsap.timeline({ paused: true }); tl.to("#b", { x: 100, duration: 0.7, ease: ${ease} }, 0.5); tl.set({}, {}, 3); window.__timelines = { m: tl };</script></body></html>`);
  writeFileSync(join(dir, "direction/script.json"), JSON.stringify({ beats: [{ id: "01", t0: 0, t1: 3, verb: "移", big: "移", proof: "示意", reads: [] }], seams: [], ...script }));
  const mp4 = join(dir, "out/clip.mp4");
  const r = spawnSync(FF, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=320x180:r=60:d=3", "-pix_fmt", "yuv420p", mp4]); assert.equal(r.status, 0, String(r.stderr));
  return { dir, mp4, out: join(dir, "review") };
}
const pack = (f) => node("scripts/review-pack.mjs", [f.dir, f.mp4, "--no-png", "--force"]);
const findings = (f) => JSON.parse(readFileSync(join(f.out, "pack.json"), "utf8")).findings;
const check = (f, ...more) => node("scripts/review-pack.mjs", ["--check", f.out, ...more]);
const answer = (f, a) => { const m = join(f.out, "MOTION.md"); let s = readFileSync(m, "utf8").replace(/^(\s*)留：\s*$/gm, "$1留：測試留著");
  for (const [k, v] of Object.entries(a)) s = s.replace(new RegExp(`^${k}：\\s*$`, "m"), `${k}：${v}`); writeFileSync(m, s); };
const GOOD = { 範例: "無：查過 camera 類，沒有適用的", 元件: "無：查了 camera follow", 最弱處: "2.1 秒拉遠那一下偏弱", 另一種表達: "改成穿過字的中間出來" };

test("an ease GSAP cannot read fails, in a test clip too, and only that kind; a real name or a function passes", { timeout: 120000 }, () => {
  let f = clip(`"cubic-bezier(.16,1,.3,1)"`); assert.equal(pack(f).code, 0);
  assert.ok(findings(f).some((q) => q.code === "ease-unknown" && q.level === "FAIL"), "a CSS cubic-bezier string");
  f = clip(`"nonsense.out"`); pack(f); assert.ok(findings(f).some((q) => q.code === "ease-unknown"), "a name that does not exist");
  f = clip(`"power3.out"`); pack(f); assert.ok(!findings(f).some((q) => q.code === "ease-unknown"), "a GSAP name");
  f = clip(`(x) => x`); pack(f); assert.ok(!findings(f).some((q) => q.code === "ease-unknown"), "a function");
});

test("a timeline that cannot be read fails, and an old events.json does not answer for it", { timeout: 200000 }, () => {
  const f = clip(`"power3.out"`); mkdirSync(f.out); writeFileSync(join(f.out, "events.json"), JSON.stringify({ events: [] }));
  writeFileSync(join(f.dir, "index.html"), readFileSync(join(f.dir, "index.html"), "utf8").replace("window.__timelines = { m: tl };", ""));
  pack(f);
  assert.ok(findings(f).some((q) => q.code === "motion-unread" && q.level === "FAIL"), JSON.stringify(findings(f).map((q) => q.code)));
});

test("RulerEase.bez is a cubic-bezier as a function of progress", () => {
  const g = {}; new Function("window", readFileSync(join(root, "library/motion/ruler-ease.js"), "utf8"))(g);
  const line = g.RulerEase.bez(0, 0, 1, 1), out = g.RulerEase.bez(0.16, 1, 0.3, 1);
  assert.ok(Math.abs(line(0.5) - 0.5) < 0.001); assert.equal(out(0), 0); assert.equal(out(1), 1); assert.ok(out(0.5) > 0.95, String(out(0.5)));
});

test("the library checks warn once each and come back in MOTION.md; a soft symmetric ease and a missing hero are named; what is normal in an excerpt is not asked", { timeout: 120000 }, () => {
  const f = clip(`"sine.inOut"`); pack(f);
  const codes = findings(f).map((q) => q.code);
  for (const c of ["ease-soft", "no-params", "no-beat", "no-ruler-ease"]) assert.ok(codes.includes(c), c);
  const md = readFileSync(join(f.out, "MOTION.md"), "utf8");
  assert.match(md, /<!-- warn:no-beat -->/); assert.match(md, /對稱軟緩動 1 個/); assert.match(md, /沒有標主角時刻/);
  assert.doesNotMatch(md, /<!-- warn:(hard-open|last-read-late|head-zone) -->/, "normal in an excerpt, or not about motion");
  // with the library used and a hero marked, these go quiet, and the hero's motion is compared with the rest
  const g = clip(`"power3.out"`, { script: { beats: [{ id: "01", t0: 0, t1: 3, hero: true, verb: "移", big: "移", proof: "示意", reads: [] }] }, extra: "/* Beat.make RulerEase. */" });
  writeFileSync(join(g.dir, "params.js"), "export const P = {};\n"); pack(g);
  const gc = findings(g).map((q) => q.code);
  for (const c of ["no-params", "no-beat", "no-ruler-ease"]) assert.ok(!gc.includes(c), c);
  assert.doesNotMatch(readFileSync(join(g.out, "MOTION.md"), "utf8"), /沒有標主角時刻/);
});

test("--check needs every answer: a warning left silent, a made-up exemplar or block, a weakest spot without a time, no alternative", { timeout: 300000 }, () => {
  const f = clip(`"power3.out"`); pack(f);
  let r = check(f); assert.notEqual(r.code, 0); assert.match(r.out, /提醒 `no-beat`/); assert.match(r.out, /「最弱處：」/); assert.ok(!existsSync(join(f.out, "PASS.json")));
  answer(f, { ...GOOD, 範例: "ui-00000000", 元件: "not-a-block", 最弱處: "有點弱，整體還好" , 另一種表達: "同上" });
  r = check(f); assert.notEqual(r.code, 0);
  for (const m of [/沒有這個範例 ui-00000000/, /登錄庫沒有/, /「最弱處：」/, /「另一種表達：」/]) assert.match(r.out, m);
  pack(f); answer(f, GOOD);
  r = check(f); assert.equal(r.code, 0, r.out);
  assert.match(r.out, /動態檢查：範例 無：查過 camera 類/); assert.match(r.out, /2\.1 秒拉遠/);
  const P = JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8")); assert.equal(P.mode, "measure"); assert.equal(P.motion.weakest, GOOD.最弱處);
  // a new pack keeps the old answers aside and asks again
  pack(f); assert.ok(existsSync(join(f.out, "MOTION.prev.md"))); assert.notEqual(check(f).code, 0);
});

test("--candidate skips the answers but only a test clip can use it; --link ties a preview to reviews that hold", { timeout: 300000 }, () => {
  const f = clip(`"power3.out"`); pack(f);
  const prev = join(f.dir, "previews-x.mp4");
  assert.equal(check(f, "--candidate").code, 0);
  assert.equal(JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8")).mode, "candidate");
  copyFileSync(f.mp4, prev);
  let r = node("scripts/review-pack.mjs", ["--link", prev, f.out]); assert.notEqual(r.code, 0, "a candidate's PASS is not a chosen version's"); assert.match(r.out, /候選/);
  answer(f, GOOD); assert.equal(check(f).code, 0);
  copyFileSync(f.mp4, prev);
  r = node("scripts/review-pack.mjs", ["--link", prev, f.out]); assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(`${prev}.pass.json`));
});
