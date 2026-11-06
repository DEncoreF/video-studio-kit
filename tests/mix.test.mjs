// pipelines/mix: a film's sections.json + cue sheet -> edit.py's spec. One film's own score.sh / score.mjs / measure.py were
// moved here (2026-11-03) and reproduce its mix bit for bit; this pins the parts a cue sheet relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, join, mkdirSync, node, readFileSync, writeFileSync } from "./helpers.mjs";

test("mix/score: bar-grid segments, a stop-down before each hero, kit takes on their sync point, swaps, pans, layers and trims", () => {
  const dir = fresh("mix/videos/p/tests/_m");
  mkdirSync(join(dir, "build"), { recursive: true }); mkdirSync(join(dir, "assets/sfx/kit"), { recursive: true });
  const w = (p, j) => writeFileSync(join(dir, p), typeof j === "string" ? j : JSON.stringify(j));
  w("build/sections.json", { bpm: 120, beatsPerBar: 4, offset: 0, total: 10, music: { src: "assets/music/score.m4a" },
    track: { file: "x.mp3", bpm: 120, firstDownbeat: 0.5 }, map: [{ bar: 0, from: 2, bars: 2 }, { bar: 2, from: 0, bars: 3, xin: 0.2 }],
    heroes: [6], mix: { bedSteps: [[4, 12, 0.5]] } });
  w("build/events.json", { events: [{ t: 1, dur: 0.3, end: 1.3, kind: "tween", props: ["y"], targets: [{ id: "card", classes: [] }] },
    { t: 2, dur: 0.5, end: 2.5, kind: "tween", props: ["x"], targets: [{ id: "chip", classes: [] }] }] });
  w("assets/sfx/kit/kit.lock.json", { roles: {
    land: { align: "onset", offset_ms: -10, bed_db: 7, takes: [{ file: "land_1.wav", onset_s: 0.005 }, { file: "land_2.wav", onset_s: 0.007 }] },
    swipe: { align: "peak", offset_ms: 0, bed_db: 4, takes: [{ file: "swipe_1.wav", peak_s: 0.12 }] } } });
  w("build/levels.json", { "../assets/sfx/kit44/land_1.wav": -10, "../assets/sfx/lib/thud.wav": -16 });
  w("build/trim.json", { "card#0": 0.5 });
  w("build/cues.mjs", `export default ({ sheet }) => {
  const S = sheet(import.meta.url, { role: { impact: "land", swipe: "swipe" }, moves: ["swipe"], swap: { swipe: ["lib/glide-1", "lib/glide-2"] },
    keepKit: ["kept"], layers: { land: [["lib/thud", -6, "onset"]] } });
  const { ev, hit } = S;
  return S.done([hit(ev("card", "y").end, "impact", "primary", "card", { pan: 0.4 }), hit(ev("card", "y").end + 2, "impact", "primary", "card"),
    hit(ev("chip", "x").t, "swipe", "texture", "chip", { pan_from: -0.2, pan_to: 0.2 }), hit(5, "swipe", "texture", "chip"), hit(7, "swipe", "texture", "kept")]);
};\n`);
  const r = node("pipelines/mix/score.mjs", [dir]); assert.equal(r.code, 0, r.out);
  const J = JSON.parse(readFileSync(join(dir, "build/score.json"), "utf8"));
  assert.deepEqual(J.segments, [{ at: 0, from: 4.5, dur: 4 }, { at: 4, from: 0.5, dur: 6.3, xin: 0.2 }], "the last segment runs to the end + 0.3 s");
  assert.deepEqual(J.music_env.filter(([t]) => t > 5 && t < 6.5), [[5.55, 0.5], [5.6, 0.175], [5.98, 0.175], [6.01, 0.5]], "stop-down times the bed step");
  const [a, b] = J.sfx.filter((c) => c.ev === "card" && !c.of);
  assert.deepEqual([a.t, a.file, a.gain, a.key, a.bed], [1.285, "../assets/sfx/kit44/land_1.wav", 0.4, "card#0", 7], "onset on end − 10 ms, trimmed");
  assert.equal(a.pan, undefined, "a landing stays centred");
  assert.deepEqual([b.file, b.key, b.gain], ["../assets/sfx/kit44/land_2.wav", "card#1", 0.8], "takes rotate, the trim is per occurrence");
  const thud = J.sfx.find((c) => c.of === "card#0");
  assert.deepEqual([thud.file, thud.t, thud.key], ["../assets/sfx/lib/thud.wav", 1.285, "card#0~lib/thud"]);
  assert.ok(Math.abs(thud.gain - 0.4 * 10 ** ((-10 - -16 - 6) / 20)) < 1e-3, "a layer sits its dB under the sound, from the files' levels");
  const sw = J.sfx.filter((c) => c.tier === "texture");
  assert.deepEqual(sw.map((c) => c.file), ["../assets/sfx/lib/glide-1.wav", "../assets/sfx/lib/glide-2.wav", "../assets/sfx/kit44/swipe_1.wav"], "swapped roles rotate their recordings; keepKit stays the kit");
  assert.deepEqual([sw[0].pan_from, sw[0].pan_to, sw[0].align, sw[0].bed], [-0.2, 0.2, "peak", 4], "a move keeps its pan and the role's bed");
  assert.equal(sw[2].t, 6.88, "a kit whoosh peaks on t");
});
