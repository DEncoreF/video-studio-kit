// scripts/lib/motion.mjs energy() and slideRisk(), the review pack's energy curve and slideshow risk (video-draft-review gate.md
// §1; research/ai-animation-cases-A.md, -B.md: a hook in 3 s, the densest stretch at 30–60 %, the biggest peak at 75–90 %, never two
// bars without something new; huashu's deliver.py and OpenMontage's slideshow risk). Unit tests on synthetic motion curves, and
// one film through review-pack: a film that spends itself in its first third fails energy-sag (film E drafts 28 and 35).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { ENERGY, SLIDE, energy, slideRisk } from "../scripts/lib/motion.mjs";
import { existsSync, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const FPS = 60, req = createRequire(import.meta.url), FF = req(join(root, "node_modules/ffmpeg-static"));
/** A motion curve: a slow drift (0.3) with a burst (a 0.2 s rise to `h`) at each time in `at`, over T seconds. */
function curve(T, at, h = 6, base = 0.3) {
  const v = Array.from({ length: Math.round(T * FPS) }, () => base); v[0] = 0;
  for (const t of at) for (let k = 0; k < 12; k++) { const i = Math.round(t * FPS) + k; if (i < v.length) v[i] = Math.max(v[i], h * Math.sin((Math.PI * (k + 1)) / 13)); }
  return v;
}
const every = (a, b, step) => { const o = []; for (let t = a; t < b - 1e-9; t += step) o.push(+t.toFixed(3)); return o; };

test("energy: a film spent in its first third fails the middle (sag); one that keeps moving through the middle passes", () => {
  const front = energy(curve(30, every(1, 10, 0.5)), FPS, { bpm: 120, perBar: 4 });
  assert.equal(front.checks.sag, false, JSON.stringify(front.middle));
  assert.ok(front.middle.active < ENERGY.sag);
  const spread = energy(curve(30, every(1, 29, 0.5)), FPS, { bpm: 120, perBar: 4 });
  assert.equal(spread.checks.sag, true, JSON.stringify(spread.middle));
  assert.equal(spread.checks.gap, true);
});

test("energy: the hook comes by 3 s; the densest stretch at 30–60 % and the biggest peak at 75–90 % are located", () => {
  assert.equal(energy(curve(30, every(1, 29, 1)), FPS).checks.hook, true);
  const late = energy(curve(30, every(4.5, 29, 1)), FPS);
  assert.equal(late.checks.hook, false); assert.ok(Math.abs(late.hook - 4.6) < 0.15, `the burst's peak: ${late.hook}`);
  // bursts everywhere, four times as dense in 10–16 s (33–53 %), and one huge burst at 24 s (80 %)
  const v = curve(30, [...every(1, 29, 1), ...every(10.1, 16, 0.25)]);
  for (let k = 0; k < 30; k++) v[24 * FPS + k] = 18;
  const E = energy(v, FPS);
  assert.equal(E.checks.dense, true, JSON.stringify(E.dense)); assert.equal(E.checks.peak, true, JSON.stringify(E.peak));
  const early = energy(curve(30, [...every(1, 29, 1), ...every(1.25, 5, 0.5)]), FPS);
  assert.equal(early.checks.dense, false); assert.equal(early.checks.peak, false);
});

test("energy: more than two bars without a new event is a gap; the end card after the last event is not; no BPM, no gap check; a short clip is not judged", () => {
  const E = energy(curve(30, [...every(1, 10, 1), ...every(15.5, 25, 1)]), FPS, { bpm: 120, perBar: 4 });   // nothing new from 9 to 15.5 s; 24–30 s is the end card
  assert.equal(E.gaps.length, 1, JSON.stringify(E.gaps)); assert.ok(Math.abs(E.gaps[0].t0 - 9.1) < 0.15); assert.ok(E.gaps[0].bars > 3);
  assert.equal(energy(curve(30, every(1, 29, 1.9)), FPS, { bpm: 120, perBar: 4 }).gaps.length, 0, "1.9 s apart: under a bar");
  assert.equal(energy(curve(30, every(1, 10, 1)), FPS).checks.gap, null);
  const short = energy(curve(6, [4.5]), FPS, { bpm: 120 });
  assert.equal(short.arc, false); assert.ok(Object.values(short.checks).every((c) => c !== false));
});

test("slideRisk: no fast motion, blank stretches mid-film and the same layout beat after beat add up; violet is reported, not scored", () => {
  const calm = curve(30, every(1, 29, 2), 3), busy = curve(30, every(1, 29, 0.5), 12);
  const plain = Array.from({ length: 30 * SLIDE.rate }, () => ({ range: 120, violet: 0 }));
  const lay = (sames) => [{ same: null }, ...sames.map((same) => ({ same }))];
  assert.equal(slideRisk(busy, FPS, plain, lay([0.2, 0.3, 0.1])).score, 0);
  const still = slideRisk(calm, FPS, plain, lay([0.2, 0.3, 0.1]));
  assert.equal(still.parts.motion, 1); assert.equal(still.score, 100 * SLIDE.weights.motion);
  assert.ok(still.score >= SLIDE.warn && still.score < SLIDE.fail, "no fast motion alone warns");
  const blanks = plain.map((s, i) => ((i >= 200 && i < 210) || (i >= 400 && i < 420) || (i >= 5 && i < 15) ? { range: 2, violet: 0 } : s));   // 10–10.5 s, 20–21 s; 0.25–0.75 s is the opening
  const bad = slideRisk(calm, FPS, blanks, lay([0.7, 0.8, 0.6]));
  assert.deepEqual(bad.blanks.map((b) => b.t0), [10, 20]); assert.equal(bad.parts.repeat, 1);
  assert.equal(bad.score, 100); assert.ok(bad.score >= SLIDE.fail);
  const violet = slideRisk(busy, FPS, plain.map((s, i) => (i % 2 ? { ...s, violet: 0.8 } : s)), []);
  assert.equal(violet.violet, 0.5); assert.equal(violet.score, 0, "violet is not in the score");
});

test("review-pack: a film that spends itself in the first third fails energy-sag and writes energy.txt and slide.txt; a test clip is not measured", () => {
  const make = (dir, tests) => {
    mkdirSync(join(dir, "direction"), { recursive: true }); mkdirSync(join(dir, "renders")); mkdirSync(join(dir, "build"));
    writeFileSync(join(dir, "build/sections.json"), JSON.stringify({ bpm: 120, offset: 0, beatsPerBar: 4 }));
    const read = (t0, t1, what) => ({ t0, t1, what, kind: "visual", important: true, lead: "方塊" });
    writeFileSync(join(dir, "direction/script.json"), JSON.stringify({ message: "測試。", total: 15, beats: [
      { id: "01", t0: 0, t1: 5, verb: "跳", big: "跳", proof: "情境示意", reads: [read(0.5, 4.5, "方塊在跳")] },
      { id: "02", t0: 5, t1: 15, verb: "停", big: "停", proof: "情境示意", reads: [read(5.2, 14, "方塊停著")] }],
      seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 5, kind: "seam", device: "停" }, { id: "close", t: 15, kind: "close", device: "淡出" }] }));
    if (!tests) { writeFileSync(join(dir, "direction/rulers.json"), JSON.stringify({ rulers: [{ id: "r", title: "尺", file: "renders/draft-1.mp4", moments: [{ t: 1, what: "主角拍" }] }] })); }
    const mp4 = join(dir, "renders/draft-1.mp4");
    // jumps back and forth for 5 s, then drifts 3 px a second to the end
    execFileSync(FF, ["-v", "error", "-y", "-filter_complex", "color=c=0x303030:s=320x180:r=60:d=15[bg];color=c=white:s=80x80:r=60:d=15[b];" +
      "[bg][b]overlay=x='if(lt(t,5),20+150*abs(sin(3.1416*t)),20+3*(t-5))':y=50:eval=frame:format=rgb,format=yuv420p,fade=in:st=0:d=0.3,fade=out:st=14.4:d=0.6[v]",
      "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", mp4]);
    return { dir, mp4, out: join(dir, "review") };
  };
  const f = make(fresh("energy-sag"), false);
  const r = node("scripts/review-pack.mjs", [f.dir, f.mp4, "--no-png"]); assert.equal(r.code, 0, r.out);
  const P = JSON.parse(readFileSync(join(f.out, "pack.json"), "utf8"));
  const sag = P.findings.find((q) => q.code === "energy-sag");
  assert.equal(sag?.level, "FAIL", JSON.stringify(P.findings.map((q) => [q.level, q.code])));
  assert.match(readFileSync(join(f.out, "energy.txt"), "utf8"), /FAIL energy-sag/);
  assert.match(readFileSync(join(f.out, "slide.txt"), "utf8"), /投影片風險 \d+/);
  assert.ok(P.energy && P.slide, "the curve and the risk are in pack.json");
  const t = make(fresh("rp/videos/p/tests/_energy"), true);
  assert.equal(node("scripts/review-pack.mjs", [t.dir, t.mp4, "--no-png"]).code, 0);
  assert.ok(!existsSync(join(t.out, "energy.txt")) && !JSON.parse(readFileSync(join(t.out, "pack.json"), "utf8")).findings.some((q) => /^(energy|slide)-/.test(q.code)));
});
