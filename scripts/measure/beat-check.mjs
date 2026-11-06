// Do the seams and hits sit on the film's pulse? (video-motion-craft references/reads-and-beat.md §9)
//   node scripts/measure/beat-check.mjs <filmDir> [--script direction/script.json] [--render renders/draft-N.mp4]
//        [--bpm 120 --offset 0.03 --bar 4] [--fps 60] [--tol 3] [--json results.json]
// The grid comes from <filmDir>/build/sections.json (bpm, offset = the first downbeat, beatsPerBar) unless --bpm/--offset are given.
// Events: every seam in script.json (seams[].t: the frame the change lands) and every hit: an important motion read's landing
// (reads[].act, default t0 + 0.33 s) or any read marked "hit": true (its t0: a tag lighting, a word appearing on the beat).
// For each it prints the offset in frames from the nearest beat and the nearest bar line (+ = late) and
//   WARN when it is more than ±tol frames (default 3 at 60 fps) off the beat,
//   WARN when a big change (a seam of kind open/close, or bar: true) is more than ±tol frames off a bar line.
// With --render it also measures the picture (the same per-frame luma difference as motion-profile.py, via ffmpeg-static):
//   whether the first and last frames are already at full picture (a hard start or stop: WARN),
//   for each seam, the frame of peak motion within ±0.4 s of its t and that peak's offset from the beat (WARN as above),
//   and the visual spikes nowhere near a seam (unplanned hits: the viewer sees them as hits too), WARN when off the beat.
// Exit 0 = all on the grid, 2 = warnings, 1 = bad input.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { MOTION } from "../lib/rules.mjs";
const TOOL = resolve(new URL("../..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json"));
const Beat = require(join(TOOL, "library/motion/beat.js"));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const film = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!film) { console.error("usage: beat-check.mjs <filmDir> [--script s.json] [--render r.mp4] [--bpm 120 --offset 0.03 --bar 4] [--fps 60] [--tol 3]"); process.exit(1); }
const secFile = join(film, "build/sections.json"), sec = existsSync(secFile) ? JSON.parse(readFileSync(secFile, "utf8")) : {};
const bpm = +opt("bpm", sec.bpm ?? NaN), offset = +opt("offset", sec.offset ?? 0), perBar = +opt("bar", sec.beatsPerBar ?? 4);
if (!(bpm > 0)) { console.error(`beat-check: no BPM (no ${secFile}; pass --bpm and --offset)`); process.exit(1); }
const scriptFile = resolve(film, opt("script", "direction/script.json"));
if (!existsSync(scriptFile)) { console.error(`beat-check: no script ${scriptFile}`); process.exit(1); }
const S = JSON.parse(readFileSync(scriptFile, "utf8")), B = Beat.make(bpm, offset, perBar);
const render = opt("render") ? resolve(film, opt("render")) : null, tol = +opt("tol", MOTION.beat.hitTolFrames);
let fps = +opt("fps", 0);
const FF = require("ffmpeg-static");
if (render && !fps) { try { execFileSync(FF, ["-hide_banner", "-i", render], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { const m = String(e.stderr).match(/(\d+(?:\.\d+)?) fps/); fps = m ? +m[1] : 60; } }
fps ||= 60;
const fr = (s) => Math.round(s * fps), sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const BIG = new Set(["open", "close", "開場", "結尾"]);

const events = [
  ...(S.seams ?? []).map((m, i) => ({ type: "seam", id: m.id ?? `S${i + 1}`, t: m.t, big: BIG.has(m.kind) || m.bar === true, kind: m.kind ?? "seam", what: m.device ?? "" })),
  // hits: an important motion read lands (act, default t0 + 0.33 s); any read marked hit: true starts (t0)
  ...(S.beats ?? []).flatMap((b) => (b.reads ?? []).filter((r) => r.hit === true || (r.important && r.kind === "motion"))
    .map((r) => ({ type: "hit", id: b.id, t: r.hit === true ? r.t0 : r.act ?? r.t0 + 0.33, big: false, kind: r.kind ?? "visual", what: r.what ?? "" }))),
].filter((e) => typeof e.t === "number").sort((a, b) => a.t - b.t);

let warns = 0;
const J = { bpm, offset, perBar, fps, tol, events: [], open: null, close: null, loose: [] };   // --json: the same results for the review gate
const row = (e, t, tag = "", source = "script") => {
  const ob = fr(B.off(t, "beat")), oba = fr(B.off(t, "bar")), bad = Math.abs(ob) > tol, badBar = e.big && Math.abs(oba) > tol;
  if (bad || badBar) warns++;
  J.events.push({ type: e.type, id: String(e.id), kind: e.kind, big: e.big, t: +t.toFixed(3), planned: e.t, source, beatOff: +B.off(t, "beat").toFixed(3), barOff: +B.off(t, "bar").toFixed(3), what: e.what });
  const flag = [bad && `離拍 ${sign(ob)} 格`, badBar && `大變化不在小節線（${sign(oba)} 格）`].filter(Boolean).join("；");
  console.log(`${bad || badBar ? "△" : "✓"} ${t.toFixed(2).padStart(6)}s  ${(e.type + (e.big ? "*" : "")).padEnd(6)} ${String(e.id).padEnd(10)} 拍 ${sign(ob).padStart(4)} 格  小節 ${sign(oba).padStart(4)} 格（第 ${B.bar(t + B.barLen / 2)} 小節）${tag}  ${flag || ""}  ${e.what.slice(0, 40)}`);
};
console.log(`beat-check: ${bpm} BPM, offset ${offset} s, ${perBar} beats/bar (1 beat = ${fr(B.beat)} 格, 1 bar = ${fr(B.barLen)} 格 at ${fps} fps), tol ±${tol} 格; * = 大變化（open/close 或 bar: true）`);
console.log(`— script（${S.seams?.length ?? 0} seams, ${events.length - (S.seams?.length ?? 0)} hits）`);
events.forEach((e) => row(e, e.t));

if (render) {
  const out = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", "scale=480:270,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 256 << 20 });
  const v = [0, ...out.split("\n").filter((l) => l.includes("YAVG")).map((l) => +l.split("=")[1])];   // v[k]: frame k vs frame k−1
  const mv = v.filter((x) => x > 0.15).sort((a, b) => a - b), med = mv.length ? mv[Math.floor(mv.length / 2)] : 0;
  const spikes = []; for (let k = 1; k < v.length; k++) if (v[k] - v[k - 1] > Math.max(3 * med, 1.0)) spikes.push(k);
  console.log(`— render ${render.split("/").pop()}（${v.length} 格；seam 的實際峰值 = t ±0.4 秒內動態最大的那一格）`);
  const seams = events.filter((e) => e.type === "seam"), w = Math.round(0.4 * fps);
  // the open and the close are seams too: a first frame already at full picture is a hard start, a last frame at full picture a hard stop
  const luma = (a) => execFileSync(FF, ["-nostdin", "-v", "error", ...a, "-i", render, "-vf", "scale=160:90,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { encoding: "utf8" })
    .split("\n").filter((l) => l.includes("YAVG")).map((l) => +l.split("=")[1]);
  const head = luma(["-t", "1.0"]), tail = luma(["-sseof", "-1.5"]), ref0 = Math.max(...head, 1), ref1 = Math.max(...tail, 1);
  // hard = the first (last) 0.3 s does not change at all and the frame is not black: a fade from black or from white, or a first
  // frame already moving, all change. (Comparing the first frame with the brightest one called every fade from white hard.)
  const k3 = Math.max(1, Math.round(0.3 * fps)), still = (xs) => xs.length > 0 && xs.every((x) => x <= 0.15);
  const hardOpen = still(v.slice(1, k3 + 1)) && head[0] > 8, hardClose = still(v.slice(-k3)) && tail.at(-1) > 8;
  if (hardOpen || hardClose) warns += hardOpen + hardClose;
  J.open = { hard: hardOpen, first: head[0], max: ref0 }; J.close = { hard: hardClose, last: tail.at(-1), max: ref1 };
  console.log(`${hardOpen ? "△" : "✓"} 開場：第一格亮度 ${head[0].toFixed(0)}（前 1 秒最亮 ${ref0.toFixed(0)}）${hardOpen ? "：前 0.3 秒完全沒變（硬開；從暗或白淡入 0.3–0.6 秒，或第一格就在動）" : ""}`);
  console.log(`${hardClose ? "△" : "✓"} 結尾：最後一格亮度 ${tail.at(-1).toFixed(0)}（最後 1.5 秒最亮 ${ref1.toFixed(0)}）${hardClose ? "：最後 0.3 秒完全沒變（直接停；最後 0.5–1.0 秒淡出到暗或白）" : ""}`);
  for (const e of seams) {
    if (e.kind === "open" || e.kind === "close") continue;   // measured above
    const k0 = Math.max(1, Math.min(v.length - 1, fr(e.t) - w)), k1 = Math.min(v.length - 1, fr(e.t) + w); let pk = k0;
    if (!(v[k0] >= 0)) continue;   // a seam at or past the last frame (a close not named "close") has no window to measure
    for (let k = k0; k <= k1; k++) if (v[k] > v[pk]) pk = k;
    row(e, pk / fps, `  峰值 ${(pk / fps).toFixed(2)}s（寫的是 ${e.t}，${sign(pk - fr(e.t))} 格，動態 ${v[pk].toFixed(1)}）`, "render");
  }
  const loose = spikes.filter((k) => !seams.some((e) => Math.abs(k - fr(e.t)) <= w));
  // merge spikes within 0.2 s (one event)
  const groups = []; for (const k of loose) { if (groups.length && k - groups[groups.length - 1].at(-1) <= fps * 0.2) groups[groups.length - 1].push(k); else groups.push([k]); }
  if (groups.length) console.log(`— 不在接縫表裡的跳動（${groups.length} 處）：這些也是觀眾會注意到的「打點」`);
  for (const g of groups) { const k = g[0], t = k / fps, ob = fr(B.off(t, "beat")), bad = Math.abs(ob) > tol; if (bad) warns++; J.loose.push({ t: +t.toFixed(3), beatOff: +B.off(t, "beat").toFixed(3), motion: v[k] });
    console.log(`${bad ? "△" : "✓"} ${t.toFixed(2).padStart(6)}s  跳動   拍 ${sign(ob).padStart(4)} 格  小節 ${sign(fr(B.off(t, "bar"))).padStart(4)} 格  動態 ${v[k].toFixed(1)}${bad ? `  離拍 ${sign(ob)} 格（寫進 seams，或移到拍上）` : ""}`); }
}
console.log(warns ? `△ ${warns} 處離拍或大變化不在小節線` : "✓ 全部在拍上");
if (opt("json")) writeFileSync(resolve(opt("json")), JSON.stringify(J, null, 1));
process.exit(warns ? 2 : 0);
