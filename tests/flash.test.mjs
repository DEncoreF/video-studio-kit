// scripts/lib/motion.mjs flashes(): one- to three-frame flashes (a blank or stray frame between two that agree). Film E's
// hardest-shot test v6 flashed six times in its first 2 s under filmed-screen and the edge-based snap test caught one
// (user, 2026-10-29: 「有一些格數有閃畫面的問題」). Synthetic clips: a box moving on paper, with blank frames dropped in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { flashes } from "../scripts/lib/motion.mjs";
import { fresh, join, root } from "./helpers.mjs";

const FF = createRequire(import.meta.url)(join(root, "node_modules/ffmpeg-static"));
// the moving box is an overlay: drawbox evaluates x once (t is NaN then), so a drawbox box with x='40+t*120' never appeared
const clip = (dir, name, blank) => {
  const out = join(dir, name), move = "[0][1]overlay=x='40+t*120':y=100:eval=frame";
  const fc = blank ? `${move},drawbox=x=0:y=0:w=480:h=270:color=white:t=fill:enable='${blank}'` : move;
  execFileSync(FF, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xF2F0EB:s=480x270:r=60:d=2", "-f", "lavfi", "-i", "color=c=0x111113:s=80x60:r=60:d=2",
    "-filter_complex", fc, "-pix_fmt", "yuv420p", out]);
  return out;
};

test("flashes: a single blank frame and a three-frame blank run are found; smooth motion is not", () => {
  const d = fresh("flash");
  assert.deepEqual(flashes(clip(d, "clean.mp4")).flashes, []);
  const f = flashes(clip(d, "flash.mp4", "eq(n,30)+between(n,70,72)")).flashes;
  assert.deepEqual(f.map((x) => [x.k, x.frames]), [[30, 1], [70, 3]]);
});

test("flashes: a hard cut (the picture changes and stays) is not a flash", () => {
  const d = fresh("flash-cut");
  assert.deepEqual(flashes(clip(d, "cut.mp4", "gte(n,60)")).flashes, []);
});

test("flickers: a small card that is wrong one frame in six is found; a single slap and smooth motion are not", async () => {
  const { flickers } = await import("../scripts/lib/motion.mjs");
  const d = fresh("flicker");
  // a 60 px card moving right at y 120, at y 102 on the stray frames (overlay evaluates x and y every frame; drawbox does not)
  const card = (name, stray) => { const out = join(d, name);
    execFileSync(FF, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xF2F0EB:s=480x270:r=60:d=2", "-f", "lavfi", "-i", "color=c=0x141A33:s=60x60:r=60:d=2",
      "-filter_complex", `[0][1]overlay=x='100+t*60':y='120-18*(${stray})':eval=frame`, "-pix_fmt", "yuv420p", out]); return out; };
  assert.deepEqual(flickers(card("clean.mp4", "0")), []);
  const f = flickers(card("flicker.mp4", "eq(mod(n,6),3)*between(n,30,90)"));
  assert.equal(f.length, 1); assert.ok(f[0].n >= 8 && f[0].every === 6, JSON.stringify(f));
  assert.deepEqual(flickers(card("slap.mp4", "eq(n,60)")), []);
});

test("areaFlashes: a layer shown full-screen for three frames before it grows from a box is found; the box growing alone is not", async () => {
  const { areaFlashes } = await import("../scripts/lib/motion.mjs");
  const d = fresh("area-flash");
  // a violet box grows from 60 % to the whole frame from frame 60; "stray" also paints the whole frame on frames 57–59
  const make = (name, stray) => { const out = join(d, name);
    const grow = "[0][1]overlay=x='if(gte(n,60),max(0,192-(n-60)*16),480)':y='if(gte(n,60),max(0,108-(n-60)*9),270)':eval=frame";   // overlay moves per frame; drawbox does not
    execFileSync(FF, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xF6F7F9:s=480x270:r=60:d=2", "-f", "lavfi", "-i", "color=c=0x5B47E0:s=480x270:r=60:d=2",
      "-filter_complex", `${grow}${stray ? ",drawbox=x=0:y=0:w=480:h=270:color=0x5B47E0:t=fill:enable='between(n,57,59)'" : ""}`, "-pix_fmt", "yuv420p", out]); return out; };
  assert.deepEqual(areaFlashes(make("grow.mp4", false)), []);
  const f = areaFlashes(make("stray.mp4", true));
  assert.equal(f.length, 1); assert.equal(f[0].k, 57); assert.equal(f[0].frames, 3);
});
