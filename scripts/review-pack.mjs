// The review pack and the draft gate (video-draft-review): everything to look at before a draft goes to the user, at three
// scales, the measurements that decide on their own, and a checklist whose answers must point at frames in the pack.
//   node scripts/review-pack.mjs <dir> <render.mp4> [--script direction/script.json] [--out <dir>/review] [--step 2] [--test] [--no-png] [--force]
//     refuses (exit 3) to write into a folder that holds a PASS.json that still holds or a CHECKLIST.md that has been filled in:
//     use --out <dir>/review-<render> for a new render's pack, or --force to throw the old review away
//   node scripts/review-pack.mjs --check  <dir>/review           # the gate: exit 0 writes PASS.json bound to the render's sha256
//   node scripts/review-pack.mjs --verify <dir>/review [file]    # exit 0 only while PASS.json still matches the file (default: the render)
//   node scripts/review-pack.mjs --attach <dir>/review <file>    # record a re-encode of the passed render (e.g. draft-N-small.mp4)
//   node scripts/review-pack.mjs --check <dir>/review --candidate   # a campaign's candidate, still being chosen: measures only, no MOTION.md; it goes out only inside compare.mp4
//   node scripts/review-pack.mjs --link <preview.mp4> <dir>/review [<dir2>/review …]   # a chosen version shown as a preview (a join, a close-up) comes from these passed reviews: writes <preview>.pass.json
// <dir> is a film (videos/<專案>/films/<片>) or a test clip's folder (videos/<專案>/tests/_<名>: --test is implied there).
// Writes into <out> (default <dir>/review/, not versioned):
//   sheet.jpg            the whole film, one frame a second (the shape of the piece)
//   beats/NN-<id>.jpg    each beat every 0.2 s (one sheet per shot: is its event clear from the sheet alone?)
//   seams/<id>.jpg       each seam (open and close included) ±0.4 s, every frame (every 2nd at 60 fps)
//   reads/…-start.jpg, …-end.jpg   a still at each important read's start and end (do the key poses read as stills?)
//   crops/….jpg          full resolution, for each read with a "crop" [x, y, w, h] (the details that carry the story)
//   timing.txt, timing.svg (+ timing.png)   planned reads and seams against the measured motion, beat by beat
//   lint.txt, beat-check.txt, motion-profile.txt, film-metrics.txt   the tools' outputs
//   dissolve.txt         each seam's most dissolve-like stretch: old and new semi-transparent together fails (seam-dissolve)
//   subject.txt          films only: each important read's key pose, the size of its biggest line and object (subject-small)
//   static-shot         (in pack.json) one composition held longer than staticShot between two big moves; fails
//   sound.txt            the render's sound: integrated loudness and true peak against the spec fail (loudness, true-peak; a test
//                        clip only true-peak), sudden rises and a film without sound warn (loud-jump, no-audio)
//   layout.txt           placement read from the composition: a pair off the centre line (asymmetric), a label off its subject
//                        (label-off); both fail
//   safe-zone.txt        words and logo against the safe boxes (hyperframes "Keep it editable"), read from the composition: text in the
//                        outer 5% or a logo that moves fails (safe-zone, logo-moved); text outside title-safe (10%) warns (safe-title)
//   render-match.txt, render-match/<t>.jpg   each key pose: the composition's seek beside the render's frame; a render that draws
//                        something else there (a missing element, a back face) fails (render-mismatch)
//   layout.txt           each beat's key pose against the beat before: the same composition 3 beats in a row fails (layout-repeat)
//   energy.txt           films only: the energy curve a second at a time, its events, and the hook / middle / densest / peak / gap checks
//   slide.txt            films only: the slideshow risk (fast frames, blank stretches, repeated layouts, blue-violet share) and its score
//   ruler/side-by-side.jpg, ruler/metrics.txt   films only: the draft beside its rulers (direction/rulers.json) — one frame
//                        per beat against the rulers' moments, and film-metrics for the draft and every ruler in one table
//   events.json, MOTION.md   every version, films and test clips: the motion pass (lib/motion-pass.mjs): what a program can check
//                        (ease-unknown and motion-unread fail; ease-soft, no-params, no-beat, no-ruler-ease, hero-weak warn), the warnings and the
//                        user's exemplars again, and four answers that --check verifies. A filled one moves to MOTION.prev.md on a new pack.
//   pack.json            the render's sha256, the windows, the measured findings
//   CHECKLIST.md         films only: the failure list, whether the first event reads at first glance, one summary against the rulers
//   INDEPENDENT.md       films only: a reviewer who did not make the film (a fresh subagent shown only this pack) writes what
//                        it found, each line citing frames; the maker answers every [!] with「處理：」. --check needs both.
// Every tile and still is labelled with its frame number (f0732). An answer counts only when it cites at least one frame of
// its own item's sheet or stills; a frame that is not in the pack, or not in that item's window, fails it.
// Measured problems (FAIL) block the gate unless the user waived them in <dir>/review-waivers.json:
//   [{ "check": "seam-beat", "id": "S2", "reason": "…", "quote": "使用者的原話", "approved_by": "使用者", "date": "2026-10-25" }]
//   check = the finding's code; without "id" the waiver covers every finding of that code.
// Films must name their rulers in <dir>/direction/rulers.json (the side-by-side is a required part of the gate, not optional:
// film D went four drafts without it and read as「不夠專業」):
//   { "rulers": [{ "id": "apple", "title": "…", "url": "…", "file": "~/.video-studio/rulers/apple.mp4", "moments": [{ "t": 9.5, "what": "…" }] }] }
//   file: a local copy (absolute, ~/, or relative to <dir>); moments: the ruler's own moments of the kinds the film has.
// Test clips (tests/_*, videos/_*) are measured only: no checklist, and only TEST_FAIL codes fail there.
// --check re-measures the render (it does not trust pack.json), so a stale or edited pack cannot pass.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { MOTION, readNeed } from "./lib/rules.mjs";
import { compareRefs } from "./lib/refcards.mjs";
import { motionFindings, motionTemplate, readMotion } from "./lib/motion-pass.mjs";
import { loudness } from "./lib/sound.mjs";
import { CROSS, DISSOLVE, ENERGY, HOLD, REAL, LAYOUT, SLIDE, SUBJECT, calmRuns, contrast, dissolves, edgeMaps, energy, flashes, flickers, areaFlashes, headCross, jumps, layouts, lumaDiff, onsets, pictureStats, profile, slideRisk, subjects } from "./lib/motion.mjs";
const TOOL = resolve(new URL("..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json"));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = (k) => args.includes(`--${k}`);
const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
const env = { ...process.env, PATH: [dirname(FF), dirname(FP), process.env.PATH].join(delimiter) };
const FAILURE_LIST = join(TOOL, ".claude/skills/video-draft-review/references/failure-list.md");   // the list has one home

// The numbers the gate holds: library/rules/motion.json (the table in video-motion-craft SKILL.md is generated from it)
export const GATE = {
  seamTol: MOTION.beat.seamTol,             // a major seam's measured peak (open, close, major: true, bar: true) off the beat (a bar: off the bar line) fails; others warn
  hitTolFrames: MOTION.beat.hitTolFrames,   // hits and seams within seamTol but more than this many frames off: a warning
  stutterFail: MOTION.fluency.stutterFail,  // a stop of this many frames or more fails; shorter stops warn
  frozenTail: MOTION.end.frozenTail,        // longer than this completely still at the end fails (a fade still moves)
  holdLimit: MOTION.hold.limit,             // after a beat's last read, longer than this before the next change fails (「停太久」)
  holdLimitLast: MOTION.hold.limitLast,     // the last beat gets the end hold on top
  contrastMin: MOTION.seam.contrastMin,     // a seam's burst below this × the motion around it: a warning (slow → burst → glide)
  deadHold: MOTION.hold.dead,               // a calm stretch longer than this with no read in it: a warning (沒有事件的畫面)
  staticShot: MOTION.hold.staticShot,       // longer than this between two big moves (one composition, only small things changing) fails
  bigMove: MOTION.hold.bigMove,             // a frame moving this much is a big move: the camera, a scene change, the subject itself moving
  sound: MOTION.sound,                      // integrated LUFS ± tol and the true-peak ceiling fail; a rise of `jump` LU over the window before warns
};
// Codes that fail the gate. In a test clip only the ones in TEST_FAIL fail; the rest are warnings there (a clip is an excerpt:
// it may start on a full picture and end on a held title).
export const FAIL_CODES = new Set(["ease-unknown", "motion-unread", "stutter", "snap", "flash", "flicker", "frozen-tail", "seam-beat", "seam-bar", "read-short", "read-overlap", "last-read-late", "hold-long", "hard-open", "hard-close", "layout-repeat", "seam-dissolve", "subject-small", "no-grid", "no-reads", "no-ruler", "ruler-file", "energy-sag", "slide-risk", "no-ref", "ref-unknown", "experimental-unapproved", "safe-zone", "logo-moved", "asymmetric", "label-off", "text-overlap", "uneven-row", "glyph-fallback", "fill-variable", "static-shot", "render-mismatch", "loudness", "true-peak"]);
export const TEST_FAIL = new Set(["ease-unknown", "motion-unread", "flicker", "render-mismatch", "true-peak", "safe-zone", "logo-moved", "asymmetric", "label-off", "text-overlap", "uneven-row", "glyph-fallback", "fill-variable", "static-shot", "stutter", "snap", "flash", "seam-beat", "seam-bar", "seam-dissolve", "read-short", "read-overlap", "hold-long"]);

const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const shaText = (s) => createHash("sha256").update(s).digest("hex");
const readJSON = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const safe = (s) => String(s).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-|-$/g, "");
const f4 = (k) => `f${String(k).padStart(4, "0")}`;
const home = (f) => (f.startsWith("~/") ? join(process.env.HOME ?? "", f.slice(2)) : f);
/** The film's rulers (direction/rulers.json) and what is wrong with them: { R: [{ id, title, file, moments }], problems: [{ code, id, msg }] } */
export function rulersOf(dir) {
  const f = join(dir, "direction/rulers.json"), J = readJSON(f), problems = [];
  const how = "（video-draft-review 第 4 步：把 ruler.md 選的尺下載一份到 ~/.video-studio/rulers/，寫進 direction/rulers.json，每把尺列出要對照的 moments）";
  if (!J || !Array.isArray(J.rulers) || !J.rulers.length) return { R: [], problems: [{ code: "no-ruler", id: "rulers", msg: `沒有 direction/rulers.json 或裡面沒有尺：和尺並排是必過項${how}` }] };
  const R = J.rulers.map((r, i) => ({ id: String(r.id ?? `ruler${i + 1}`), title: r.title ?? r.id ?? "", url: r.url ?? "", file: r.file ? resolve(dir, home(String(r.file))) : null, moments: (r.moments ?? []).filter((m) => Number.isFinite(+m.t)).map((m) => ({ t: +m.t, what: m.what ?? "" })) }));
  for (const r of R) {
    if (!r.file || !existsSync(r.file)) problems.push({ code: "ruler-file", id: r.id, msg: `尺「${r.title || r.id}」的影片不在：${r.file ?? "（沒寫 file）"}${r.url ? `；來源 ${r.url}` : ""}${how}` });
    if (!r.moments.length) problems.push({ code: "no-ruler", id: r.id, msg: `尺「${r.title || r.id}」沒有 moments：寫出這把尺要拿來對照的時刻（主角拍、元件特寫、轉場）` });
  }
  return { R, problems };
}
// the side-by-side aspects (CHECKLIST §3, one summary item citing the draft's frames in ruler/side-by-side.jpg)
export const RULER_QS = [
  ["構圖", "每一拍的構圖和尺比：是同一個版型一再重複，還是每個畫面都不同？尺換畫面時構圖怎麼變？"],
  ["主體", "這一拍要看的那個元素（數字、按鈕、改過的字）在畫面上多大？尺把它放大到多大？畫面有多少是空白？"],
  ["材質", "光、深淺、層次（景深、陰影、玻璃、動態模糊）和尺比，差在哪？"],
  ["數字", "`ruler/metrics.txt` 的切點、動態量、最長靜止、停留和尺比，差在哪？哪一段該回去看？"],
];
export const isTestDir = (d) => resolve(d).split(sep).some((p, i, a) => (a[i - 1] === "tests" || a[i - 1] === "videos") && p.startsWith("_"));   // tests/_*, or a bare videos/_* test bed

function probe(render) {
  const p = JSON.parse(execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=r_frame_rate,nb_read_packets:format=duration", "-of", "json", render], { encoding: "utf8" }));
  const [a, b] = p.streams[0].r_frame_rate.split("/").map(Number), fps = a / (b || 1), dur = +p.format.duration;
  return { fps, dur, frames: +p.streams[0].nb_read_packets || Math.round(dur * fps) };
}

/** The pack's windows, computed from the script and the render's timing alone (so --check can recompute them). */
export function windows(S, { fps, frames }, step) {
  const beats = S.beats ?? [], total = S.total ?? frames / fps, last = frames - 1, fr = (t) => Math.max(0, Math.min(last, Math.round(t * fps)));
  const run = (k0, len, K) => { const out = []; for (let k = k0; k < k0 + len && k <= last; k += K) out.push(k); return out; };
  const W = { film: { file: "sheet.jpg", k0: 0, len: frames, K: Math.round(fps), frames: run(0, frames, Math.round(fps)) } };
  beats.forEach((b, i) => {
    const k0 = fr(b.t0), len = Math.max(1, fr(b.t1) - k0), K = Math.max(1, Math.round(0.2 * fps));
    W[`beat:${i}`] = { file: `beats/${String(i).padStart(2, "0")}-${safe(b.id ?? i)}.jpg`, k0, len, K, frames: run(k0, len, K), label: b.id };
  });
  const seams = S.seams?.length ? S.seams.map((m, i) => ({ id: m.id ?? `S${i + 1}`, t: m.t, kind: m.kind ?? "seam", device: m.device ?? "", bar: !!m.bar }))
    : [{ id: "open", t: 0, kind: "open", device: "（接縫表沒寫）" }, ...beats.slice(1).map((b) => ({ id: `→${b.id}`, t: b.t0, kind: "seam", device: "（接縫表沒寫）" })), { id: "close", t: total, kind: "close", device: "（接縫表沒寫）" }];
  for (const m of seams) {
    const start = m.kind === "open" ? 0 : m.kind === "close" ? total - 0.8 : m.t - 0.4, k0 = fr(start), len = Math.round(0.8 * fps);
    W[`seam:${m.id}`] = { file: `seams/${safe(m.id)}.jpg`, k0, len, K: step, frames: run(k0, len, step), label: m.id };
  }
  beats.forEach((b, bi) => (b.reads ?? []).forEach((r, ri) => {
    if (!r.important) return;
    const key = `${String(bi).padStart(2, "0")}-${safe(b.id ?? bi)}-${ri + 1}`, ks = fr(r.t0), ke = Math.max(ks, fr(r.t1) - 1), kc = Array.isArray(r.crop) && r.crop.length === 4 ? fr((r.t0 + r.t1) / 2) : null;
    const near = (W[`beat:${bi}`]?.frames ?? []).filter((k) => k >= fr(r.t0 - 0.25) && k <= fr(r.t1 + 0.25));
    W[`read:${key}`] = { key, start: ks, end: ke, crop: kc, frames: [...new Set([ks, ke, ...(kc === null ? [] : [kc]), ...near])].sort((x, y) => x - y), label: `${b.id}「${r.what ?? ""}」`, r };
  }));
  const mids = beats.map((b, i) => { const fs = W[`beat:${i}`]?.frames ?? [], mid = fr((b.t0 + b.t1) / 2); return fs.reduce((a, k) => (Math.abs(k - mid) < Math.abs(a - mid) ? k : a), fs[0]); }).filter(Number.isFinite);
  if (mids.length) { const rw = { file: "ruler/side-by-side.jpg", frames: [...new Set(mids)], label: "和尺並排" }; W.ruler = rw; for (const [k] of RULER_QS) W[`ruler:${k}`] = rw; }
  W.all = [...new Set(Object.values(W).flatMap((w) => w.frames ?? []))].sort((x, y) => x - y);
  return { W, seams };
}

/** Every measured finding for this render and script: { F: [{ level, code, id, t?, msg }], … }. Writes the tools' outputs into out. */
export function measure({ dir, render, scriptFile, test, out }) {
  const S = existsSync(scriptFile) ? JSON.parse(readFileSync(scriptFile, "utf8")) : null, beats = S?.beats ?? [];
  const { fps, v } = lumaDiff(render), P = profile(v, fps), F = [];
  const add = (code, id, msg, extra = {}) => F.push({ level: (test ? TEST_FAIL : FAIL_CODES).has(code) ? "FAIL" : "WARN", code, id: String(id), msg, ...extra });
  const warn = (code, id, msg, extra = {}) => F.push({ level: "WARN", code, id: String(id), msg, ...extra });
  // 1. fluency: stutters, the frozen tail
  // a stop of 1–2 frames warns (barely seen at speed), 3 frames or more fails
  for (const s of P.stutters) (s.frames >= GATE.stutterFail ? add : warn)("stutter", s.t, `${s.t} 秒頓了 ${s.frames} 格（動 → 停 ≤ 0.25 秒 → 動${s.frames < GATE.stutterFail ? `；${GATE.stutterFail} 格以下只提醒` : ""}）：子步驟要重疊，下一步在上一步約 80% 時就開始`, { t: s.t });
  if (P.stillTail > GATE.frozenTail) add("frozen-tail", "end", `結尾完全靜止 ${P.stillTail} 秒（> ${GATE.frozenTail}）：停的時候鏡頭仍慢推，最後 0.5–1.0 秒淡出`, { t: +(v.length / fps - P.stillTail).toFixed(2) });
  // 2. the reads (script-lint): the read table is the spec of the render
  if (S) {
    const lj = join(out, ".lint.json");
    const p = spawnSync(process.execPath, [join(TOOL, "scripts/script-lint.mjs"), scriptFile, "--json", lj], { encoding: "utf8" });
    writeFileSync(join(out, "lint.txt"), (p.stdout ?? "") + (p.stderr ?? ""));
    const lint = readJSON(lj); rmSync(lj, { force: true });
    for (const f of lint?.findings ?? []) {
      const id = f.read ? `${f.beat}#${f.read}` : f.beat ?? f.code ?? "script";
      if (f.code === "read-short" && f.important) add("read-short", id, f.msg);
      else if (f.code === "read-overlap") add("read-overlap", id, f.msg);
      else if (f.code === "last-read-late") add("last-read-late", "last", f.msg);
      else if (f.code === "no-ref" || f.code === "ref-unknown" || f.code === "experimental-unapproved") add(f.code, id, f.msg);
      else if (f.code === "hold-long") warn("hold-long-plan", id, `計畫：${f.msg}`);
      else warn(f.code ?? "lint", id, f.msg);
    }
  } else writeFileSync(join(out, "lint.txt"), "no script.json\n");
  if (!test) for (const p of rulersOf(dir).problems) add(p.code, p.id, p.msg);
  if (!beats.some((b) => (b.reads ?? []).some((r) => r.important))) add("no-reads", "script", "script.json 沒有重要讀點（reads）：先寫讀點表（video-motion-craft references/reads-and-beat.md §1），才量得到讀點與停留");
  // 3. the pulse (beat-check, measured on the render)
  const bj = join(out, ".beat.json");
  const bc = spawnSync(process.execPath, [join(TOOL, "scripts/measure/beat-check.mjs"), dir, "--script", scriptFile, "--render", render, "--json", bj], { encoding: "utf8", env, maxBuffer: 64 << 20 });
  writeFileSync(join(out, "beat-check.txt"), (bc.stdout ?? "") + (bc.stderr ?? ""));
  const B = readJSON(bj); rmSync(bj, { force: true });
  const tolF = GATE.hitTolFrames / fps + 1e-6, s2 = (x) => `${x > 0 ? "+" : ""}${x.toFixed(2)} 秒`;
  const measured = (B?.events ?? []).filter((e) => e.source === "render");
  if (!B) add("no-grid", "grid", S ? "沒有節拍格線（build/sections.json 的 bpm、offset）：沒有配樂也要定一個 BPM（reads-and-beat.md §9）" : "沒有 script.json，量不到接縫與節拍");
  else {
    for (const e of B.events) {
      if (e.type === "seam" && e.source === "script" && measured.some((m) => m.id === e.id)) continue;   // the measured peak stands for it
      // the open has no single peak (a fade) and is judged where it is written; a film that starts before the music's first
      // downbeat (a pickup) lands its open on that downbeat, so an open at or before it is on the grid
      if (e.type === "seam" && e.kind === "open" && e.t <= (B.offset ?? 0) + GATE.seamTol) continue;
      const where = e.source === "render" ? `實際峰值 ${e.t} 秒（寫的是 ${e.planned}）` : `${e.t} 秒`;
      if (e.type === "seam") {
        // only the open, the close and the seams marked major or bar: true hold the gate; an ordinary seam off the beat warns
        const sm = (S?.seams ?? []).find((m, i) => String(m.id ?? `S${i + 1}`) === e.id), major = e.big || sm?.major === true || sm?.bar === true;
        if (Math.abs(e.beatOff) > GATE.seamTol) (major ? add : warn)("seam-beat", e.id, `接縫 ${e.id} ${where} 離拍 ${s2(e.beatOff)}（> ${GATE.seamTol} 秒）${major ? "" : "：一般接縫只提醒；主要的接縫寫 major: true"}`, { t: e.t });
        else if (Math.abs(e.beatOff) > tolF) warn("seam-beat-near", e.id, `接縫 ${e.id} ${where} 離拍 ${s2(e.beatOff)}（超過 ${GATE.hitTolFrames} 格）`, { t: e.t });
        if (e.big && Math.abs(e.barOff) > GATE.seamTol) add("seam-bar", e.id, `大變化 ${e.id} ${where} 離小節線 ${s2(e.barOff)}（> ${GATE.seamTol} 秒）`, { t: e.t });
      } else if (Math.abs(e.beatOff) > tolF) warn("hit-beat", `${e.id}@${e.t}`, `打點「${e.what}」${e.t} 秒離拍 ${s2(e.beatOff)}`, { t: e.t });
    }
    for (const l of B.loose ?? []) if (Math.abs(l.beatOff) > tolF) warn("loose-spike", l.t, `接縫表以外的跳動 ${l.t} 秒離拍 ${s2(l.beatOff)}：寫進 seams，或移到拍上`, { t: l.t });
    if (B.open?.hard) add("hard-open", "open", `硬開：第一格就是完整畫面（亮度 ${B.open.first.toFixed(0)}／${B.open.max.toFixed(0)}）：從暗或白淡入 0.3–0.6 秒，或第一格就在動`, { t: 0 });
    if (B.close?.hard) add("hard-close", "close", `直接停：最後一格還是完整畫面（亮度 ${B.close.last.toFixed(0)}／${B.close.max.toFixed(0)}）：最後 0.5–1.0 秒淡出`, { t: +(v.length / fps).toFixed(2) });
  }
  // 3b. one-frame discontinuities, on edges (a white subject on a near-white ground has almost no luma difference)
  const seamTimes = [...(S?.seams?.length ? S.seams.map((m) => m.t) : beats.flatMap((b) => [b.t0, b.t1])), ...measured.filter((e) => e.type === "seam").map((e) => e.t)].filter(Number.isFinite);
  const EM = edgeMaps(render), Jm = jumps(EM, seamTimes), fk = (k) => `${f4(k - 1)} → ${f4(k)}`;
  for (const j of Jm.snaps) {
    const msg = `${j.t} 秒（${fk(j.k)}）主體一格跳掉：一格就換掉畫面 ${Math.round(j.rel * 100)}% 的結構，接著 ${j.backAt} 格又動回 ${Math.round(j.back * 100)}%（一格的不連續；量的是邊緣，白底上的白色主體也量得到）`;
    if (j.seam === null) add("snap", j.t, `${msg}：找出那一格的狀態從哪來（換手、重設、seek 到預設值），讓前後兩格接得上；真的是設計好的硬切，它就是接縫，寫進 seams`, { t: j.t });
    else warn("snap-seam", j.t, `${msg}，在接縫 ${j.seam} 秒旁：硬切的話沒事，否則照 snap 修（看 seams/ 那一條逐格表）`, { t: j.t });
  }
  // 3b'. flashes: one to three frames unlike both neighbours while the neighbours agree (a blank capture, a stray state); never designed
  const FLs = flashes(render).flashes;
  for (const x of areaFlashes(render)) if (!FLs.some((f) => Math.abs(f.k - x.k) <= 3)) add("flash", x.t, `${x.t} 秒（${f4(x.k)}${x.frames > 1 ? `–${f4(x.k + x.frames - 1)}` : ""}）閃了 ${x.frames} 格：畫面 ${x.area}% 的地方這幾格和前後兩格都不一樣、前後兩格彼此一樣（旁邊正好有真的變化，整張比對看不出來）——常見原因是 gsap.set 讓圖層先出現、它的 clip-path／位置補間還沒開始；把起始狀態在 gsap.set 寫好`, { t: x.t });
  for (const x of flickers(render)) add("flicker", x.t, `${x.t}–${x.t1} 秒 畫面 (${x.tile.join(", ")}) 附近同一塊地方閃了 ${x.n} 次（約每 ${x.every} 格一格不一樣）：常見原因是同一個元素的同一個屬性被兩個重疊的補間改（例如進場的 y 和浮起的 y），算圖時每段 worker 冷啟動算出不同的值；讓一個屬性同時只歸一個補間，或寫成 fromTo 把兩端寫死`, { t: x.t });
  for (const x of FLs) add("flash", x.t, `${x.t} 秒（${f4(x.k)}${x.frames > 1 ? `–${f4(x.k + x.frames - 1)}` : ""}）閃了 ${x.frames} 格：和前後兩格都差 ${x.d}，前後兩格彼此只差 ${x.around}（亮度 0–255）——這幾格是空白、沒畫完或跑錯狀態：看那幾格，找出是渲染（例如 filmed-screen 的截圖擷取）還是時間軸；不要只補格`, { t: x.t });
  for (const j of Jm.pops.filter((x) => x.seam === null))
    warn("pop", j.t, `${j.t} 秒（${fk(j.k)}）一格就換掉畫面 ${Math.round(j.rel * 100)}% 的結構、之後沒有回來（硬切、換件或一格就出現），不在接縫上：看那一拍的表，確認是設計`, { t: j.t });
  // 3c. a headline and moving content: the headline is gone before content crosses its zone (a warning: designed exceptions exist)
  const heads = beats.flatMap((b) => (b.reads ?? []).map((r, i) => ({ b, r, i }))).filter(({ r }) => r.important && r.kind === "text" && r.size !== "small" && r.zone !== false && r.t1 > r.t0);
  const zoneOf = (r) => (Array.isArray(r.zone) && r.zone.length === 4 ? r.zone : Array.isArray(S?.headline_zone) && S.headline_zone.length === 4 ? S.headline_zone : null);
  if (heads.length && !heads.some(({ r }) => zoneOf(r))) warn("head-zone", "script", "script.json 沒寫 headline_zone（標題所在的區域，1920×1080 的像素 [x, y, w, h]）：量不到標題還在的時候有沒有內容穿過它（reads-and-beat.md 資料格式）");
  const crossings = headCross(render, heads.filter(({ r }) => zoneOf(r)).map(({ b, r, i }) => ({ id: `${b.id}#${i + 1}`, what: r.text ?? r.what, t0: r.t0, t1: r.t1, zone: zoneOf(r) })));
  for (const c of crossings.filter((x) => x.spans)) {
    const list = c.spans.slice(0, 3).map((p) => `${p.t0}–${p.t1} 秒（最多 ${p.peak} px）`).join("、") + (c.spans.length > 3 ? `，還有 ${c.spans.length - 3} 段` : "");
    warn("head-cross", c.id, `標題「${c.what}」還在畫面上（到 ${c.upTo} 秒），內容穿過它的區域：${list}。標題在接縫的動作進來之前退場，或讓內容繞開標題區；刻意的（標題陪著鏡頭穿過去）回報時說明`, { t: c.spans[0].t0 });
  }
  // 3d. the same composition beat after beat (failure list「每一拍同一個版型」): each beat's key pose against the one before
  const poses = beats.map((b) => { const rs = (b.reads ?? []).filter((r) => r.important && r.t1 > r.t0); return { id: b.id, t: rs.length ? Math.max(...rs.map((r) => r.t1)) - 0.1 : (b.t0 + b.t1) / 2 }; });
  const L = layouts(render, EM, poses), runs = [];
  L.forEach((l, i) => { if (i && l.same >= LAYOUT.same) { const r = runs.at(-1); if (r && r.to === i - 1) r.to = i; else runs.push({ from: i - 1, to: i }); } });
  for (const r of runs.filter((x) => x.to - x.from + 1 >= LAYOUT.run)) {
    const seg = L.slice(r.from, r.to + 1), sims = seg.slice(1).map((l) => l.same.toFixed(2)).join("、");
    add("layout-repeat", `${seg[0].id}–${seg.at(-1).id}`, `${seg.length} 拍連續同一個版型（${seg.map((l) => l.id).join("、")}；和前一拍的相似度 ${sims}，≥ ${LAYOUT.same} 算同一個）：每一拍換構圖，讓這一拍的主角放大、擺到不同位置（failure-list「每一拍同一個版型」；看 layout.txt 與 beats/）`, { t: +seg[0].t.toFixed(2) });
  }
  writeFileSync(join(out, "layout.txt"), `每拍的關鍵姿勢和前一拍的構圖相似度（edge：結構分布重疊、mask：內容遮罩 IoU、same：兩者平均；≥ ${LAYOUT.same} 算同一個版型，連續 ${LAYOUT.run} 拍以上判 FAIL layout-repeat）\n`
    + L.map((l) => `${String(l.id).padEnd(12)} ${l.t.toFixed(2).padStart(6)} 秒  ${l.same === null ? "—" : `same ${l.same.toFixed(2)}  edge ${l.edge.toFixed(2)}  mask ${l.mask.toFixed(2)}${l.same >= LAYOUT.same ? "  ← 同前一拍" : ""}`}`).join("\n") + "\n");
  // 3e. a dissolve at a seam (the one banned hand-over: the old picture and the new one semi-transparent together)
  // a seam with no id is S<n> by its place among all seams (open and close included), as in beat-check and windows()
  const handovers = (S?.seams ?? []).map((m, i) => ({ m, id: String(m.id ?? `S${i + 1}`) })).filter(({ m }) => (m.kind ?? "seam") === "seam" && Number.isFinite(m.t))
    .map(({ m, id }) => ({ id, t: m.t, peak: measured.find((e) => e.type === "seam" && e.id === id)?.t }));
  const DS = handovers.length ? dissolves(render, v, fps, handovers) : [];
  for (const d of DS.filter((x) => x.dissolve))
    add("seam-dissolve", d.id, `接縫 ${d.id}（${d.t} 秒）是溶接：${d.t0}–${d.t1} 秒舊畫面和新畫面同時半透明（變化的地方有 ${Math.round(d.share * 100)}% 在 ${d.at} 秒前後一起淡過去，裡面舊的與新的結構都有：bal ${d.bal}、mix ${d.mix}）。交棒用一個動作：硬切、甩鏡、條狀掃過、色塊在拍上蓋過去都可以，不要原地淡化（看 seams/${safe(d.id)}.jpg）`, { t: d.at });
  writeFileSync(join(out, "dissolve.txt"), `每個接縫最像溶接的一段（share：一起換過去的比例，≥ ${DISSOLVE.share}；bal、mix：舊與新的結構各佔多少，≥ ${DISSOLVE.bal}、${DISSOLVE.mix}；三者都到就是 seam-dissolve）\n`
    + DS.map((d) => `${d.id.padEnd(6)} ${String(d.t).padStart(6)} 秒  ${d.t0 === undefined ? "—（接縫旁沒有從靜到靜的變化）" : `${d.t0}–${d.t1} 秒  share ${d.share.toFixed(2)}  bal ${d.bal.toFixed(2)}  mix ${d.mix.toFixed(2)}${d.dissolve ? "  ← 溶接" : ""}`}`).join("\n") + "\n");
  // 3e2. safe zones, read from the composition (scripts/measure/safe-zone.mjs; hyperframes "Keep it editable"). An earlier film 2026-10-29:
  // the label sat outside title-safe and frame lines ran behind the logo, and nothing measured it (user: 「logo 在哪？主畫面要在哪？」)
  if (existsSync(join(dir, "index.html"))) {
    const sj = join(out, "safe-zone.json");
    const sz = spawnSync(process.execPath, [join(TOOL, "scripts/measure/safe-zone.mjs"), dir, "--json", sj], { encoding: "utf8", timeout: 300000, maxBuffer: 64 << 20 });
    writeFileSync(join(out, "safe-zone.txt"), (sz.stdout || "") + (sz.status ? `\n（量測失敗：${(sz.stderr || "").slice(0, 400)}）\n` : ""));
    const Z = existsSync(sj) ? JSON.parse(readFileSync(sj, "utf8")) : { findings: [] };
    for (const f of Z.findings) {
      if (f.kind === "action") add("safe-zone", `${f.sel}@${f.t}`, `${f.t} 秒「${f.text}」（${f.sel}）進到畫面外圈 5%（action-safe 外，${JSON.stringify(f.box)}）：字收進 title-safe（四邊 10%），要出血就讓它被畫面邊切掉、不要貼邊（safe-zone.txt）`, { t: f.t });
      else if (f.kind === "title") warn("safe-title", `${f.sel}@${f.t}`, `${f.t} 秒「${f.text}」（${f.sel}）在 title-safe（四邊 10%）外 ${JSON.stringify(f.box)}：字卡與重要的字放進 title-safe；Logo 與角標可以在 action-safe 角落`, { t: f.t });
      else if (f.kind === "logo-out") add("safe-zone", `${f.sel}@${f.t}`, `${f.t} 秒 Logo（${f.sel}）在 action-safe 外 ${JSON.stringify(f.box)}`, { t: f.t });
      else if (f.kind === "logo-moved") add("logo-moved", f.sel, `${f.t} 秒 Logo（${f.sel}）進場後移動或縮放：${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}（品牌：進場後不動）`, { t: f.t });
    }
  }
  // 3e3. placement, read from the composition (scripts/measure/layout.mjs): a pair that does not mirror about the centre line, a
  // label off its subject. An earlier film 2026-10-31, beat 03 — hand-computed positions left a name 66 px off its machine and the
  // pair 40 px right of centre (user: 「注意每顆鏡頭的物件、文字、的位置是否合理」)
  if (existsSync(join(dir, "index.html"))) {
    const lj = join(out, "layout.json");
    const ly = spawnSync(process.execPath, [join(TOOL, "scripts/measure/layout.mjs"), dir, "--json", lj], { encoding: "utf8", timeout: 300000, maxBuffer: 64 << 20 });
    writeFileSync(join(out, "layout.txt"), (ly.stdout || "") + (ly.status ? `\n（量測失敗：${(ly.stderr || "").slice(0, 400)}）\n` : ""));
    const Y = existsSync(lj) ? JSON.parse(readFileSync(lj, "utf8")) : { findings: [] };
    for (const f of Y.findings) {
      if (f.kind === "asymmetric") add("asymmetric", `${f.sel}@${f.t}`, `${f.t} 秒成對的 ${f.sel} 沒有以中線對稱：中心 ${f.centres.join("、")}，中點偏 ${f.off} px（> 24）。兩個並排的主體以 x 960 左右對稱，位置從量到的框算，不手算（layout.txt）`, { t: f.t });
      else if (f.kind === "label-off") add("label-off", `${f.sel}@${f.t}`, `${f.t} 秒標籤 ${f.sel} 沒有對準它上下的主體 ${f.subject}：中心 ${f.centres.join(" vs ")}，差 ${f.off} px（> 16）。名稱、說明與註解線的中心對齊主體中心（layout.txt）`, { t: f.t });
      else if (f.kind === "text-overlap") add("text-overlap", `${f.sel}@${f.t}`, `${f.t} 秒 ${f.sel} 和 ${f.other} 重疊 ${f.px.join("×")} px：帶字的東西停定時不互相壓到，間距從量到的框算（縮放後的高度要算進去）（layout.txt）`, { t: f.t });
      else if (f.kind === "uneven-row") add("uneven-row", `${f.sel}@${f.t}`, `${f.t} 秒一排 ${f.n} 個 ${f.sel} 不等距或不等大：間距 ${f.gaps.join("、")}，寬 ${f.widths.join("、")}。同一排等距等寬（grid 用 minmax(0, 1fr)；彈一下的動畫要每格各自回到 1，yoyo 放在 stagger 裡）（layout.txt）`, { t: f.t });
      else if (f.kind === "fill-variable") add("fill-variable", f.family, `補字字型 ${f.family}（${f.file}）是可變字型，會照元素要求的字重畫（未來熒黑 Medium 標 600、看起來約等於 Noto 450），補上的字比旁邊粗：用 fonttools 把補字切成靜態字重（subset 只留那幾個字、varLib.instancer 照墨量對到主字型），每個字重範圍一個 @font-face（layout.txt）`, { t: f.t });
      else if (f.kind === "glyph-fallback") add("glyph-fallback", `${f.text}|${f.font}`, `「${f.text}」有 ${f.glyphs} 個字掉到系統字型 ${f.font}（載入的字型缺字，筆畫粗細會不一樣）：用同源字型另取一個 family 名稱、unicode-range 只補那幾個字，排在字型清單第二位（layout.txt）`, { t: f.t });
    }
  }
  // 3e4. the render against the composition at each key pose (scripts/measure/render-match.mjs): every other measure reads time and
  // motion, and the stills are seeks, so a render drawn wrong passed twice — an earlier film's campaign C (2026-10-29,「C沒出來」)
  // and a later test clip (2026-10-31, motion blur turned a 3D flap to its back face). draft-review FEEDBACK.
  if (existsSync(join(dir, "index.html"))) {
    const at = [...new Set([...beats.flatMap((b) => (b.reads ?? []).filter((r) => r.important && r.t1 > r.t0).map((r) => Math.max(r.t0, r.t1 - 0.1))), ...poses.map((x) => x.t)]
      .filter((t) => Number.isFinite(t) && t >= 0 && t < v.length / fps).map((t) => +t.toFixed(2)))].sort((a, b) => a - b).slice(0, 16);
    if (at.length) {
      const rj = join(out, "render-match.json");
      const rm = spawnSync(process.execPath, [join(TOOL, "scripts/measure/render-match.mjs"), dir, render, "--at", at.join(","), "--json", rj, "--png", join(out, "render-match")], { encoding: "utf8", timeout: 600000, maxBuffer: 64 << 20 });
      writeFileSync(join(out, "render-match.txt"), (rm.stdout || "") + (rm.status ? `\n（量測失敗：${(rm.stderr || "").slice(0, 400)}）\n` : ""));
      const R = existsSync(rj) ? JSON.parse(readFileSync(rj, "utf8")) : { findings: [] };
      for (const f of R.findings) add("render-mismatch", f.t, `${f.t} 秒（${f4(f.frame)}）成片和合成畫的不一樣：${Math.round(f.share * 100)}% 的畫面顏色差很多。seek 截圖是對的、成片畫錯了（少了元素、翻成背面、整塊換色）：看 render-match/${f.t.toFixed(2)}.jpg（左 seek、右成片，紅框是不一樣的地方），找出渲染器和 seek 解讀不同的地方（同一時間的兩個 set、算圖動態模糊、preserve-3d、影片素材）`, { t: f.t });
    }
  }
  // 3e5. the sound against the mastering spec (references/sound.md §4): measured by film-metrics since film C but never gated
  // (2026-10-31 review). Integrated loudness means nothing on an excerpt, so a test clip only holds the true peak (clipping).
  { const L = loudness(render, { ff: FF, fp: FP }), G = GATE.sound;
    if (!L.audio || L.silent) { if (!test) warn("no-audio", "film", `成片${L.audio ? "的音軌是靜音" : "沒有音軌"}：配樂與音效進來之後再量響度（sound.txt）`); }
    else {
      if (!test && L.integrated !== null && Math.abs(L.integrated - G.integrated) > G.integratedTol) add("loudness", "film", `整體響度 ${L.integrated} LUFS，不在 ${G.integrated} ±${G.integratedTol}：母帶的正規化重做到 ${G.integrated} LUFS（sound.md §4；sound.txt）`);
      if (L.truePeak !== null && L.truePeak > G.truePeak) add("true-peak", "film", `真峰值 ${L.truePeak} dBTP（> ${G.truePeak}）：會爆音；限幅器的上限設在 ${G.truePeak} dBTP 以下，短促的音效先收峰值再補能量（sound.md §4）`);
      for (const r of L.rises) warn("loud-jump", r.t, `${r.t} 秒突然變大聲：比前 ${G.jumpWindow} 秒的中位數高 ${r.rise} LU（≥ ${G.jump}）。主角重音（換世界、主角變形）可以，其他地方收小（sound.md §4）`, { t: r.t });
    }
    writeFileSync(join(out, "sound.txt"), !L.audio ? "沒有音軌\n" : `整體響度 ${L.integrated ?? "—"} LUFS（${G.integrated} ±${G.integratedTol}${test ? "，試片不判" : ""}）\n真峰值 ${L.truePeak ?? "—"} dBTP（≤ ${G.truePeak}）\n突然變大聲（≥ ${G.jump} LU）：${L.rises.length ? L.rises.map((r) => `${r.t} 秒 +${r.rise}`).join("、") : "沒有"}${L.silent ? "\n音軌是靜音" : ""}\n`); }
  // 3f. the key subject too small in a mostly empty frame (films only: a test clip is an excerpt, often one small detail)
  const SU = test ? [] : subjects(render, beats.flatMap((b) => (b.reads ?? []).map((r, i) => ({ r, id: `${b.id}#${i + 1}` }))).filter(({ r }) => r.important && r.t1 > r.t0 && r.size !== "small").map(({ r, id }) => ({ id, t: Math.max(r.t0, r.t1 - 0.1) })));
  for (const u of SU.filter((x) => x.small))
    add("subject-small", u.id, `${u.id} 的關鍵姿勢（${u.t} 秒）主體太小、畫面大半是空的：最大的一行字 ${u.line} px、最大的物件 ${u.object} px（1080p，要 ≥ ${SUBJECT.min}），內容只佔畫面 ${Math.round(u.area * 100)}%。把這一拍要看的那一個元素（數字、改過的字、按鈕）放大到畫面的主角，出血也可以（failure-list「重點太小、空白太多」；看 reads/ 的結束那張）`, { t: u.t });
  if (SU.length) writeFileSync(join(out, "subject.txt"), `每個重要讀點的關鍵姿勢（讀點結束前 0.1 秒）：line 最大的一行字、object 最大的物件、subject 取大的（1080p 的像素）；area 有內容的格子比例。subject < ${SUBJECT.min} px 且 area < ${Math.round(SUBJECT.area * 100)}% 判 FAIL subject-small\n`
    + SU.map((u) => `${u.id.padEnd(14)} ${u.t.toFixed(2).padStart(6)} 秒  line ${String(u.line).padStart(4)}  object ${String(u.object).padStart(4)}  subject ${String(u.subject).padStart(4)}  area ${String(Math.round(u.area * 100)).padStart(3)}%${u.small ? "  ← 太小" : ""}`).join("\n") + "\n");
  // 3g. the energy curve and the slideshow risk (films only: a test clip is an excerpt). Calibration: gate.md §1.
  let EN = null, SR = null;
  if (!test) {
    const pct = (x) => `${Math.round(x * 100)}%`, bars = B?.bpm ? `（${B.bpm} BPM，一小節 ${((B.perBar * 60) / B.bpm).toFixed(1)} 秒）` : "";
    EN = energy(v, fps, { bpm: B?.bpm, perBar: B?.perBar ?? 4 });
    if (!EN.checks.hook) warn("energy-hook", "open", `開場 ${ENERGY.hook} 秒內沒有清楚的事件（第一個在 ${EN.hook ?? "—"} 秒）：前 3 秒要有一個看得見的動作或揭曉，不要先擺著（energy.txt）`, { t: EN.hook ?? 0 });
    if (!EN.checks.sag) add("energy-sag", "middle", `中段（${EN.middle.t0}–${EN.middle.t1} 秒）只有 ${pct(EN.middle.active)} 的秒數在動（每秒平均動態 ≥ ${ENERGY.active}；要 ≥ ${pct(ENERGY.sag)}）：片子前面衝完就塌了，中段要有一次爆發（最密的一段在片長 30–60%）。E 片 draft 28、35 是 21%（使用者：「有點怪 沒有讓我很驚艷」），D 片、C 片 ≥ 40%（energy.txt）`, { t: EN.middle.t0 });
    if (!EN.checks.dense) warn("energy-dense", "dense", `最密的一段（片長 ${pct(ENERGY.dense)}，${EN.dense.t0}–${EN.dense.t1} 秒）在片長 ${pct(EN.dense.at)}，不在 30–60%：最密的地方太早或太晚（energy.txt）`, { t: EN.dense.t0 });
    if (!EN.checks.peak) warn("energy-peak", "peak", `最大的高峰（${EN.peak.t0}–${EN.peak.t1} 秒）在片長 ${pct(EN.peak.at)}，不在 75–90%：最大的視覺高峰留給後段（energy.txt）`, { t: EN.peak.t0 });
    for (const g of EN.gaps) warn("energy-gap", g.t0.toFixed(2), `${g.t0.toFixed(2)}–${g.t1.toFixed(2)} 秒 ${g.bars} 小節沒有新事件${bars}：超過 ${ENERGY.gapBars} 小節沒有新東西（設計好的停頓除外；energy.txt）`, { t: g.t0 });
    writeFileSync(join(out, "energy.txt"), [`能量曲線（每秒平均動態，60 fps 尺度，一格截在 ${ENERGY.clip}）：片長 ${EN.T} 秒${bars}${EN.arc ? "" : `；短於 ${ENERGY.minLen} 秒，不判起伏`}`,
      "  " + EN.seconds.map((e) => " ▁▂▃▄▅▆▇█"[Math.min(8, Math.round(e))]).join(""),
      `  ${EN.seconds.map((e, i) => `${i}:${e}`).join(" ")}`,
      `事件 ${EN.events.length}（${(EN.events.length / EN.T * 10).toFixed(1)} 個／10 秒）：${EN.events.join(" ")}`,
      `hook   第一個事件 ${EN.hook ?? "—"} 秒（≤ ${ENERGY.hook}）${EN.checks.hook ? "" : "  ← WARN energy-hook"}`,
      `middle 中段 ${EN.middle.t0}–${EN.middle.t1} 秒：${pct(EN.middle.active)} 的秒數 ≥ ${ENERGY.active}，平均 ${EN.middle.mean}（≥ ${pct(ENERGY.sag)}）${EN.checks.sag ? "" : "  ← FAIL energy-sag"}`,
      `dense  最密的 ${pct(ENERGY.dense)}：${EN.dense.t0}–${EN.dense.t1} 秒，片長 ${pct(EN.dense.at)}，${EN.dense.level}（30–60%）${EN.checks.dense ? "" : "  ← WARN energy-dense"}`,
      `peak   最大的 ${ENERGY.peakWin} 秒：${EN.peak.t0}–${EN.peak.t1} 秒，片長 ${pct(EN.peak.at)}，${EN.peak.level}（75–90%）${EN.checks.peak ? "" : "  ← WARN energy-peak"}`,
      `gap    超過 ${ENERGY.gapBars} 小節沒有事件：${EN.checks.gap === null ? "—（沒有 BPM）" : EN.gaps.length ? EN.gaps.map((g) => `${g.t0}–${g.t1} 秒 ${g.bars} 小節`).join("、") + "  ← WARN energy-gap" : "沒有"}`, ""].join("\n"));
    SR = slideRisk(v, fps, pictureStats(render), L);
    const parts = `快速動態的格 ${pct(SR.fast)}（< ${SLIDE.fastOk * 100}% 開始算風險，≤ ${SLIDE.fastFail * 100}% 滿分）→ ${SR.parts.motion}；中段空畫面 ${SR.blanks.length} 段 → ${SR.parts.blank}；相鄰兩拍同版型 ${SR.repeats}/${SR.pairs} → ${SR.parts.repeat}`;
    if (!EN.arc) { /* shorter than ENERGY.minLen: written, not judged */ }
    else if (SR.score >= SLIDE.fail) add("slide-risk", "film", `投影片風險 ${SR.score}（≥ ${SLIDE.fail}）：${parts}。整支像在翻簡報：讓畫面一直有事發生、每拍換構圖、不要空畫面（slide.txt）`);
    else if (SR.score >= SLIDE.warn) warn("slide-risk", "film", `投影片風險 ${SR.score}（≥ ${SLIDE.warn} 提醒，≥ ${SLIDE.fail} 擋）：${parts}（slide.txt）`);
    if (EN.arc) for (const b of SR.blanks) warn("slide-blank", b.t0.toFixed(2), `${b.t0}–${b.t1} 秒是幾乎純色的空畫面（${(b.t1 - b.t0).toFixed(2)} 秒 ≥ ${SLIDE.blankMin}）：中段的空畫面像換頁，確認是設計好的黑場（slide.txt）`, { t: b.t0 });
    if (EN.arc && SR.violet > SLIDE.violetShare) warn("slide-violet", "film", `${pct(SR.violet)} 的畫面一半以上是藍紫色（> ${pct(SLIDE.violetShare)}）：藍紫漸層底是 AI 片的記號；品牌是紫色所以只提醒，紫色留給重點，底換成中性色或分段換（slide.txt）`);
    writeFileSync(join(out, "slide.txt"), [`投影片風險 ${SR.score}${EN.arc ? "" : `（短於 ${ENERGY.minLen} 秒，不判）`}（${SLIDE.warn} 提醒、${SLIDE.fail} 擋；= 100 ×（${SLIDE.weights.motion} 動態 + ${SLIDE.weights.blank} 空畫面 + ${SLIDE.weights.repeat} 版型重複））`,
      `動態    快速動態的格（60 fps 尺度動態 ≥ ${SLIDE.fast}）${pct(SR.fast)} → ${SR.parts.motion}`,
      `空畫面  中段 ≥ ${SLIDE.blankMin} 秒的純色畫面 ${SR.blanks.length} 段${SR.blanks.length ? `：${SR.blanks.map((b) => `${b.t0}–${b.t1}`).join("、")}` : ""} → ${SR.parts.blank}`,
      `版型    相鄰兩拍同版型（layout.txt same ≥ ${LAYOUT.same}）${SR.repeats}/${SR.pairs} → ${SR.parts.repeat}`,
      `藍紫    一半以上是藍紫色的畫面 ${pct(SR.violet)}（> ${pct(SLIDE.violetShare)} 提醒，不計分）`, ""].join("\n"));
  }
  // 4. holds, measured: after a beat's last read, how long until the render changes again
  const starts = onsets(v, fps).map((k) => k / fps), peaks = measured.filter((e) => e.type === "seam").map((e) => e.t), end = v.length / fps;
  const withReads = beats.filter((b) => b.reads?.length), lastBeat = withReads.at(-1), holds = [];
  for (const b of withReads) {
    // the hold ends at the first real change (an onset or a seam's peak), or where the picture starts moving again (3 frames over HOLD)
    // a read counts until it is read (t0 + what it needs), not until the t1 written in the plan: a padded t1 hid the 03 hold
    // (an earlier film 2026-10-31, the last read written to 19.9 s; user: 「這個審片怎麼會過0:18-0:20畫面停留太久？」)
    const lastEnd = Math.max(...b.reads.map((r) => Math.min(r.t1, r.t0 + readNeed(r)))), k0 = Math.round(lastEnd * fps);
    let k = k0; while (k < v.length && !(v[k] >= HOLD && (v[k + 1] ?? HOLD) >= HOLD && (v[k + 2] ?? HOLD) >= HOLD)) k++;
    const next = Math.min(k / fps, ...[...starts, ...peaks].filter((t) => t > lastEnd + 1 / fps), end);
    const idle = Math.max(0, next - lastEnd), limit = b === lastBeat ? GATE.holdLimitLast : GATE.holdLimit;
    holds.push({ beat: b.id, lastEnd, next: +next.toFixed(3), idle: +idle.toFixed(3), limit });
    if (idle > limit + 0.05) add("hold-long", b.id, `${b.id}：最後一個讀點 ${lastEnd.toFixed(2)} 秒看完，成片到 ${next.toFixed(2)} 秒才有下一個變化，停了 ${idle.toFixed(2)} 秒（> ${limit}）：停太久`, { t: +lastEnd.toFixed(2) });
  }
  // 4b. a still stretch inside the reads: the part that no read still needs is a hold like any other (same limit as hold-long)
  const allReads = beats.flatMap((b) => (b.reads ?? []).map((r) => ({ b, r, need: r.t0 + readNeed(r) })));
  for (const c of calmRuns(v, fps, GATE.holdLimit)) {
    const over = allReads.filter(({ r }) => r.t0 < c.t1 && r.t1 > c.t0);
    if (!over.length) continue;   // no read here: dead-hold warns below
    const needed = Math.max(c.t0, ...over.map((x) => x.need)), idle = c.t1 - needed, b = over.at(-1).b;
    const limit = b === lastBeat && c.t1 >= end - 1 / fps && !test ? GATE.holdLimitLast : GATE.holdLimit;
    if (idle > limit + 0.05 && !holds.some((h) => h.beat === b.id && h.idle > h.limit + 0.05))
      add("hold-long", `${b.id}@${needed.toFixed(2)}`, `${b.id}：${c.t0.toFixed(2)}–${c.t1.toFixed(2)} 秒畫面靜止，讀點到 ${needed.toFixed(2)} 秒就讀完，之後又停了 ${idle.toFixed(2)} 秒（> ${limit}）：停太久（讀點寫得比需要的長，蓋不掉停留）`, { t: +needed.toFixed(2) });
  }
  // 4c. one composition held too long: between two big moves (camera, scene change, the subject moving) only small things change
  // (a line drawn, a word rising). An earlier film 2026-10-31, beat 03: 14.1–19.0 s the same two-machine picture while small labels
  // changed — every hold and read rule passed (user: 「這幕還是停留太久，原因是什麼？」). The film's last stretch (end card) is exempt.
  { const W = Math.round(0.5 * fps), roll = v.map((_, k) => v.slice(k, k + W).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(W, v.length - k)));
    // a big move: one strong frame (a cut, a whip, the camera), or the subject moving steadily for half a second (a glide)
    let last = 0; const big = []; for (let k = 0; k < v.length; k++) if (v[k] >= GATE.bigMove || roll[k] >= REAL) { const t = k / fps; if (t - last > GATE.staticShot) big.push([last, t]); last = t; }
    if (test && end - last > GATE.staticShot) big.push([last, end]);
    for (const [a, z] of big) add("static-shot", a.toFixed(2), `${a.toFixed(2)}–${z.toFixed(2)} 秒同一個構圖 ${(z - a).toFixed(1)} 秒（> ${GATE.staticShot}）：中間沒有大動作（鏡頭、換場、主體移動），只有小東西在變，看起來停住了。讓一個主角推近或換構圖，或把下一件事提前`, { t: +a.toFixed(2) }); }
  // 5. taste, measured (warnings): seam speed contrast, the plan against the render, holds with nothing in them
  const seamC = [];
  for (const e of measured.filter((x) => x.type === "seam" && x.kind === "seam")) {
    const c = contrast(v, fps, e.t - 0.5, e.t + 0.7); seamC.push({ id: e.id, t: e.t, contrast: c && +c.toFixed(2) });
    if (c !== null && c < GATE.contrastMin) warn("seam-contrast", e.id, `接縫 ${e.id}（${e.t} 秒）的爆衝只有周圍的 ${c.toFixed(1)} 倍（要 2–3 倍：慢 → 爆衝 → 滑停）`, { t: e.t });
  }
  for (const b of beats) for (const [i, r] of (b.reads ?? []).entries()) {
    if (!r.important || !(r.t1 > r.t0)) continue;
    const settle = r.kind === "motion" ? r.act ?? r.t0 + 0.33 : r.t0 + 0.4, hit = starts.find((t) => t > settle + 0.1 && t < r.t1 - 0.1);
    if (hit !== undefined) warn("plan-mismatch", `${b.id}#${i + 1}`, `${b.id} 讀點 ${i + 1}「${r.what}」計畫看到 ${r.t1} 秒，成片在 ${hit.toFixed(2)} 秒就有新的動作：讀點表和成片對不上（改讀點表，或讓那個動作等它）`, { t: +hit.toFixed(2) });
  }
  const readSpans = beats.flatMap((b) => (b.reads ?? []).map((r) => [r.t0, r.t1]));
  for (const c of calmRuns(v, fps, GATE.deadHold)) if (!readSpans.some(([a, z]) => a < c.t1 && z > c.t0))
    warn("dead-hold", c.t0.toFixed(2), `${c.t0.toFixed(2)}–${c.t1.toFixed(2)} 秒停了 ${(c.t1 - c.t0).toFixed(1)} 秒，裡面沒有讀點：沒有事件的畫面`, { t: +c.t0.toFixed(2) });
  writeFileSync(join(out, "motion-profile.txt"), `${basename(render)}  fps ${fps.toFixed(0)}  stutters ${P.stutters.length} ${JSON.stringify(P.stutters.slice(0, 12).map((s) => [s.t, s.frames]))}  spikes ${JSON.stringify(P.spikes.slice(0, 12))}  still at the end ${P.stillTail.toFixed(1)} s\n  ${P.spark}\n`
    + `  snaps ${Jm.snaps.length} ${JSON.stringify(Jm.snaps.slice(0, 12).map((j) => [j.t, j.k]))}  pops ${Jm.pops.length} ${JSON.stringify(Jm.pops.slice(0, 12).map((j) => [j.t, j.k]))}  flashes ${FLs.length} ${JSON.stringify(FLs.slice(0, 12).map((x) => [x.t, x.k, x.frames]))}  (seconds, frame)\n`);
  const motion = motionFindings({ dir, out, S, v, fps, add, warn });
  return { motion, S, fps, v, P, B, F, holds, seamC, starts, J: Jm, FL: FLs, crossings, layouts: L, dissolves: DS, subjects: SU, energy: EN, slide: SR };
}

// ---------- the timing chart: planned reads and seams against the measured motion
function timingChart({ S, fps, v, B, F, holds, starts }, out, png) {
  const beats = S.beats ?? [], end = v.length / fps, mv = v.filter((x) => x > 0.15).sort((a, b) => a - b), top = Math.max(mv[Math.floor(mv.length * 0.95)] ?? 0, 1e-9), bpm = B?.bpm, off = B?.offset ?? 0, perBar = B?.perBar ?? 4;
  const bins = (t0, n) => Array.from({ length: n }, (_, i) => Math.max(0, ...v.slice(Math.round((t0 + i * 0.1) * fps), Math.round((t0 + (i + 1) * 0.1) * fps))));
  const spark = (xs) => xs.map((x) => " ▁▂▃▄▅▆▇█"[Math.min(8, Math.trunc((x / top) * 8))]).join("");
  const peaks = (B?.events ?? []).filter((e) => e.source === "render" && e.type === "seam");
  const lines = ["# 計畫 vs 成片（每格 0.1 秒）", "", "動態：成片每 0.1 秒的最大動態量（█ = 全片前 5% 的動態）。變化 ▲：成片上新動作開始的地方。接縫：◆ 寫的、◇ 量到的峰值（◈ 兩者同格）。拍：' 拍點、| 小節線。",
    "讀點（t 字、v 畫面、m 動作）：├ 找得到（t0）、● 動作落定（act）、┤ 看懂（t1）；━ 重要、─ 次要。", ""];
  for (const b of beats) {
    const t0 = Math.max(0, Math.min(b.t0, ...(b.reads ?? []).map((r) => r.t0)) - 0.3), t1 = Math.min(end, b.t1 + 0.6), n = Math.max(1, Math.round((t1 - t0) / 0.1));
    const col = (t) => Math.round((t - t0) / 0.1), lane = () => Array(n).fill(" "), put = (L, t, ch) => { const c = col(t); if (c >= 0 && c < n) L[c] = ch; };
    const grid = lane(); if (bpm) for (let k = Math.ceil(((t0 - off) * bpm) / 60); off + (k * 60) / bpm < t1; k++) put(grid, off + (k * 60) / bpm, ((k % perBar) + perBar) % perBar === 0 ? "|" : "'");
    const st = lane(); for (const t of starts) put(st, t, "▲");
    const sm = lane(); for (const m of S.seams ?? []) put(sm, m.t, "◆"); for (const p of peaks) { const c = col(p.t); if (c >= 0 && c < n) sm[c] = sm[c] === "◆" ? "◈" : "◇"; }
    const h = holds.find((x) => x.beat === b.id), fails = F.filter((f) => f.level === "FAIL" && (f.id === String(b.id) || f.id.startsWith(`${b.id}#`)));
    lines.push(`## ${b.id}（${b.t0}–${b.t1} 秒）${fails.length ? `  ✗ ${fails.length}` : ""}`, "```", `時間    從 ${t0.toFixed(1)} 秒起，每格 0.1 秒`, `拍      ${grid.join("")}`, `動態    ${spark(bins(t0, n))}`, `變化    ${st.join("")}`, `接縫    ${sm.join("")}`);
    (b.reads ?? []).forEach((r, i) => {
      const L = lane(), a = col(r.t0), z = col(r.t1);
      for (let c = Math.max(0, a); c <= Math.min(n - 1, z); c++) L[c] = r.important ? "━" : "─";
      put(L, r.t0, "├"); put(L, r.t1, "┤"); if (r.kind === "motion") put(L, r.act ?? r.t0 + 0.33, "●");
      lines.push(`${String(i + 1).padStart(2)} ${(r.kind ?? "visual").slice(0, 1)}    ${L.join("")}  ${r.what ?? ""}${r.important ? "" : "（次要）"}`);
    });
    if (h) lines.push(`停留    最後讀點 ${h.lastEnd.toFixed(2)} → 成片的下一個變化 ${h.next.toFixed(2)}：${h.idle.toFixed(2)} 秒（上限 ${h.limit}）${h.idle > h.limit + 0.05 ? " ✗" : ""}`);
    lines.push("```", ...fails.map((f) => `- ✗ ${f.msg}`), "");
  }
  writeFileSync(join(out, "timing.txt"), lines.join("\n"));
  // the SVG: the whole film on one strip
  const PX = 30, W = Math.ceil(end * PX) + 140, laneH = 14, rows = beats.reduce((s, b) => s + Math.max(1, (b.reads ?? []).length), 0), H = 150 + rows * laneH + beats.length * 6;
  const x = (t) => 120 + t * PX, esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, 'PingFang TC', sans-serif" font-size="10"><rect width="100%" height="100%" fill="#fff"/>`];
  if (bpm) for (let k = 0; off + (k * 60) / bpm <= end; k++) { const t = off + (k * 60) / bpm; svg.push(`<line x1="${x(t)}" x2="${x(t)}" y1="20" y2="${H - 10}" stroke="${k % perBar ? "#eee" : "#ccc"}"/>`); }
  for (let s = 0; s <= end; s += 5) svg.push(`<text x="${x(s)}" y="14" fill="#888">${s}s</text>`);
  svg.push(`<text x="4" y="70" fill="#444">動態</text><polyline fill="none" stroke="#5b4bdb" stroke-width="1" points="${v.map((y, k) => `${x(k / fps).toFixed(1)},${(100 - Math.min(1.3, y / top) * 54).toFixed(1)}`).join(" ")}"/>`);
  for (const t of starts) svg.push(`<line x1="${x(t)}" x2="${x(t)}" y1="100" y2="104" stroke="#5b4bdb"/>`);
  for (const m of S.seams ?? []) svg.push(`<path d="M${x(m.t)} 104 l-4 8 h8 z" fill="#333"><title>${esc(m.id)} 寫的 ${m.t}</title></path>`);
  for (const p of peaks) svg.push(`<circle cx="${x(p.t)}" cy="118" r="3.5" fill="none" stroke="#5b4bdb"><title>${esc(p.id)} 峰值 ${p.t}</title></circle>`);
  let y = 132;
  for (const b of beats) {
    const n = Math.max(1, (b.reads ?? []).length);
    svg.push(`<text x="4" y="${y + 10}" fill="#222">${esc(b.id)}</text><rect x="${x(b.t0)}" y="${y}" width="${(b.t1 - b.t0) * PX}" height="${n * laneH}" fill="#f6f6f8"/>`);
    (b.reads ?? []).forEach((r, i) => {
      const yy = y + i * laneH + 3, color = { text: "#1f7a4d", visual: "#2b6cb0", motion: "#b7791f" }[r.kind ?? "visual"] ?? "#555";
      svg.push(`<rect x="${x(r.t0)}" y="${yy}" width="${Math.max(1, (r.t1 - r.t0) * PX)}" height="${laneH - 5}" fill="${color}" opacity="${r.important ? 0.85 : 0.35}"><title>${esc(r.what)} ${r.t0}–${r.t1}</title></rect>`);
      if (r.kind === "motion") svg.push(`<circle cx="${x(r.act ?? r.t0 + 0.33)}" cy="${yy + (laneH - 5) / 2}" r="2.5" fill="#000"/>`);
    });
    const h = holds.find((q) => q.beat === b.id);
    if (h) svg.push(`<line x1="${x(h.lastEnd)}" x2="${x(h.next)}" y1="${y + 1}" y2="${y + 1}" stroke="${h.idle > h.limit + 0.05 ? "#d00" : "#999"}" stroke-width="2"><title>停 ${h.idle.toFixed(2)} 秒</title></line>`);
    y += n * laneH + 6;
  }
  for (const f of F.filter((q) => q.level === "FAIL" && typeof q.t === "number")) svg.push(`<text x="${x(f.t) - 3}" y="128" fill="#d00" font-size="12">✗<title>${esc(f.msg)}</title></text>`);
  svg.push("</svg>");
  writeFileSync(join(out, "timing.svg"), svg.join("\n"));
  if (!png) return;
  try {   // a PNG beside it, so it can be looked at like the sheets (needs the HyperFrames browser; skipped quietly without it)
    const exe = execFileSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30000 }).trim().split("\n").pop();
    const js = `const m = await import(${JSON.stringify(require.resolve("playwright-core"))}), chromium = m.chromium ?? m.default.chromium; const b = await chromium.launch({ executablePath: ${JSON.stringify(exe)} });
      const p = await b.newPage({ viewport: { width: ${W}, height: ${H} } }); await p.goto(${JSON.stringify("file://" + join(out, "timing.svg"))}); await p.screenshot({ path: ${JSON.stringify(join(out, "timing.png"))} }); await b.close();`;
    spawnSync(process.execPath, ["--input-type=module", "-e", js], { timeout: 60000 });
  } catch { /* no browser: timing.txt and timing.svg are enough */ }
}

// ---------- the checklist
function failureList() {
  return readFileSync(FAILURE_LIST, "utf8").split("\n").filter((l) => /^- \*\*/.test(l)).map((l) => l.replace(/^- /, ""));
}
// The checklist keeps only what nothing else checks (2026-10-29, the user approved trimming it:「一鏡到底，是個方法，但不應該是限制，
// 你先改吧！」): per-beat, per-seam and per-read questions are covered by the measures (timing, seams, reads, layout, subject,
// dissolve, energy) and by the independent review, which looks at beats/ and seams/ with fresh eyes. What stays: the failure
// list as checkboxes, whether the film's first event reads at first glance, and one summary against the rulers.
function checklist({ dir, render, scriptFile, out, W, F }) {
  const rng = (w) => (w?.frames?.length ? `${f4(w.frames[0])}–${f4(w.frames.at(-1))}` : "—");
  const fails = F.filter((f) => f.level === "FAIL"), warns = F.filter((f) => f.level === "WARN"), reads = Object.values(W).filter((w) => w?.key);
  const first = reads.reduce((a, w) => (a && a.r.t0 <= w.r.t0 ? a : w), null);   // the story's first event: reads at first glance (reads-and-beat §10)
  return [
    `# 審片清單：${relative(dir, render)}`, "",
    `片子 \`${dir}\`，腳本 \`${scriptFile}\`，${new Date().toISOString().slice(0, 10)} 產生。這是給使用者看之前的關卡（/video-draft-review）。`, "",
    "- 每一格都要勾。每個「答：」寫一句話，並**引用這一項自己那張表或靜圖上的影格編號**（每格左上角的 `f0732`）；沒有影格、或影格不在這一項的範圍裡，就不算答。",
    "- 沒過的寫「沒過：…」（一樣要引用影格），回報時說出來；這是品味項目，只會變成提醒。",
    "- §1 常見失敗：看過、沒有就勾 `[x]`；有就改成 `[!]`，並寫在哪幾格（例如 `[!] **標題擋住畫面** … f1732、f1740：標題蓋住緞帶`）。",
    "- 每一拍、每個接縫、每個讀點不再逐題問：量測（`timing.txt`、`dissolve.txt`、`layout.txt`、`subject.txt`、`energy.txt`）和獨立審片（`INDEPENDENT.md`）看它們。審片時照樣逐格看 `beats/`、`seams/`、`reads/`，看到的寫進 §1 的 `[!]`。",
    `- 量測的 FAIL 不能用勾的放行：修掉，或由使用者豁免（\`${relative(process.cwd(), join(dir, "review-waivers.json"))}\`，要有使用者的原話）。`,
    `- 填完跑 \`node <tool>/scripts/review-pack.mjs --check ${relative(process.cwd(), out) || "."}\`，結束代碼 0 才算過，會寫出綁定這一版 render 的 \`PASS.json\`。`, "",
    `## 量測（自動判定：FAIL ${fails.length}、WARN ${warns.length}；細節見 \`timing.txt\`、\`energy.txt\`、\`slide.txt\`、\`beat-check.txt\`、\`lint.txt\`）`, "",
    ...(fails.length ? fails.map((f) => `- ✗ \`${f.code}\` ${f.id}：${f.msg}`) : ["- ✓ 沒有量測上的 FAIL"]),
    ...warns.slice(0, 30).map((f) => `- △ \`${f.code}\` ${f.id}：${f.msg}`), ...(warns.length > 30 ? [`- △ …還有 ${warns.length - 30} 項，見 pack.json`] : []), "",
    "## 1. 全片（`sheet.jpg`，一秒一格；`beats/`、`seams/` 逐格）：看起來像生成的？", "", ...failureList().map((l) => `- [ ] ${l}`), "",
    "## 2. 第一個畫面（`reads/` 開始那張）", "",
    ...(first ? [`- [ ] **${first.label}**（${first.r.t0}–${first.r.t1} 秒；\`reads/${first.key}-start.jpg\` ${f4(first.start)}、\`reads/${first.key}-end.jpg\` ${f4(first.end)}） <!-- read:${first.key} -->`,
      "  這是片子的第一件事：單看開始那張，讀得出來發生了什麼嗎？標題是不是在它之後才來？", "  答："]
      : ["- （沒有重要讀點：量測已判 FAIL `no-reads`）"]), "",
    "## 3. 和尺並排（必過；`ruler/side-by-side.jpg`：上面是這支片每一拍一格，下面每一列是一把尺；`ruler/metrics.txt`）", "",
    "- 差距大的寫「沒過：…」並回到製作改（video-direction 的構圖、video-motion-craft 的動態），回報時說出來；不能只寫「看過」。", "",
    ...(W.ruler ? [`- [ ] **和尺比**（${rng(W.ruler)}）：${RULER_QS.map(([k]) => k).join("、")}（${RULER_QS.map(([, q]) => q.split("？")[0]).join("；")}）——差最多的是哪一項、差在哪？ <!-- ruler -->`, "  答："]
      : ["- （沒有拍可以對照：量測已判 FAIL）"]), "",
  ].join("\n");
}

/** Parse a filled checklist: what is still open, which answers do not cite frames of their own window, what was flagged. */
export function readChecklist(md, W) {
  const problems = [], taste = [], all = new Set(W.all); let key = null, label = "";
  const cites = (s) => [...s.matchAll(/\bf(\d{1,6})\b/g)].map((m) => +m[1]);
  for (const line of md.split("\n")) {
    const box = line.match(/^\s*- \[( |x|X|!)\] (.*)$/);
    if (box) {
      const k = line.match(/<!-- (\S+) -->/); key = k ? k[1] : null; label = box[2].replace(/<!--.*-->/, "").trim().slice(0, 50);
      if (box[1] === " ") problems.push(`沒勾：${label}`);
      if (box[1] === "!") {
        const c = cites(line.replace(/（[^）]*f\d{4}–f\d{4}[^）]*）/g, "")), bad = c.filter((x) => !all.has(x));
        if (!c.length) problems.push(`[!] 沒寫在哪幾格：${label}`); else if (bad.length) problems.push(`[!] 引用的影格不在審片包裡（${bad.map(f4).join("、")}）：${label}`);
        taste.push({ item: label, note: box[2].replace(/<!--.*-->/, "").trim() });
      }
      continue;
    }
    const a = line.match(/^\s*答：(.*)$/);
    if (!a) continue;
    const text = a[1].trim(), w = key && W[key];
    if (!text) { problems.push(`沒答：${label}`); continue; }
    const c = cites(text);
    if (!c.length) { problems.push(`答案沒有引用影格（寫出看的是哪一格，例如 ${w?.frames?.length ? f4(w.frames[0]) : "f0732"}）：${label}`); continue; }
    const notInPack = c.filter((x) => !all.has(x)), notHere = w ? c.filter((x) => all.has(x) && !w.frames.includes(x)) : [];
    if (notInPack.length) problems.push(`引用的影格不在審片包裡（${notInPack.map(f4).join("、")}）：${label}`);
    else if (notHere.length) problems.push(`引用的影格不在這一項的表或靜圖裡（${notHere.map(f4).join("、")}；這一項是 ${f4(w.frames[0])}…${f4(w.frames.at(-1))}）：${label}`);
    if (/^沒過/.test(text)) taste.push({ item: label, note: text });
  }
  return { problems, taste };
}

export const INDEPENDENT_TEMPLATE = [
  "# 獨立審片", "",
  "由**沒有參與製作**的審片者填：新開一個 subagent，只給它這個審片包（sheet.jpg、beats/、seams/、reads/、crops/、timing.txt，有的話 refs/ 與 refs.txt）、`direction/script.json` 和 failure-list.md，",
  "不給 CHECKLIST.md 的答案，也不給製作過程的對話。它找問題，不打分數；它說沒問題，不代表使用者會滿意。", "",
  "- 每個發現一行，寫在最後的「發現」標題底下，引用它看的影格（每格左上角的 f0732）：`- [!] 46.03 紙飛機一格縮成小點 f2761 f2762`",
  "- 製作方在每個 [!] 的下一行回：`  處理：修了，見 draft-N+1` 或 `  處理：交給使用者判斷，回報裡問` 或 `  處理：不同意，因為 …`（量得出來的問題要修，不能只回不同意）",
  "- 沒有發現也要寫一行 `- [ok] 看過全片與每個接縫 f0120 f2761`，引用它看過的影格",
  "- 有 refs/ 時（拍或接縫綁了參考）：每一處對照 refs.txt 的「借什麼」逐項比，比參考差的寫成 [!]（`- [!] 接縫 S2 參考的條掃過後新畫面緊跟，這裡隔了一段空白 refs/seam-S2.jpg`）", "",
  "審片者：", "",
  "## 先看片，再讀那一句話", "",
  "審片者先只看 sheet.jpg 和 beats/（還沒讀 script.json 的 message、還沒聽製作方說這支片要講什麼），寫下：", "",
  "這支片在說什麼：", "最記得的一刻：", "哪裡無聊：", "",
  "之後才讀那一句話（script.json 的 message），寫：", "",
  "對得上嗎：", "",
  "- 對不上、或說不出最記得的一刻（「沒有」），就在「發現」裡寫一行 [!]（使用者：「不確定你想要表達什麼」「我覺得我沒有被驚艷到」）。", "",
  "## 發現", "",
].join("\n");
// the first-impression answers (before the reviewer reads the one sentence)
export const FIRST_LOOK = [["say", "這支片在說什麼"], ["moment", "最記得的一刻"], ["boring", "哪裡無聊"], ["match", "對得上嗎"]];

/** INDEPENDENT.md: a named reviewer, at least one finding, every finding cites frames in the pack, every [!] has a 處理. */
export function readIndependent(md, all) {
  const problems = [], found = [], inPack = new Set(all);
  const reviewer = md.match(/^審片者：[ \t]*(.*)$/m)?.[1]?.trim() ?? "";
  if (!reviewer) problems.push("INDEPENDENT.md 沒寫審片者（誰看的：例如「fresh subagent（general-purpose）」）");
  const body = md.split(/^## 發現[ \t]*$/m)[1] ?? "";
  let cur = null;
  for (const line of body.split("\n")) {
    const it = line.match(/^\s*- \[(!|ok)\] (.*)$/);
    if (it) { cur = { level: it[1], note: it[2].trim(), response: null }; found.push(cur); continue; }
    const r = line.match(/^\s*處理：(.*)$/);
    if (r && cur) cur.response = r[1].trim() || null;
  }
  if (!found.length) problems.push("INDEPENDENT.md 沒有任何發現或 [ok]：獨立審片還沒做");
  const head = md.split(/^## 發現[ \t]*$/m)[0], first = {};
  for (const [k, label] of FIRST_LOOK) {
    first[k] = head.match(new RegExp(`^${label}：[ \\t]*(.*)$`, "m"))?.[1]?.trim() ?? "";
    if (!first[k]) problems.push(`INDEPENDENT.md 沒答「${label}」：審片者先只看 sheet.jpg 與 beats/ 寫下這支片在說什麼、最記得的一刻、哪裡無聊，讀了那一句話再寫對不對得上（video-draft-review 第 6 步）`);
  }
  const none = /^(沒有|無|没有|none|nothing|說不出|-|—)[。.]?$/i;
  if (first.moment && none.test(first.moment) && !found.some((f) => f.level === "!")) problems.push("審片者說不出最記得的一刻，「發現」裡卻沒有 [!]：沒有驚艷的那一刻本身就是一個發現");
  if (first.match && /^(否|不|對不上|沒有|no)/i.test(first.match) && !found.some((f) => f.level === "!")) problems.push("審片者說對不上那一句話，「發現」裡卻沒有 [!]");
  for (const f of found) {
    const c = [...f.note.matchAll(/\bf(\d{1,6})\b/g)].map((m) => +m[1]), bad = c.filter((x) => !inPack.has(x)), label = f.note.slice(0, 50);
    if (!c.length) problems.push(`獨立審片沒引用影格：${label}`);
    else if (bad.length) problems.push(`獨立審片引用的影格不在審片包裡（${bad.map(f4).join("、")}）：${label}`);
    if (f.level === "!" && !f.response) problems.push(`獨立審片的發現還沒回「處理：」：${label}`);
  }
  return { reviewer, first, findings: found.filter((f) => f.level === "!").map(({ note, response }) => ({ note, response })), problems };
}

/** A waiver counts only when the user gave it: their words in "quote", and approved_by is not the model. */
export const validWaiver = (w) => !!(w && w.check && w.approved_by && w.quote && !/claude|assistant|agent|^ai$|模型|助理/i.test(String(w.approved_by)));
export function applyWaivers(F, waivers) {
  const ok = (Array.isArray(waivers) ? waivers : []).filter(validWaiver);
  return F.map((f) => { const w = f.level === "FAIL" && ok.find((x) => x.check === f.code && (x.id === undefined || String(x.id) === f.id)); return w ? { ...f, level: "WAIVED", waiver: w } : f; });
}

// ---------- --check: the gate
function check(outArg) {
  const out = resolve(outArg ?? "review"), pack = readJSON(join(out, "pack.json")), passFile = join(out, "PASS.json");
  const fail = (msgs) => { rmSync(passFile, { force: true }); console.log(`✗ 審片沒過（${msgs.length} 項）`); msgs.slice(0, 40).forEach((m) => console.log("  " + m)); if (msgs.length > 40) console.log(`  …還有 ${msgs.length - 40} 項`); process.exit(1); };
  if (!pack) fail([`沒有 ${join(out, "pack.json")}：先跑 review-pack.mjs <dir> <render>`]);
  if (!existsSync(pack.render)) fail([`render 不見了：${pack.render}`]);
  const sha = sha256(pack.render);
  if (sha !== pack.sha256) fail([`render 在做審片包之後改過了（sha256 ${sha.slice(0, 12)} ≠ 審片包的 ${pack.sha256.slice(0, 12)}）：重跑 review-pack.mjs ${relative(process.cwd(), pack.dir) || "."} ${relative(process.cwd(), pack.render)}`]);
  const scriptSha = existsSync(pack.script) ? sha256(pack.script) : null;
  if (scriptSha !== pack.script_sha256) fail(["script.json 在做審片包之後改過了：重跑 review-pack.mjs（讀點和接縫要和這一版一致）"]);
  console.log(`review-pack --check: 重新量 ${relative(process.cwd(), pack.render)}（${pack.test ? "試片：只看量測" : "正片：量測＋清單"}）`);
  const M = measure({ dir: pack.dir, render: pack.render, scriptFile: pack.script, test: pack.test, out });
  const F = applyWaivers(M.F, readJSON(join(pack.dir, "review-waivers.json"), []));
  const problems = F.filter((f) => f.level === "FAIL").map((f) => `量測 FAIL \`${f.code}\` ${f.id}：${f.msg}`);
  let taste = [], checklistSha = null, indep = null, motion = null;
  const candidate = flag("candidate");
  if (candidate && !pack.test) problems.push("--candidate 只給試片：正片草稿要完整審片");
  if (!candidate) {
    const mf = join(out, "MOTION.md");
    if (!existsSync(mf)) problems.push(`沒有 ${mf}：重跑 review-pack.mjs`);
    else { const r = readMotion(readFileSync(mf, "utf8"), F, pack.test); problems.push(...r.problems); motion = r.answers; }
  }
  if (!pack.test) {
    const cf = join(out, "CHECKLIST.md");
    if (!existsSync(cf)) problems.push(`沒有 ${cf}`);
    else {
      const md = readFileSync(cf, "utf8"); checklistSha = shaText(md);
      const { W } = windows(M.S ?? { beats: [] }, { fps: pack.fps, frames: pack.frames }, pack.step);
      const r = readChecklist(md, W); problems.push(...r.problems); taste = r.taste;
      const inf = join(out, "INDEPENDENT.md");
      if (!existsSync(inf)) problems.push(`沒有 ${inf}：請一個沒參與製作的審片者看過這包（video-draft-review 第 6 步）`);
      else { indep = readIndependent(readFileSync(inf, "utf8"), W.all); problems.push(...indep.problems); }
    }
  }
  if (problems.length) fail(problems);
  const warns = F.filter((f) => f.level === "WARN"), waived = F.filter((f) => f.level === "WAIVED");
  const PASS = { mode: candidate ? "candidate" : pack.test ? "measure" : "full", ...(motion ? { motion } : {}), render: pack.render, sha256: sha, bytes: statSync(pack.render).size, fps: pack.fps, duration: pack.duration,
    script: pack.script, script_sha256: scriptSha, checklist_sha256: checklistSha, pack_at: pack.at, passed_at: new Date().toISOString(),
    counts: { fail: 0, waived: waived.length, warn: warns.length, taste: taste.length, ...(indep ? { independent: indep.findings.length } : {}) },
    ...(indep ? { independent: { reviewer: indep.reviewer, first_look: indep.first, findings: indep.findings } } : {}),
    waived: waived.map((f) => ({ code: f.code, id: f.id, msg: f.msg, approved_by: f.waiver.approved_by, quote: f.waiver.quote })),
    warns: warns.map((f) => ({ code: f.code, id: f.id, msg: f.msg })), taste, derived: [] };
  writeFileSync(passFile, JSON.stringify(PASS, null, 1) + "\n");
  console.log(`✓ 審片通過：${basename(pack.render)} sha256 ${sha.slice(0, 12)}；豁免 ${waived.length}、提醒 ${warns.length}、品味 ${taste.length} → ${relative(process.cwd(), passFile)}`);
  console.log(`  回報時貼這一行：PASS ${basename(pack.render)} ${sha.slice(0, 12)} · FAIL 0 · 豁免 ${waived.length} · 提醒 ${warns.length} · 品味 ${taste.length}${indep ? ` · 獨立 ${indep.findings.length}` : ""}`);
  if (motion) console.log(`  也貼這一行：動態檢查：範例 ${motion.exemplar}；元件 ${motion.block}；最弱處 ${motion.weakest}；另一種表達 ${motion.alternative}${motion.kept.length ? `；留著的提醒 ${motion.kept.map((k) => k.code).join("、")}` : ""}`);
  process.exit(0);
}

/** Is this file covered by a PASS.json that still holds? → { ok, why } */
export function verify(outDir, file) {
  const out = resolve(outDir), P = readJSON(join(out, "PASS.json"));
  if (!P) return { ok: false, why: `沒有 ${join(out, "PASS.json")}` };
  if (!existsSync(P.render)) return { ok: false, why: `PASS.json 的 render 不見了：${P.render}` };
  const master = sha256(P.render);
  if (master !== P.sha256) return { ok: false, why: `render 在通過之後改過了（${master.slice(0, 12)} ≠ ${P.sha256.slice(0, 12)}）` };
  if (P.script && existsSync(P.script) && sha256(P.script) !== P.script_sha256) return { ok: false, why: "script.json 在通過之後改過了" };
  const f = resolve(file ?? P.render);
  if (!existsSync(f)) return { ok: false, why: `沒有 ${f}` };
  const s = sha256(f);
  if (s === P.sha256 || (P.derived ?? []).some((d) => d.sha256 === s)) return { ok: true, why: `PASS ${basename(P.render)} ${P.sha256.slice(0, 12)}${s === P.sha256 ? "" : `（${basename(f)} 是它的重新編碼）`}`, pass: P };
  return { ok: false, why: `${basename(f)}（${s.slice(0, 12)}）不是通過審片的那一版（${basename(P.render)} ${P.sha256.slice(0, 12)}）` };
}

/** A chosen version shown as a preview (a join of passed clips, a slowed close-up) is not the passed render itself: --link records which reviews it comes from. */
function link(file, reviews) {
  const f = resolve(file ?? "");
  if (!file || !existsSync(f) || !reviews.length) { console.error("usage: review-pack.mjs --link <preview.mp4> <dir>/review [<dir2>/review …]"); process.exit(1); }
  const from = reviews.map((r) => { const out = resolve(r), v = verify(out), P = readJSON(join(out, "PASS.json"));
    if (!v.ok) { console.error(`✗ ${r}：${v.why}`); process.exit(1); }
    if (P.mode === "candidate") { console.error(`✗ ${r} 是候選（--candidate），選定的版本要填 MOTION.md 再 --check`); process.exit(1); }
    if (statSync(P.render).mtimeMs > statSync(f).mtimeMs) { console.error(`✗ ${basename(f)} 比 ${basename(P.render)} 舊：它不是從這一版做的，重做預覽`); process.exit(1); }
    return { review: out, motion: !!P.motion }; });
  if (!from.some((x) => x.motion)) { console.error("✗ 這些審片都沒有動態檢查（MOTION.md）：至少新做的那一段要有"); process.exit(1); }
  writeFileSync(`${f}.pass.json`, JSON.stringify({ sha256: sha256(f), from, at: new Date().toISOString() }, null, 1) + "\n");
  console.log(`✓ ${basename(f)} 記為來自 ${reviews.length} 份通過的審片`);
}

/** Is this preview linked to reviews that still hold? → { ok, why } */
export function linked(file) {
  const f = resolve(file), L = readJSON(`${f}.pass.json`);
  if (!L) return { ok: false, why: "沒有連到通過的審片" };
  if (sha256(f) !== L.sha256) return { ok: false, why: "檔案在 --link 之後改過了" };
  for (const r of L.from) { const v = verify(r.review); if (!v.ok) return { ok: false, why: `${relative(process.cwd(), r.review)}：${v.why}` }; }
  return { ok: true, why: `來自 ${L.from.length} 份通過的審片` };
}

function attach(outDir, file) {
  const out = resolve(outDir), v = verify(out), f = resolve(file);
  if (!v.ok) { console.error(`✗ ${v.why}`); process.exit(1); }
  const P = readJSON(join(out, "PASS.json")), a = probe(P.render), b = probe(f);
  if (Math.abs(a.dur - b.dur) > 1.5 / a.fps) { console.error(`✗ 長度不同（${a.dur.toFixed(3)} vs ${b.dur.toFixed(3)} 秒）：不是同一版的重新編碼`); process.exit(1); }
  const sig = (x) => execFileSync(FF, ["-nostdin", "-v", "error", "-i", x, "-vf", "fps=2,scale=64:36,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { encoding: "utf8" }).split("\n").filter((l) => l.includes("YAVG")).map((l) => +l.split("=")[1]);
  const sa = sig(P.render), sb = sig(f), n = Math.min(sa.length, sb.length), diff = n ? sa.slice(0, n).reduce((s, x, i) => s + Math.abs(x - sb[i]), 0) / n : 99;
  if (diff > 2.0) { console.error(`✗ 畫面和通過的那一版不一樣（每半秒平均亮度差 ${diff.toFixed(2)}）`); process.exit(1); }
  P.derived = [...(P.derived ?? []).filter((d) => d.path !== f), { path: f, sha256: sha256(f), luma_diff: +diff.toFixed(3), at: new Date().toISOString() }];
  writeFileSync(join(out, "PASS.json"), JSON.stringify(P, null, 1) + "\n");
  console.log(`✓ ${basename(f)} 記為 ${basename(P.render)} 的重新編碼（每半秒平均亮度差 ${diff.toFixed(2)}）`);
}

/** What a new pack into out would destroy: a PASS.json that still holds, or a CHECKLIST.md someone has started filling in.
 *  (Film C lost a filled checklist and a PASS twice to a later pack written into the same default review/.) */
export function guarded(out) {
  const keep = [], P = readJSON(join(out, "PASS.json")), cf = join(out, "CHECKLIST.md");
  if (P) { const v = verify(out); if (v.ok) keep.push(`仍然有效的 PASS.json（${basename(P.render)} ${P.sha256.slice(0, 12)}）`); }
  if (existsSync(cf)) {
    const md = readFileSync(cf, "utf8"), ticked = (md.match(/^[ \t]*- \[(x|X|!)\]/gm) ?? []).length, answered = (md.match(/^[ \t]*答：[ \t]*\S/gm) ?? []).length;
    if (ticked || answered) keep.push(`填過的 CHECKLIST.md（勾了 ${ticked} 格、答了 ${answered} 題${readJSON(join(out, "pack.json"))?.render ? `，${basename(readJSON(join(out, "pack.json")).render)}` : ""}）`);
  }
  const inf = join(out, "INDEPENDENT.md");
  if (existsSync(inf) && /^\s*- \[(!|ok)\]/m.test(readFileSync(inf, "utf8"))) keep.push("填過的 INDEPENDENT.md（獨立審片）");
  return keep;
}

function pack() {
  const dir = args[0] && resolve(args[0]), render = args[1] && resolve(args[1]);
  if (!dir || !render || !existsSync(render)) { console.error("usage: review-pack.mjs <dir> <render.mp4> [--script s.json] [--out dir] [--step 2] [--test] [--no-png] [--force]"); process.exit(1); }
  const scriptFile = resolve(dir, opt("script", "direction/script.json")), out = resolve(opt("out", join(dir, "review"))), test = flag("test") || isTestDir(dir);
  const keep = guarded(out);
  if (keep.length && !flag("force")) {
    const alt = relative(process.cwd(), join(dir, `review-${safe(basename(render).replace(/\.[^.]+$/, ""))}`));
    console.error(`✗ ${relative(process.cwd(), out) || "."} 裡有別的審片：${keep.join("；")}。\n  不覆寫。另開一包：--out ${alt}（每一版 render 一包），或確定不要了再加 --force`);
    process.exit(3);
  }
  mkdirSync(out, { recursive: true });
  for (const d of ["beats", "seams", "reads", "crops"]) { rmSync(join(out, d), { recursive: true, force: true }); mkdirSync(join(out, d), { recursive: true }); }   // only our own subfolders
  rmSync(join(out, "PASS.json"), { force: true });   // a new pack is a new review
  const T = probe(render), { fps } = T, step = +opt("step", fps > 40 ? 2 : 1);
  console.log(`review-pack: ${relative(process.cwd(), render)} (${T.dur.toFixed(1)} s, ${fps} fps, ${T.frames} 格)${test ? "，試片：只量測" : ""} → ${relative(process.cwd(), out) || "."}`);
  const M = measure({ dir, render, scriptFile, test, out }), S = M.S ?? { beats: [] }, { W, seams } = windows(S, T, step);
  // the sheets and stills: tile n of a window shows frame k0 + n·K (seek a quarter frame early, so frame k0 is the first one)
  const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find(existsSync);
  const ff = (a) => execFileSync(FF, ["-v", "error", "-y", ...a], { env, maxBuffer: 64 << 20 });
  const seek = (k) => Math.max(0, (k - 0.25) / fps);
  const label = (s) => (FONT ? `,drawtext=fontfile=${FONT}:text='%{pts\\:hms\\:${s.toFixed(4)}} f%{eif\\:(t+${s.toFixed(4)})*${fps}+0.5\\:d\\:4}':x=4:y=4:fontsize=15:fontcolor=white:box=1:boxcolor=black@0.6` : "");
  const sheet = (w, width, cols) => {
    if (!w.frames.length) return;
    const rows = Math.max(1, Math.ceil(w.frames.length / cols)), s = seek(w.k0);
    ff(["-ss", s.toFixed(4), "-t", ((w.len - 0.5) / fps).toFixed(4), "-i", render, "-vf", `select='not(mod(n\\,${w.K}))',scale=${width}:-2${label(s)},tile=${cols}x${rows}:padding=2`, "-frames:v", "1", "-update", "1", join(out, w.file)]);
  };
  const still = (k, file, crop) => { const s = seek(k); ff(["-ss", s.toFixed(4), "-i", render, "-vf", (crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}` : "scale=1280:-2") + label(s), "-frames:v", "1", "-q:v", "3", join(out, file)]); };
  sheet(W.film, 320, 8);
  for (const [k, w] of Object.entries(W)) if (k.startsWith("beat:") || k.startsWith("seam:")) sheet(w, 240, 8);
  for (const w of Object.values(W).filter((x) => x?.key)) {
    still(w.start, `reads/${w.key}-start.jpg`); still(w.end, `reads/${w.key}-end.jpg`);
    if (w.crop !== null) still(w.crop, `crops/${w.key}.jpg`, w.r.crop);
  }
  const fm = spawnSync("bash", [join(TOOL, "scripts/film-metrics.sh"), render], { env, encoding: "utf8", maxBuffer: 64 << 20 });
  writeFileSync(join(out, "film-metrics.txt"), (fm.stdout ?? "") + (fm.stderr ?? ""));
  rmSync(join(out, "ruler"), { recursive: true, force: true });
  if (!test && W.ruler) rulerPack({ dir, render, out, W, ff, seek, label, FONT });
  const refNodes = compareRefs(render, S, out);   // every beat and seam that binds a reference: this render next to it (refs/)
  if (refNodes.length) console.log(`  和參考並排：${refNodes.length} 處（${relative(process.cwd(), join(out, "refs"))}/、refs.txt）`);
  timingChart({ ...M, S }, out, !flag("no-png"));
  writeFileSync(join(out, "pack.json"), JSON.stringify({ dir, render, sha256: sha256(render), fps, frames: T.frames, duration: T.dur, step, test, script: scriptFile,
    script_sha256: existsSync(scriptFile) ? sha256(scriptFile) : null, at: new Date().toISOString(), frames_in_pack: W.all.length,
    findings: M.F, holds: M.holds, seams: M.seamC, profile: { stutters: M.P.stutters, stillTail: M.P.stillTail, spikes: M.P.spikes, snaps: M.J.snaps, pops: M.J.pops, flashes: M.FL }, headlines: M.crossings, layouts: M.layouts, dissolves: M.dissolves, subjects: M.subjects, energy: M.energy, slide: M.slide }, null, 1) + "\n");
  if (!test) { writeFileSync(join(out, "CHECKLIST.md"), checklist({ dir, render, scriptFile, out, W, F: M.F })); writeFileSync(join(out, "INDEPENDENT.md"), INDEPENDENT_TEMPLATE); }
  else for (const f of ["CHECKLIST.md", "INDEPENDENT.md"]) rmSync(join(out, f), { force: true });
  const mf = join(out, "MOTION.md");
  if (existsSync(mf) && /^(範例|元件|最弱處|另一種表達)：[ \t]*\S/m.test(readFileSync(mf, "utf8"))) renameSync(mf, join(out, "MOTION.prev.md"));
  writeFileSync(mf, motionTemplate({ render: relative(dir, render), facts: M.motion, F: M.F, test, command: `node <tool>/scripts/review-pack.mjs --check ${relative(process.cwd(), out) || "."}` }));
  const fails = M.F.filter((f) => f.level === "FAIL"), warns = M.F.filter((f) => f.level === "WARN");
  console.log(`  量測：FAIL ${fails.length}、WARN ${warns.length}（timing.txt、pack.json）${test ? "" : `；CHECKLIST.md 待填：常見失敗 ${failureList().length} 項、第一個畫面、和尺並排`}`);
  for (const f of fails.slice(0, 20)) console.log(`  ✗ ${f.code} ${f.id}：${f.msg}`);
  if (fails.length > 20) console.log(`  …還有 ${fails.length - 20} 項`);
  console.log(`  接著：${test ? "填 MOTION.md，再" : "看完審片包、填 CHECKLIST.md 與 MOTION.md，請沒參與製作的審片者填 INDEPENDENT.md，再"}跑 node <tool>/scripts/review-pack.mjs --check ${relative(process.cwd(), out) || "."}`);
}

/** ruler/: the draft's beat frames on top, each ruler's moments below (6 tiles a row), and film-metrics for all of them. */
function rulerPack({ dir, render, out, W, ff, seek, label, FONT }) {
  const { R } = rulersOf(dir), rd = join(out, "ruler"), TW = 400, TH = 225, COLS = 6, tiles = [], rows = [];
  mkdirSync(rd, { recursive: true });
  const fit = `scale=${TW}:${TH}:force_original_aspect_ratio=decrease,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2`;
  const ours = W.ruler.frames.map((k, i) => { const f = join(rd, `d-${String(i).padStart(2, "0")}.png`); ff(["-ss", seek(k).toFixed(4), "-i", render, "-vf", fit + label(seek(k)), "-frames:v", "1", "-update", "1", f]); return f; });
  for (let i = 0; i < ours.length; i += COLS) rows.push(ours.slice(i, i + COLS));
  for (const r of R.filter((x) => x.file && existsSync(x.file))) {
    const text = (m) => (FONT ? `,drawtext=fontfile=${FONT}:text='${safe(r.id).toUpperCase()} ${m.t.toFixed(2)}s':x=4:y=4:fontsize=15:fontcolor=white:box=1:boxcolor=0x5b4bdb@0.8` : "");
    const row = r.moments.slice(0, COLS).map((m, j) => { const f = join(rd, `${safe(r.id)}-${j}.png`); spawnSync(FF, ["-v", "quiet", "-y", "-ss", String(m.t), "-i", r.file, "-vf", fit + text(m), "-frames:v", "1", "-update", "1", f], { env, stdio: "ignore" }); return f; }).filter(existsSync);
    if (row.length) rows.push(row);
  }
  rows.forEach((row, y) => row.forEach((f, x) => tiles.push({ f, x: x * (TW + 4), y: y * (TH + 4) })));
  if (tiles.length) ff([...tiles.flatMap((t) => ["-i", t.f]), "-filter_complex", tiles.length === 1 ? "[0]null" : `${tiles.map((_, i) => `[${i}]`).join("")}xstack=inputs=${tiles.length}:layout=${tiles.map((t) => `${t.x}_${t.y}`).join("|")}:fill=black`, "-frames:v", "1", "-update", "1", join(rd, "side-by-side.jpg")]);
  const fm = spawnSync("bash", [join(TOOL, "scripts/film-metrics.sh"), render, ...R.map((r) => r.file).filter((f) => f && existsSync(f))], { env, encoding: "utf8", maxBuffer: 64 << 20 });
  writeFileSync(join(rd, "metrics.txt"), `# 和尺並排：第一行是這一版，其餘是尺（${R.map((r) => `${r.id} = ${r.title}`).join("；")}）\n` + (fm.stdout ?? "") + (fm.stderr ?? "").split("\n").filter((l) => !/av1|get_buffer|frame error|reference frame|Sequence Header|repeated/i.test(l)).join("\n"));
}

// ---------- main (only when run, not when imported by the hook or the tests)
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  if (args[0] === "--check") check(args[1]);
  else if (args[0] === "--verify") { const r = verify(args[1] ?? "review", args[2]); console.log(`${r.ok ? "✓" : "✗"} ${r.why}`); process.exit(r.ok ? 0 : 1); }
  else if (args[0] === "--attach") attach(args[1], args[2]);
  else if (args[0] === "--link") link(args[1], args.slice(2));
  else pack();
}
