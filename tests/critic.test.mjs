// The critic loop's region comparison (scripts/lib/critic.mjs) and the view-bake pairing (library/three/baked-scene.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRegion, hue, luminance } from "../scripts/lib/critic.mjs";
import { nearestViews } from "../library/three/baked-scene.js";

test("region comparison: luminance on linear light, hue in degrees, dark regions on absolute terms", () => {
  assert.ok(Math.abs(luminance([255, 255, 255]) - 1) < 1e-9);
  assert.equal(hue([10, 10, 12]), null, "grey has no hue");
  assert.ok(Math.abs(hue([255, 0, 0]) - 0) < 1e-9 && Math.abs(hue([0, 0, 255]) - 240) < 1e-9);
  const close = compareRegion([82, 61, 41], [79, 61, 44]);
  assert.ok(close.pass && Math.abs(close.dL) < 0.1, `C's machine at 0 s: ${close.dL}`);
  const cold = compareRegion([82, 61, 41], [46, 46, 48]);
  assert.ok(!cold.pass, "the old cold grey machine fails");
  assert.ok(compareRegion([0, 0, 1], [1, 1, 3]).pass, "near-black regions do not fail on relative noise");
  assert.equal(compareRegion([200, 100, 50], [50, 100, 200]).pass, false, "hue swap fails");
});

test("view bakes: the nearest two moments, held at the ends", () => {
  const T = [0, 0.5, 1, 1.5];
  assert.deepEqual(nearestViews(T, -1), { a: 0, b: 0, w: 0 });
  assert.deepEqual(nearestViews(T, 0.25), { a: 0, b: 1, w: 0.5 });
  assert.deepEqual(nearestViews(T, 1.5), { a: 3, b: 3, w: 0 });
  assert.deepEqual(nearestViews(T, 9), { a: 3, b: 3, w: 0 });
  assert.deepEqual(nearestViews([], 1), { a: 0, b: 0, w: 0 });
});
