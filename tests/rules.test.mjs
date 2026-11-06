// library/rules/motion.json is the one home of video-motion-craft's numbers: the scripts read its values and the skill's table
// is generated from it, so the two cannot drift apart again (the review found the same number written three ways).
import { test } from "node:test";
import assert from "node:assert/strict";
import { node, readFileSync, join, root } from "./helpers.mjs";
import { MOTION, fill, loadRules, table } from "../scripts/lib/rules.mjs";
import { GATE } from "../scripts/review-pack.mjs";
import { ENERGY } from "../scripts/lib/motion.mjs";

test("rules: the skills' tables match library/rules (node scripts/rules.mjs --write after changing a number)", () => {
  const r = node("scripts/rules.mjs", ["--check"]); assert.equal(r.code, 0, r.out);
  assert.ok(readFileSync(join(root, ".claude/skills/video-motion-craft/SKILL.md"), "utf8").includes(table("motion")));
});

test("rules: the gate and the energy curve hold the numbers in the rules file", () => {
  assert.deepEqual([GATE.seamTol, GATE.hitTolFrames, GATE.stutterFail, GATE.frozenTail, GATE.holdLimit, GATE.holdLimitLast, GATE.contrastMin, GATE.deadHold],
    [MOTION.beat.seamTol, MOTION.beat.hitTolFrames, MOTION.fluency.stutterFail, MOTION.end.frozenTail, MOTION.hold.limit, MOTION.hold.limitLast, MOTION.seam.contrastMin, MOTION.hold.dead]);
  assert.deepEqual([ENERGY.hook, ENERGY.denseAt, ENERGY.peakAt, ENERGY.gapBars], [MOTION.energy.hook, MOTION.energy.denseAt, MOTION.energy.peakAt, MOTION.energy.gapBars]);
});

test("rules: every {path} in a row resolves, an unknown one throws, every row names its gate and who measures it", () => {
  const { values, rows } = loadRules("motion");
  for (const r of rows) { assert.ok(["fail", "warn", "guide"].includes(r.gate), r.item); assert.ok(r.by, r.item); assert.doesNotMatch(fill(r.text, values), /\{/); }
  assert.throws(() => fill("{hold.nope}", values), /not in values/);
});
