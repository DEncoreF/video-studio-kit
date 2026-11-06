// scripts/timeline-events.mjs: the film's own GSAP timeline as build/events.json (film time, durations, targets, data-sfx), so
// sound cues come from the picture (hand-typed sync points measured 8–11 frames off; research/ai-animation-cases-B.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync } from "node:fs";
import { fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

test("timeline-events: every tween and set in film time, nested offsets and time scales applied, with targets and data-sfx", () => {
  const dir = fresh("timeline-events/videos/p/films/e");
  mkdirSync(join(dir, "vendor"));
  copyFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), join(dir, "vendor/gsap.min.js"));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="UTF-8"></head><body>
<div id="root" data-composition-id="e" data-start="0" data-width="1920" data-height="1080" data-duration="6">
  <div id="card" class="card paper" data-sfx="paper-slide"></div><h1 id="title" class="giant">Sign</h1><i class="tick" data-sfx="tick"></i><i class="tick"></i>
</div>
<script src="vendor/gsap.min.js"></script>
<script>const tl = gsap.timeline({ paused: true });
tl.addLabel("open", 0).set("#title", { opacity: 0 }, 0).to("#card", { x: 200, duration: 0.8, ease: "power3.out" }, 0.5)
  .addLabel("hit", 2).to("#title", { opacity: 1, duration: 0.4, data: { sfx: "whoosh" } }, "hit");
const sub = gsap.timeline().to(".tick", { scale: 1.2, duration: 1 }, 1);   // at 1 s inside, 2× speed, placed at 3 s → 3.5 s, 0.5 s long
sub.timeScale(2); tl.add(sub, 3); tl.set({}, {}, 6);
window.__timelines = { e: tl };</script></body></html>`);
  const r = node("scripts/timeline-events.mjs", [dir]); assert.equal(r.code, 0, r.out);
  assert.match(r.out, /events .* with data-sfx/);
  const J = JSON.parse(readFileSync(join(dir, "build/events.json"), "utf8")), by = (id) => J.events.filter((e) => e.targets.some((t) => t.id === id));
  assert.equal(J.duration, 6);
  const card = by("card")[0];
  assert.deepEqual([card.t, card.dur, card.end, card.kind, card.ease], [0.5, 0.8, 1.3, "tween", "power3.out"]);
  assert.deepEqual(card.props, ["x"]); assert.deepEqual(card.targets[0].classes, ["card", "paper"]); assert.deepEqual(card.sfx, ["paper-slide"]); assert.equal(card.label, "open");
  const [set, fade] = by("title");
  assert.equal(set.kind, "set"); assert.equal(set.t, 0);
  assert.deepEqual([fade.t, fade.dur, fade.label], [2, 0.4, "hit"]); assert.deepEqual(fade.sfx, ["whoosh"], "vars.data.sfx counts too");
  const tick = J.events.find((e) => e.targets.some((t) => t.classes.includes("tick")));
  assert.deepEqual([tick.t, tick.dur], [3.5, 0.5], "a nested timeline's offset and time scale");
  assert.equal(tick.targets.length, 2); assert.deepEqual(tick.sfx, ["tick"]);
  assert.deepEqual(J.labels.map((l) => [l.name, l.t]), [["open", 0], ["hit", 2]]);
  assert.ok(J.events.every((e, i) => !i || J.events[i - 1].t <= e.t), "sorted by time");
});
