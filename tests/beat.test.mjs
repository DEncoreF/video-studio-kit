// library/motion/beat.js: the film's one pulse (video-motion-craft references/reads-and-beat.md §9) — pure functions of t —
// and scripts/measure/beat-check.mjs reading a film's grid and flagging seams off the beat or off the bar line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const Beat = createRequire(import.meta.url)(join(root, "library/motion/beat.js"));
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

test("C's grid (120 BPM, first downbeat 0.03 s): position, numbers, bars", () => {
  const B = Beat.make(120, 0.03);
  near(B.beat, 0.5); near(B.barLen, 2);
  near(B.pos(0.03), 0); near(B.pos(1.03), 2); near(B.pos(0.28), 0.5);
  assert.equal(B.n(0.53), 1); assert.equal(B.n(0.529), 0); assert.equal(B.n(0), -1);
  assert.equal(B.bar(8.03), 4); assert.equal(B.bar(8.02), 3); near(B.barPos(9.03), 4.5);
  near(B.at(3), 1.53); near(B.at(2, "bar"), 4.03); near(B.at(1, "half"), 0.28);
});

test("snap and off: nearest beat, half and bar; + is late", () => {
  const B = Beat.make(120, 0.03);
  near(B.snap(8.15), 8.03); near(B.off(8.15), 0.12); near(B.off(7.95), -0.08);
  near(B.snap(8.15, "half"), 8.03); near(B.snap(8.2, "half"), 8.28);
  near(B.snap(9.2, "bar"), 10.03); near(B.off(9.0, "bar"), 0.97);
  assert.throws(() => B.snap(1, "phrase"), /unknown unit/);
});

test("pulse: 1 on the beat, decays, 0 before the first downbeat; the default grid is 120 BPM from 0", () => {
  const B = Beat.make(120, 0.03);
  near(B.pulse(0.53), 1); near(B.pulse(0.63, 10), Math.exp(-1)); assert.equal(B.pulse(0.01), 0);
  assert.ok(B.pulse(1.02) < B.pulse(1.04));
  near(Beat.beat, 0.5); near(Beat.offset, 0); near(Beat.make(90).beat, 60 / 90);
});

test("beat-check: reads the film's sections.json, flags a seam off the beat and a big change off the bar line", () => {
  const film = fresh("beat-check");
  mkdirSync(join(film, "build")); mkdirSync(join(film, "direction"));
  writeFileSync(join(film, "build/sections.json"), JSON.stringify({ bpm: 120, offset: 0.03, beatsPerBar: 4 }));
  const seams = (list) => writeFileSync(join(film, "direction/script.json"), JSON.stringify({ beats: [], seams: list }));
  seams([{ id: "open", t: 0.03, kind: "open" }, { id: "S1", t: 4.53, kind: "seam" }, { id: "S2", t: 8.04, kind: "seam", bar: true }]);
  let r = node("scripts/measure/beat-check.mjs", [film]);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /120 BPM, offset 0.03/); assert.match(r.out, /全部在拍上/);
  seams([{ id: "S1", t: 4.68, kind: "seam" }, { id: "S2", t: 9.03, kind: "seam", bar: true }, { id: "close", t: 60.53, kind: "close" }]);
  r = node("scripts/measure/beat-check.mjs", [film]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /△ +4\.68s.*S1.*離拍 \+9 格/);
  assert.match(r.out, /△ +9\.03s.*S2.*大變化不在小節線（-60 格）/);
  assert.match(r.out, /△ +60\.53s.*close.*大變化不在小節線/);
  assert.equal(node("scripts/measure/beat-check.mjs", [film, "--bpm", "60", "--offset", "0.68"]).code, 2);
  writeFileSync(join(film, "direction/script.json"), JSON.stringify({ seams: [], beats: [{ id: "02", t0: 12, t1: 16, reads: [
    { t0: 11.9, act: 13.35, t1: 13.5, kind: "motion", important: true, what: "拆" }, { t0: 13.53, t1: 16, kind: "text", what: "標籤", hit: true }, { t0: 12, t1: 14, kind: "text", important: true, what: "標題" }] }] }));
  r = node("scripts/measure/beat-check.mjs", [film]);
  assert.match(r.out, /2 hits/); assert.match(r.out, /△ +13\.35s  hit .*離拍 -11 格/); assert.match(r.out, /✓ +13\.53s  hit /);
  // --json: the same events, with signed offsets in seconds, for the review gate
  node("scripts/measure/beat-check.mjs", [film, "--json", join(film, "bc.json")]);
  const J = JSON.parse(readFileSync(join(film, "bc.json"), "utf8")), hit = J.events.find((e) => e.t === 13.35);
  assert.equal(J.bpm, 120); assert.equal(hit.type, "hit"); assert.equal(hit.source, "script"); assert.ok(Math.abs(hit.beatOff + 0.18) < 1e-6, String(hit.beatOff));
});
