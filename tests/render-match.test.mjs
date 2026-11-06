// scripts/measure/render-match.mjs: the render against the composition at the key poses (an earlier film's campaign C,
// 2026-10-29 and 2026-10-31, two test clips: both renders were drawn wrong and the gate passed). A tiny composition with a
// hand-written timeline, and renders made with ffmpeg: one that draws what the seek shows, one without the box, one with it
// another colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, fresh, join, readFileSync, root, writeFileSync } from "./helpers.mjs";

const FF = createRequire(import.meta.url)(join(root, "node_modules/ffmpeg-static"));
const page = `<!doctype html><html><head><style>*{margin:0}body{width:1920px;height:1080px;background:#111}#box{position:absolute;left:600px;top:300px;width:800px;height:500px;background:#c8f060}</style></head>
<body><div data-composition-id="t" data-duration="2"><div id="box"></div></div>
<script>window.__timelines={t:{seek(t){},duration(){return 2}}};</script></body></html>`;
const video = (file, box) => execFileSync(FF, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x111111:s=1920x1080:r=30:d=2",
  ...(box ? ["-vf", `drawbox=x=600:y=300:w=800:h=500:color=${box}:t=fill`] : []), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", file]);
const run = (dir, mp4) => { const out = join(dir, "rm.json"); const r = spawnSync(process.execPath, [join(root, "scripts/measure/render-match.mjs"), dir, mp4, "--at", "0.5,1.5", "--json", out, "--png", join(dir, "rm")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(readFileSync(out, "utf8")); };

test("a render that draws what the seek shows passes; a missing element or a different colour fails render-mismatch, with a side-by-side", () => {
  const dir = fresh("render-match");
  writeFileSync(join(dir, "index.html"), page);
  video(join(dir, "same.mp4"), "0xc8f060");
  video(join(dir, "missing.mp4"), null);
  video(join(dir, "purple.mp4"), "0x6a5aa8");
  const same = run(dir, join(dir, "same.mp4"));
  assert.deepEqual(same.findings, []);
  assert.ok(same.poses.every((p) => p.share < 0.02), JSON.stringify(same.poses));
  for (const f of ["missing.mp4", "purple.mp4"]) {
    const r = run(dir, join(dir, f));
    assert.deepEqual(r.findings.map((x) => [x.kind, x.t]), [["render-mismatch", 0.5], ["render-mismatch", 1.5]], f);
    assert.ok(r.findings[0].share > 0.17 && r.findings[0].share < 0.22, `${f}: the box is about 19% of the frame (${r.findings[0].share})`);
  }
  assert.ok(existsSync(join(dir, "rm/0.50.jpg")));
});

test("a folder without a timeline is skipped, not failed", () => {
  const dir = fresh("render-match-none");
  writeFileSync(join(dir, "index.html"), "<!doctype html><p>no timeline</p>");
  video(join(dir, "a.mp4"), null);
  const r = run(dir, join(dir, "a.mp4"));
  assert.equal(r.skipped, "no window.__timelines");
  assert.deepEqual(r.findings, []);
});
