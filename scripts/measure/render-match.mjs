// node scripts/measure/render-match.mjs <dir> <render.mp4> --at t,t,… [--json out.json] [--png <outdir>]
// Does the render show what the composition shows? Seeks <dir>/index.html to each time, screenshots it, and compares it with the
// render's frame there (the nearest of three frames, so a frame of timing slack is not a mismatch). Both are cut to a grid of
// 96×54 cells; a cell differs when its mean colour is more than RENDER_MATCH.cell apart (0–255). A pose whose differing cells
// cover more than RENDER_MATCH.share of the frame is a mismatch: the renderer drew something the seek did not, or nothing.
// --png writes <outdir>/<t>.jpg: seek | render side by side, differing cells outlined in the render half.
// Why: twice the gate passed a render that was drawn wrong, because every measure reads time and motion, and the stills are
// seeks: an earlier film's campaign C (2026-10-29,「C沒出來」— two sets at time 0, the renderer and seek read them differently,
// the circle and square were missing from the render) and a later test clip (2026-10-31, data-motion-blur turned a preserve-3d flap to
// its back face for the whole beat). draft-review FEEDBACK.
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { openFilm, seek as seekTo } from "../lib/film-page.mjs";

export const RENDER_MATCH = { cell: 48, share: 0.12, grid: [96, 54] };
const args = process.argv.slice(2), dir = resolve(args[0] ?? "."), render = resolve(args[1] ?? ""), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const times = String(opt("at", "")).split(",").map(Number).filter(Number.isFinite), out = opt("json"), png = opt("png");
const TOOL = resolve(new URL("../..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json"));
const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
const [GW, GH] = RENDER_MATCH.grid;

const probe = execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", render], { encoding: "utf8" });
const st = JSON.parse(probe).streams[0], [fn, fd] = st.r_frame_rate.split("/").map(Number), fps = fn / fd;
/** rgb24 pixels scaled to the grid (area average): an image, or `count` video frames from frame `from` on. */
const grid = (input, from, count = 1) => {
  const seek = from === undefined ? [] : ["-ss", (from / fps).toFixed(4)];
  const buf = execFileSync(FF, ["-v", "error", ...seek, "-i", input, "-vf", `scale=${GW}:${GH}:flags=area`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 1 << 24 });
  const n = GW * GH * 3; return Array.from({ length: Math.floor(buf.length / n) }, (_, i) => buf.subarray(i * n, (i + 1) * n));
};
const diff = (a, b) => { const d = new Uint8Array(GW * GH); let n = 0;
  for (let i = 0; i < GW * GH; i++) { const m = (Math.abs(a[3 * i] - b[3 * i]) + Math.abs(a[3 * i + 1] - b[3 * i + 1]) + Math.abs(a[3 * i + 2] - b[3 * i + 2])) / 3; if (m > RENDER_MATCH.cell) { d[i] = 1; n++; } }
  return { share: n / (GW * GH), mask: d }; };

const film = await openFilm(dir), p = await film.open({ viewport: { width: st.width, height: st.height }, timeout: 10000, optional: true });
const result = { render, fps, findings: [], poses: [] };
if (!p) result.skipped = "no window.__timelines";
else {
  await p.evaluate(() => document.fonts?.ready);
  if (png) mkdirSync(png, { recursive: true });
  const nb = +st.nb_frames || Infinity, shot = join(tmpdir(), `render-match-${process.pid}.png`);
  for (const t of times) {
    await seekTo(p, t);
    await p.waitForTimeout(80);
    await p.screenshot({ path: shot });
    const [seek] = grid(shot), k = Math.round(t * fps), from = Math.max(0, Math.min(k - 1, nb - 3));
    let best = null;
    grid(render, from, 3).forEach((r, i) => { const d = diff(seek, r); if (!best || d.share < best.share) best = { ...d, frame: from + i }; });
    if (!best) continue;
    const pose = { t, frame: best.frame, share: +best.share.toFixed(3), mismatch: best.share > RENDER_MATCH.share };
    result.poses.push(pose);
    if (pose.mismatch) result.findings.push({ kind: "render-mismatch", t, frame: best.frame, share: pose.share });
    if (png) {
      const boxes = []; for (let i = 0; i < GW * GH; i++) if (best.mask[i]) boxes.push(`drawbox=x=${(i % GW) * st.width / GW}:y=${Math.floor(i / GW) * st.height / GH}:w=${st.width / GW}:h=${st.height / GH}:color=red@0.5:t=2`);
      const fr = join(png, `.f.png`);
      spawnSync(FF, ["-v", "error", "-y", "-ss", (best.frame / fps).toFixed(4), "-i", render, ...(boxes.length ? ["-vf", boxes.slice(0, 1500).join(",")] : []), "-frames:v", "1", fr]);
      spawnSync(FF, ["-v", "error", "-y", "-i", shot, "-i", fr, "-filter_complex", "[0][1]hstack=inputs=2,scale=1280:-2", "-frames:v", "1", join(png, `${t.toFixed(2)}.jpg`)]);
    }
  }
}
await film.close(); rmSync(join(tmpdir(), `render-match-${process.pid}.png`), { force: true });
if (png) rmSync(join(png, ".f.png"), { force: true });
const txt = result.skipped ? `render-match: ${result.skipped}，略過\n` : `成片和合成（seek）同一格的差異：每格切成 ${GW}×${GH} 格，平均顏色差 > ${RENDER_MATCH.cell} 的格子比例；> ${Math.round(RENDER_MATCH.share * 100)}% 判 FAIL render-mismatch\n`
  + result.poses.map((x) => `${x.t.toFixed(2).padStart(6)} 秒  f${String(x.frame).padStart(4, "0")}  差異 ${String(Math.round(x.share * 100)).padStart(3)}%${x.mismatch ? "  ← 成片和合成不一樣" : ""}`).join("\n") + "\n";
process.stdout.write(txt);
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
