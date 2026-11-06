// Per-frame motion of a render, and what it says about timing (video-draft-review: the measured side of the gate).
// motion v[k] = mean absolute luma difference between frame k and frame k−1 at 480×270 (0–255), the same signal as
// scripts/measure/motion-profile.py, beat-check.mjs and film-metrics.sh, so their numbers agree.
//   const { fps, v } = lumaDiff(render)      // v[0] = 0
//   profile(v, fps)                          // stutters, spikes, still tail (motion-profile.py's rules), the sparkline
//   onsets(v, fps)                           // where a real change starts after a calm stretch (the next thing that takes the eye)
//   calmRuns(v, fps)                         // the holds: runs below HOLD for 0.5 s or more (film-metrics.sh's "hold")
//   jumps(edgeMaps(render), seamTimes)       // one-frame discontinuities in a subject (snaps, pops), on edges, not luma: see SNAP
//   flashes(render)                          // one- to three-frame flashes (a blank or stray frame between two that agree): see FLASH
//   headCross(render, headlines)             // content moving through a headline's zone while the headline is up: see CROSS
//   layouts(render, edgeMaps(render), poses) // how alike each beat's composition is to the one before: see LAYOUT
//   dissolves(render, v, fps, seams)        // old and new picture semi-transparent together at a seam: see DISSOLVE
//   subjects(render, poses)                 // the key subject's size at each important read: see SUBJECT
//   energy(v, fps, { bpm, perBar })          // the energy curve: hook, middle sag, densest stretch, biggest peak, gaps: see ENERGY
//   slideRisk(v, fps, pictureStats(render), layouts) // how much it looks like a slideshow: see SLIDE
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { MOTION } from "./rules.mjs";
const pick = (o, ...k) => Object.fromEntries(k.map((x) => [x, o[x]]));
const TOOL = resolve(new URL("../..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json"));

export const MOVING = 0.15;   // above this a frame moves at all (motion-profile.py)
export const REAL = 1.0;      // a real move (motion-profile.py's stutter test)
export const HOLD = 0.6;      // below this a frame is part of a hold: a slow drift still counts as holding (film-metrics.sh)

export function lumaDiff(render) {
  const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
  const r = execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", render], { encoding: "utf8" }).trim();
  const [a, b] = r.split("/").map(Number), fps = a / (b || 1);
  const out = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", "scale=480:270,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 256 << 20 });
  return { fps, v: [0, ...out.split("\n").filter((l) => l.includes("YAVG")).map((l) => +l.split("=")[1])] };
}

// One-frame discontinuities in a subject (motion-profile.py's "snaps" and "pops"). The luma difference misses a white subject
// on a near-white ground, so this measures structure instead: M_k = the Sobel gradient magnitude of frame k at 480×270,
// blurred (σ 8 px, so a sharp edge creeping across a cell boundary changes the map smoothly) and area-averaged to a
// 32×18 map (16-bit); d(k) = mean |M_k − M_{k−1}|, E(k) = mean M_k (how much structure the picture has).
// A jump at k: d(k) ≥ 15% of max(E(k−1), E(k)), and ≥ 3 × every other step within ±0.1 s, so it is one frame (smooth
// motion, however fast, spreads over several frames); or a one-frame outlier: k and k+1 both jump and frame k+1 is back.
// back = how far the picture comes back toward frame k−1 within 0.5 s, on a coarse 8×6 map C (so the subject's own drift
// does not count): back(j) = 1 − |C_{k+j} − C_{k−1}| / |C_k − C_{k−1}|, best j. A snap: back ≥ 0.3, reached by moving (no
// step on the way back over half the jump): the subject jumped to another state for a frame and then animated on from
// there. That is never designed. A pop: the jump stays (a hard cut, a swap, a thing that appears in one frame), or it
// comes back with a second jump (a blink). Near a seam both can be the design (a hard cut), so the caller passes the
// seam times. Film C draft 12c (f2761 → f2762, the white plane): rel 0.73, back 0.44.
export const SNAP = { w: 32, h: 18, rel: 0.15, iso: 3, isoWin: 0.1, back: 0.3, backWin: 0.5, glide: 0.5, seamWin: 0.4 };

export function edgeMaps(render) {
  const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
  const r = execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", render], { encoding: "utf8" }).trim();
  const [a, b] = r.split("/").map(Number), fps = a / (b || 1), N = SNAP.w * SNAP.h;
  const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", `scale=480:270,format=gray,sobel,format=gray16le,gblur=sigma=8,scale=${SNAP.w}:${SNAP.h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray16le", "-"], { maxBuffer: 1 << 30 });
  const maps = [];
  for (let o = 0; o + 2 * N <= buf.length; o += 2 * N) { const m = new Float64Array(N); for (let c = 0; c < N; c++) m[c] = buf.readUInt16LE(o + 2 * c); maps.push(m); }
  return { fps, maps };
}

// One- to three-frame flashes: a run of frames that differs from the frames on both sides of it while those two agree — a frame
// the renderer captured before the page was painted (blank), a stray state, a flash. The edge-based snap test misses most of
// them: a blank paper frame between two paper frames has little structure to lose. Measured on luma at 96×54:
// d(p, q) = mean |Y_p − Y_q| (0–255). A run k..k+r−1 (r ≤ 3) flashes when every frame in it is ≥ FLASH.min from both k−1 and
// k+r, and ≥ FLASH.ratio × d(k−1, k+r). Film E's hardest-shot test v6 (2026-10-29, filmed-screen's screenshot capture racing a
// 3D page scene): 6 flashes, 3.9–14.9 apart, neighbours 0.2–2.9 apart; the snap test caught one; the user saw them
// (「有一些格數有閃畫面的問題」). Smooth motion never qualifies: frame k−1 and k+r differ at least as much as either from k.
export const FLASH = { w: 96, h: 54, min: 2.5, ratio: 3, run: 3, area: 0.15 };

export function flashes(render) {
  const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
  const r = execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", render], { encoding: "utf8" }).trim();
  const [a, b] = r.split("/").map(Number), fps = a / (b || 1), N = FLASH.w * FLASH.h;
  const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", `scale=${FLASH.w}:${FLASH.h}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / N), d = (p, q) => { let s = 0; for (let c = 0; c < N; c++) s += Math.abs(buf[p * N + c] - buf[q * N + c]); return s / N; };
  const out = [];
  for (let k = 1; k < n - 1; k++) {
    if (out.length && k < out[out.length - 1].k + out[out.length - 1].frames) continue;
    for (let len = 1; len <= FLASH.run && k + len < n; len++) {
      const c = d(k - 1, k + len); let m = Infinity;
      for (let i = k; i < k + len; i++) m = Math.min(m, d(i, k - 1), d(i, k + len));
      if (m >= FLASH.min && m >= FLASH.ratio * c) { out.push({ k, t: +(k / fps).toFixed(3), frames: len, d: +m.toFixed(1), around: +c.toFixed(1) }); break; }
    }
  }
  return { fps, flashes: out };
}

/** Area flashes → [{ k, t, frames, area }]: one to three frames in a stray state over a large part of the picture while the frames on
 *  either side agree there. flashes() compares whole frames, so a stray frame next to a real change (a violet field that should grow
 *  from a frame showed full-screen for three frames, then started from the frame) reads as a step: an earlier film 2026-11-01, 59.65 s,
 *  a gsap.set made the layer visible before its clip-path tween had started (user: 「0:59-1:00 好像一閃一下畫面」). Tiles of
 *  FLICKER.tile px on a 192×108 picture; a run counts when ≥ FLASH.area of the tiles each flash. */
export function areaFlashes(render, fps = 60) {
  const FF = require("ffmpeg-static"), { w: W, h: H, tile: TS } = FLICKER, N = W * H, TX = W / TS, TY = H / TS, need = Math.ceil(FLASH.area * TX * TY);
  const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", `scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / N);
  const td = (p, q, tx, ty) => { let s = 0; for (let y = ty * TS; y < ty * TS + TS; y++) { const o = y * W + tx * TS; for (let x = 0; x < TS; x++) s += Math.abs(buf[p * N + o + x] - buf[q * N + o + x]); } return s / (TS * TS); };
  const out = [];
  for (let k = 1; k < n - 1; k++) {
    for (let len = 1; len <= FLASH.run && k + len < n; len++) {
      let c = 0;
      for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
        let m = Infinity; for (let i = k; i < k + len; i++) m = Math.min(m, td(i, k - 1, tx, ty), td(i, k + len, tx, ty));
        if (m >= FLICKER.min && m >= FLICKER.ratio * td(k - 1, k + len, tx, ty)) c++;
      }
      if (c >= need) { out.push({ k, t: +(k / fps).toFixed(3), frames: len, area: Math.round(100 * c / (TX * TY)) }); k += len; break; }
    }
  }
  return out;
}

/** Local flicker → [{ t, t1, n, every, tile }]: one region keeps showing a single stray frame — frame k unlike both neighbours there
 *  while they agree — again and again. flashes() averages the whole frame and misses a card that is right in five frames and wrong
 *  in the sixth (an earlier film 2026-11-01, beat 11: two tweens on a card's y, the render kept 0 and every sixth frame −18; user:
 *  「進入到下一段時會不停上下閃現」). One stray frame can be a designed slap; three or more in a row of the same place
 *  (each 2+ frames apart, within FLICKER.gap s of the last) cannot. */
export const FLICKER = { w: 192, h: 108, tile: 12, min: 8, ratio: 3, gap: 0.3, near: 2, run: 3 };
export function flickers(render, fps = 60) {
  const FF = require("ffmpeg-static"), { w: W, h: H, tile: TS } = FLICKER, N = W * H;
  const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", `scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / N), TX = W / TS, TY = H / TS;
  const td = (p, q, tx, ty) => { let s = 0; for (let y = ty * TS; y < ty * TS + TS; y++) { const o = y * W + tx * TS; for (let x = 0; x < TS; x++) s += Math.abs(buf[p * N + o + x] - buf[q * N + o + x]); } return s / (TS * TS); };
  const ev = [];
  for (let k = 1; k < n - 1; k++) {
    let best = null;
    for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
      const m = Math.min(td(k, k - 1, tx, ty), td(k, k + 1, tx, ty));
      if (m < FLICKER.min) continue;
      const c = td(k - 1, k + 1, tx, ty);
      if (m >= FLICKER.ratio * c && (!best || m > best.m)) best = { k, m, tx, ty };
    }
    if (best) ev.push(best);
  }
  const out = []; let run = [];
  const close = () => { if (run.length >= FLICKER.run) out.push({ t: +(run[0].k / fps).toFixed(3), t1: +(run.at(-1).k / fps).toFixed(3), n: run.length,
    every: Math.round((run.at(-1).k - run[0].k) / (run.length - 1)), tile: [run[0].tx * TS * 1920 / W, run[0].ty * TS * 1080 / H] }); run = []; };
  for (const e of ev) {
    const l = run.at(-1);
    if (l && e.k - l.k >= 2 && e.k - l.k <= FLICKER.gap * fps && Math.abs(e.tx - l.tx) <= FLICKER.near && Math.abs(e.ty - l.ty) <= FLICKER.near) run.push(e);
    else if (l && e.k - l.k < 2) continue;   // consecutive frames: motion, not a stray frame
    else { close(); run = [e]; }
  }
  close();
  return out;
}

/** One-frame jumps → { snaps, pops }: [{ k, t, rel, back, backAt, seam }] — frame k−1 → k jumped, back by k + backAt; seam = the
 *  seam time it is within SNAP.seamWin of (seams: times in seconds), or null. */
export function jumps({ fps, maps }, seams = []) {
  const n = maps.length, N = maps[0]?.length ?? 0;
  const dist = (p, q) => { let s = 0; for (let c = 0; c < N; c++) s += Math.abs(maps[p][c] - maps[q][c]); return s / N; };
  const E = maps.map((m) => m.reduce((s, x) => s + x, 0) / N), d = maps.map((_, k) => (k ? dist(k, k - 1) : 0));
  const I = Math.max(2, Math.round(SNAP.isoWin * fps)), B = Math.round(SNAP.backWin * fps), BW = 4, BH = 3, CW = SNAP.w / BW, CH = SNAP.h / BH;
  const near = (k, skip) => { let m = 1; for (let j = Math.max(1, k - I); j <= Math.min(n - 1, k + I); j++) if (j !== k && j !== skip) m = Math.max(m, d[j]); return m; };
  // the coarse map C: 8×6 blocks of 4×3 cells: where the structure is, tolerant of the subject's own drift and growth
  const C = maps.map((m) => { const o = new Float64Array(CW * CH); for (let c = 0; c < N; c++) o[Math.trunc(Math.trunc(c / SNAP.w) / BH) * CW + Math.trunc((c % SNAP.w) / BW)] += m[c]; return o; });
  const far = (p, q) => { let s = 0; for (let c = 0; c < CW * CH; c++) s += Math.abs(C[p][c] - C[q][c]); return s; };
  const back = (k) => { const j0 = far(k, k - 1) || 1; let best = [0, 0]; for (let j = 1; j <= B && k + j < n; j++) { const r = 1 - far(k + j, k - 1) / j0; if (r > best[0]) best = [r, j]; } return best; };
  const snaps = [], pops = [];
  for (let k = 1; k < n; k++) {
    const rel = d[k] / Math.max(E[k], E[k - 1], 1);
    if (rel < SNAP.rel) continue;
    const single = d[k] >= SNAP.iso * near(k);
    const outlier = !single && k + 1 < n && Math.min(d[k], d[k + 1]) >= SNAP.iso * near(k, k + 1) && dist(k + 1, k - 1) <= 0.5 * Math.min(d[k], d[k + 1]);
    if (!single && !outlier) continue;
    const [b, at] = outlier ? [1, 1] : back(k);
    let glide = at > 0; for (let j = k + 1; j <= k + at && glide && !outlier; j++) if (d[j] > SNAP.glide * d[k]) glide = false;
    const seam = seams.find((t) => Math.abs(t - k / fps) <= SNAP.seamWin) ?? null;
    (b >= SNAP.back && glide ? snaps : pops).push({ k, t: +(k / fps).toFixed(2), rel: +rel.toFixed(2), back: +b.toFixed(2), backAt: at, seam });
  }
  return { snaps, pops };
}

const median = (xs) => { const s = xs.filter((x) => x > MOVING).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** motion-profile.py, in JS: stutter = a still run ≤ 0.25 s between two real moves; spike = a jump > max(3 × median, 1.0). */
export function profile(v, fps) {
  const n = v.length, mov = v.map((x) => x > MOVING), stutters = [];
  for (let i = 0; i < n;) {
    if (mov[i]) { i++; continue; }
    let j = i; while (j < n && !mov[j]) j++;
    const before = Math.max(0, ...v.slice(Math.max(0, i - Math.trunc(0.2 * fps)), i)), after = Math.max(0, ...v.slice(j, j + Math.trunc(0.2 * fps)));
    if (i > 0 && j < n && j - i <= Math.trunc(0.25 * fps) && Math.min(before, after) > REAL) stutters.push({ t: +(i / fps).toFixed(2), frames: j - i });
    i = j;
  }
  const med = median(v), spikes = [];
  for (let k = 1; k < n; k++) if (v[k] - v[k - 1] > Math.max(3 * med, 1.0)) spikes.push(+(k / fps).toFixed(2));
  let tail = 0; while (tail < n && !mov[n - 1 - tail]) tail++;
  const top = Math.max(...v, 1e-9), step = Math.max(1, Math.round(fps / 10));
  let spark = ""; for (let k = 0; k < n; k += step) spark += " ▁▂▃▄▅▆▇█"[Math.min(8, Math.trunc((Math.max(...v.slice(k, k + step)) / top) * 8))];
  return { fps, frames: n, median: med, stutters, spikes, stillTail: +(tail / fps).toFixed(2), spark };
}

/** Frames where a real change begins: motion rises above max(REAL, median) after ≥ calm seconds below HOLD. */
export function onsets(v, fps, { calm = 0.15 } = {}) {
  const hi = Math.max(REAL, median(v)), need = Math.round(calm * fps), out = [];
  let quiet = 0;
  for (let k = 1; k < v.length; k++) {
    if (v[k] >= hi && quiet >= need) out.push(k);
    quiet = v[k] < HOLD ? quiet + 1 : v[k] >= hi ? 0 : quiet;
  }
  return out;
}

/** Holds: runs of frames below HOLD lasting at least min seconds → [{ t0, t1 }] in seconds. */
export function calmRuns(v, fps, min = 0.5) {
  const out = []; let s = -1;
  for (let k = 0; k <= v.length; k++) {
    const calm = k < v.length && v[k] < HOLD;
    if (calm && s < 0) s = k;
    if (!calm && s >= 0) { if ((k - s) / fps >= min) out.push({ t0: s / fps, t1: k / fps }); s = -1; }
  }
  return out;
}

/** Peak motion ÷ mean motion in [t0, t1] (video-motion-craft transition-ruler.md §2: a seam's burst is 2–3× its surroundings). */
export function contrast(v, fps, t0, t1) {
  const a = Math.max(1, Math.round(t0 * fps)), b = Math.min(v.length - 1, Math.round(t1 * fps)), w = v.slice(a, b + 1);
  if (!w.length) return null;
  const mean = w.reduce((s, x) => s + x, 0) / w.length;
  return mean > 0 ? Math.max(...w) / mean : null;
}

// A headline and moving content (video-motion-craft's rules table: the headline is gone before content crosses its zone).
// Film C dark-draft-6 (2026-10-26): 06's headline sat over the Gantt growing down in S8's pull-back; the same scan found S4 (02's
// cards gathering) and the S10 trail crossing 「今晚就回得了。」. For each headline read: decode its zone (the script's
// headline_zone or the read's own zone, in 1920×1080 px, scaled to the render) from 0.45 s after it starts (settled) to 1.5 s
// after its read ends, at full resolution. The headline's pixels are the ink of that first frame (|Y − the zone's median| > HI);
// it is up while at least half of them are still ink (a fade or a step back to 50 % still counts as up). Content crossing = ink
// that is new this frame (strong ink, > HI) and not within R px of the last frame's weak ink (> LO), or ink that left the same
// way, outside the headline's own pixels grown by HX px (its blur on the way out is not content). A crossing is CROSS.px such
// pixels or more on CROSS.run frames running. Hysteresis keeps a hairline at the threshold from flickering in; the R px keeps a
// slow drift (1–2 %/s) out. Sizes are at 1920 wide and scale with the render. → [{ ...item, spans: [{ t0, t1, peak }], upTo }]
// It cannot tell a designed exception (a headline held through a camera dive, a panel edge drifting just above it) from a
// mistake, so the gate only warns (backtest: video-draft-review evals/backtest.mjs, film C dark-draft-6 against dark-draft-10).
export const CROSS = { lo: 30, hi: 60, r: 3, hx: 12, px: 40, run: 2, settle: 0.45, after: 1.5, up: 0.5 };

export function headCross(render, items) {
  const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
  const p = JSON.parse(execFileSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,width,height:format=duration", "-of", "json", render], { encoding: "utf8" }));
  const [fa, fb] = p.streams[0].r_frame_rate.split("/").map(Number), fps = fa / (fb || 1), VW = p.streams[0].width, VH = p.streams[0].height, dur = +p.format.duration;
  const s = VW / 1920, R2 = Math.max(1, Math.round(CROSS.r * s)), HX = Math.max(1, Math.round(CROSS.hx * s)), PX = Math.max(4, Math.round(CROSS.px * s * s));
  const out = [];
  for (const it of items) {
    const x = Math.max(0, Math.round(it.zone[0] * s)), y = Math.max(0, Math.round(it.zone[1] * (VH / 1080))), w = Math.min(VW - x, Math.round(it.zone[2] * s)), h = Math.min(VH - y, Math.round(it.zone[3] * (VH / 1080))), n = w * h;
    const a = it.t0 + CROSS.settle, z = Math.min(dur, it.t1 + CROSS.after);
    if (w < 2 || h < 2 || z <= a) continue;
    const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-ss", a.toFixed(3), "-t", (z - a).toFixed(3), "-i", render, "-vf", `crop=${w}:${h}:${x}:${y},format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
    const F = []; for (let o = 0; o + n <= buf.length; o += n) F.push(buf.subarray(o, o + n));
    if (F.length < 2) continue;
    const hist = new Uint32Array(256); for (const v of F[0]) hist[v]++;
    let acc = 0, bg = 0; for (; bg < 255; bg++) { acc += hist[bg]; if (acc >= n / 2) break; }
    const ink = (f, th) => { const o = new Uint8Array(n); for (let i = 0; i < n; i++) if (Math.abs(f[i] - bg) > th) o[i] = 1; return o; };
    const head = ink(F[0], CROSS.hi), hx = grow(head, HX, w, h); let hc = 0; for (const v of head) hc += v;
    if (hc < PX) { out.push({ ...it, empty: true }); continue; }
    let pw = ink(F[0], CROSS.lo), ps = head, run = 0, peak = 0, upTo = z; const spans = [], at = (k) => +(a + k / fps).toFixed(2);
    for (let k = 1; k < F.length; k++) {
      let still = 0; for (let i = 0; i < n; i++) if (head[i] && Math.abs(F[k][i] - bg) > CROSS.lo) still++;
      if (still < CROSS.up * hc) { upTo = at(k); break; }
      const cw = ink(F[k], CROSS.lo), cs = ink(F[k], CROSS.hi), gp = grow(pw, R2, w, h), gc = grow(cw, R2, w, h);
      let c = 0; for (let i = 0; i < n; i++) if (!hx[i] && ((cs[i] && !gp[i]) || (ps[i] && !gc[i]))) c++;
      if (c >= PX) { run++; peak = Math.max(peak, c); if (run === CROSS.run) spans.push({ t0: at(k - run + 1), t1: at(k), peak: 0 }); if (run >= CROSS.run) { const sp = spans.at(-1); sp.t1 = at(k); sp.peak = Math.round(peak / (s * s)); } }
      else { run = 0; peak = 0; }
      pw = cw; ps = cs;
    }
    if (spans.length) out.push({ ...it, spans, upTo });
  }
  return out;
}

/** A binary mask grown by r px (a square, separable). */
function grow(a, r, w, h) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const row = y * w; let last = -1e9; for (let x = 0; x < w; x++) { if (a[row + x]) last = x; if (x - last <= r) t[row + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (a[row + x]) last = x; if (last - x <= r) t[row + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (t[y * w + x]) last = y; if (y - last <= r) o[y * w + x] = 1; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) last = y; if (last - y <= r) o[y * w + x] = 1; } }
  return o;
}

// The same composition beat after beat (failure list:「每一拍同一個版型」). One frame per beat, its key pose (the end of
// its last important read, else its middle), two signatures: the structure map from edgeMaps (32×18, normalised to sum 1;
// edge = 1 − ½·L1, the overlap of where the structure is) and a content mask (48×27 luma, |pixel − frame median| > 40;
// mask = IoU, where the panels and type sit). same = the mean of the two. Two beats in a row with same ≥ 0.55 share a
// layout; a run of 3 beats or more is a template. Calibrated on film D: draft 5, the white
// panel bottom right under a small verb, eight times, runs 6 beats (02–07, same 0.61–0.91); draft 6, a new composition per
// beat, runs 2 at most (one pair at 0.65, the rest ≤ 0.52).
export const LAYOUT = { w: 48, h: 27, ink: 40, same: 0.55, run: 3 };

/** poses: [{ id, t }] → [{ id, t, edge, mask, same }] — similarity to the pose before it (null for the first). */
export function layouts(render, { fps, maps }, poses) {
  const FF = require("ffmpeg-static"), N = LAYOUT.w * LAYOUT.h;
  const sig = (t) => { const m = maps[Math.max(0, Math.min(maps.length - 1, Math.round(t * fps)))], s = m.reduce((a, x) => a + x, 0) || 1; return m.map((x) => x / s); };
  const mask = (t) => {
    const f = execFileSync(FF, ["-nostdin", "-v", "error", "-ss", Math.max(0, t).toFixed(3), "-i", render, "-vf", `scale=${LAYOUT.w}:${LAYOUT.h}:flags=area,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
    const bg = [...f].sort((a, b) => a - b)[N >> 1];
    return Uint8Array.from(f.subarray(0, N), (v) => (Math.abs(v - bg) > LAYOUT.ink ? 1 : 0));
  };
  const P = poses.map((p) => ({ ...p, s: sig(p.t), m: mask(p.t) }));
  return P.map((p, i) => {
    if (!i) return { id: p.id, t: p.t, edge: null, mask: null, same: null };
    const q = P[i - 1]; let l1 = 0, a = 0, u = 0;
    for (let c = 0; c < p.s.length; c++) l1 += Math.abs(p.s[c] - q.s[c]);
    for (let c = 0; c < N; c++) { a += p.m[c] & q.m[c]; u += p.m[c] | q.m[c]; }
    const edge = 1 - l1 / 2, iou = u ? a / u : 1;
    return { id: p.id, t: p.t, edge: +edge.toFixed(2), mask: +iou.toFixed(2), same: +((edge + iou) / 2).toFixed(2) };
  });
}

// A dissolve at a seam (user, 2026-10-29: hard cuts, whips, bar wipes and colour floods on the beat are all fine hand-overs; the
// one banned hand-over is a dissolve: the old picture and the new one semi-transparent together). Per seam (not open/close), the
// window is ±0.3 s around the planned time and the measured peak. Inside it, each change between two calm moments (luma
// motion ≥ 0.6 on the frame or a neighbour, from a calm frame to the next calm frame, at most 1 s) is one transition: A = the
// calm frame before it, B = the calm frame after. On a 48×27 picture, every cell that changes by ≥ 12 levels from A to B is
// followed through the transition: a dissolve moves every cell from A's value to B's in the same few frames, monotonically
// (each cell's 50 % crossing within ±2 frames at 60 fps of the median crossing, its 20→80 % taking ≥ 2 frames, and
// |B − A| ≥ 70 % of the path it travelled). A cut has no in-between frames; a wipe, a whip, a push or anything that moves
// crosses each cell at a different moment. share = the fraction of changed cells that cross together. Both pictures must be
// in it: of those cells' local contrast (|cell − its 7×7 mean|), the part that leaves (A's structure) and the part that
// arrives (B's) are each ≥ 20 % (bal), and of those cells that clearly lose or gain structure (by 4 levels), each side is
// ≥ 25 % (mix), so a fade through an empty frame or one element fading on its own is not a dissolve.
// Calibrated on two earlier films (2026-10-29): film E draft 28, S5 (9.78–10.15 s: share 0.33, bal 0.26, mix 0.36) and S11
// (31.78–32.27 s: 0.97, 0.35, 0.47) are dissolves; S4 (the clause dimming behind the lifted words: 0.36, bal 0.14), S8 and
// S12 (fades through an empty frame: 0.58 and 0.54, bal ≤ 0.01) are not; draft 35 S1 (「標題」fading on its own while the
// pen uncovers text: 0.80, bal 0.23, mix 0.19) is not; film D drafts 6 and 7 (hard cuts, bar wipe, whips, push-through):
// every seam share ≤ 0.19. Not caught: a dissolve whose layers also move (E draft 28 S7, the blurred clause pushed up while
// the versions slide in: share 0.11) — failure-list「交棒時新舊字疊在一起」covers it by eye. The margins are thin (bal 0.26 vs
// 0.23): recalibrate with each new case (video-draft-review evals/backtest.mjs).
export const DISSOLVE = { w: 48, h: 27, win: 0.3, calm: 0.6, maxLen: 1.0, dmin: 12, area: 0.02, mono: 0.7, sync: 2, width: 2, share: 0.25, bal: 0.2, mix: 0.25, r: 3 };

/** seams: [{ id, t, peak? }] (kind seam only) → [{ id, t0, t1, share, bal, changed, dissolve }] — the most dissolve-like transition per seam (or none). */
export function dissolves(render, v, fps, seams) {
  const FF = require("ffmpeg-static"), D = DISSOLVE, W = D.w, H = D.h, N = W * H;
  const buf = execFileSync(FF, ["-nostdin", "-v", "error", "-i", render, "-vf", `scale=480:270:flags=area,format=gray,scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  const F = []; for (let o = 0; o + N <= buf.length; o += N) F.push(buf.subarray(o, o + N));
  const n = Math.min(F.length, v.length), busy = (k) => Math.max(v[k] ?? 0, v[k - 1] ?? 0, v[k + 1] ?? 0) >= D.calm;
  const fr = (x) => Math.max(1, Math.round((x * fps) / 60)), SY = fr(D.sync), WD = fr(D.width), MAX = Math.round(D.maxLen * fps);
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
  const contrast = (f) => { const o = new Float64Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, c = 0; for (let j = Math.max(0, y - D.r); j <= Math.min(H - 1, y + D.r); j++) for (let i = Math.max(0, x - D.r); i <= Math.min(W - 1, x + D.r); i++) { s += f[j * W + i]; c++; } o[y * W + x] = Math.abs(f[y * W + x] - s / c); } return o; };
  const score = (ka, kb) => {
    const A = F[ka], B = F[kb], ch = []; for (let i = 0; i < N; i++) if (Math.abs(A[i] - B[i]) >= D.dmin) ch.push(i);
    if (ch.length < D.area * N) return null;
    const px = ch.map((i) => {
      const d = B[i] - A[i]; let tv = 0, t20 = null, t50 = null, t80 = null;
      for (let j = ka + 1; j <= kb; j++) { tv += Math.abs(F[j][i] - F[j - 1][i]); const r = (F[j][i] - A[i]) / d; if (t20 === null && r >= 0.2) t20 = j; if (t50 === null && r >= 0.5) t50 = j; if (t80 === null && r >= 0.8) t80 = j; }
      return { i, mono: Math.abs(d) / (tv || 1), t50, w: t20 !== null && t80 !== null ? t80 - t20 : null };
    });
    const T = med(px.map((p) => p.t50 ?? kb)), together = px.filter((p) => p.mono >= D.mono && p.t50 !== null && Math.abs(p.t50 - T) <= SY && p.w !== null && p.w >= WD);
    const cA = contrast(A), cB = contrast(B); let gone = 0, came = 0;
    let nG = 0, nC = 0;
    for (const p of together) { const x = cA[p.i] - cB[p.i]; if (x > 0) gone += x; else came -= x; if (x >= 4) nG++; else if (x <= -4) nC++; }
    const share = together.length / px.length, bal = Math.min(gone, came) / Math.max(gone + came, 1e-9), mix = Math.min(nG, nC) / Math.max(nG + nC, 1);
    return { t0: +(ka / fps).toFixed(2), t1: +(kb / fps).toFixed(2), at: +(T / fps).toFixed(2), share: +share.toFixed(2), bal: +bal.toFixed(2), mix: +mix.toFixed(2), changed: +(ch.length / N).toFixed(2), dissolve: share >= D.share && bal >= D.bal && mix >= D.mix };
  };
  return seams.map((m) => {
    const ts = [m.t, m.peak ?? m.t].filter(Number.isFinite), lo = Math.max(1, Math.round((Math.min(...ts) - D.win) * fps)), hi = Math.min(n - 2, Math.round((Math.max(...ts) + D.win) * fps));
    let best = null;
    for (let k = lo; k <= hi; k++) {
      if (!busy(k)) continue;
      let s = k; while (s > 1 && busy(s - 1) && k - s < MAX) s--;
      let e = k; while (e < n - 1 && busy(e) && e - s < MAX) e++;
      k = e;
      if (e - (s - 1) < 4) continue;
      const r = score(s - 1, e);
      if (r && (!best || (r.dissolve && !best.dissolve) || (r.dissolve === best.dissolve && r.share > best.share))) best = r;
    }
    return { id: m.id, t: m.t, ...(best ?? { share: 0, bal: 0, dissolve: false }) };
  });
}

// The key subject too small in a mostly empty frame (failure list「重點太小、空白太多」; film E draft 28's independent review:
// catch and compare were small type spread over an empty violet field, the hero a few dozen pixels). At each important read's
// key pose (its end − 0.1 s), in 1080p pixels:
//   line    = the tallest text line: at 960×540, ink = |Y − its 81×81 local mean| > 35, dilated 8 px sideways so a
//             line's letters join; inside each blob, rows with ink split into lines by empty rows; a line counts when its blob
//             is ≥ 1.5× as wide as the line is tall (ascenders and descenders included, so about 1.3–1.5× the cap height)
//   object  = the tallest thing: at 96×54, |Y − frame median| > 40, the largest connected component's height (≥ 6 cells)
//   subject = max(line, object); area = the share of 48×27 cells with ink (> 2 % of the cell) — how full the frame is.
// FAIL when subject < 130 px and area < 35 %. Calibrated on two earlier films (2026-10-29): film D drafts 6 and 7, the smallest
// subject 140 px (「A new draft.」alone, area 4 %), then 184 (「Say it.」); film E draft 28, 04 catch #1 100 px (area 17 %),
// 05 compare 104 (27 %), 02 marks 120 and 120 (27 %, 10 %) fail; 04 catch #2 166 passes (the Source pill's glow is measured
// as a line: a known overestimate). The read's own zone or crop is not used: the subject is whatever is biggest on screen.
export const SUBJECT = { local: 40, ink: 35, dx: 8, minLine: 6, wide: 1.5, obj: 40, objCells: 6, cellInk: 0.02, min: 130, area: 0.35 };

/** poses: [{ id, t }] → [{ id, t, line, object, subject, area, small }] (pixels at 1080p; area 0–1). */
export function subjects(render, poses) {
  const FF = require("ffmpeg-static"), U = SUBJECT, W = 960, H = 540, n = W * H;
  const grab = (t, w, h) => execFileSync(FF, ["-nostdin", "-v", "error", "-ss", Math.max(0, t).toFixed(3), "-i", render, "-vf", `scale=${w}:${h}:flags=area,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
  return poses.map(({ id, t }) => {
    const f = grab(t, W, H); if (f.length < n) return { id, t, line: 0, object: 0, subject: 0, area: 0, small: false };
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let r = 0; for (let x = 0; x < W; x++) { r += f[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + r; } }
    const R = U.local, ink = new Uint8Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      if (Math.abs(f[y * W + x] - m) > U.ink) ink[y * W + x] = 1;
    }
    let cells = 0; const CW = 48, CH = 27, cw = W / CW, ch = H / CH;
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) { let s = 0; for (let y = Math.round(cy * ch); y < Math.round((cy + 1) * ch); y++) for (let x = Math.round(cx * cw); x < Math.round((cx + 1) * cw); x++) s += ink[y * W + x]; if (s / (cw * ch) > U.cellInk) cells++; }
    const dil = new Uint8Array(n);
    for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (ink[y * W + x]) last = x; if (x - last <= U.dx) dil[y * W + x] = 1; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (ink[y * W + x]) last = x; if (last - x <= U.dx) dil[y * W + x] = 1; } }
    const lab = new Int32Array(n).fill(-1); let line = 0, id2 = 0;
    for (let i = 0; i < n; i++) {
      if (!dil[i] || lab[i] >= 0) continue;
      const st = [i], px = []; lab[i] = id2; let x0 = W, x1 = 0, y0 = H, y1 = 0;
      while (st.length) { const j = st.pop(), x = j % W, y = (j / W) | 0; px.push(j); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) if (k >= 0 && k < n && dil[k] && lab[k] < 0) { lab[k] = id2; st.push(k); } }
      id2++;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bh < U.minLine || bh > 0.8 * H || bw < 12) continue;
      const rows = new Uint16Array(bh); for (const j of px) if (ink[j]) rows[((j / W) | 0) - y0]++;
      let run = 0; for (let r = 0; r <= bh; r++) { if (r < bh && rows[r] >= 2) run++; else { if (run >= U.minLine && bw >= U.wide * run) line = Math.max(line, run * 2); run = 0; } }
    }
    const ow = 96, oh = 54, g = grab(t, ow, oh), med = [...g].sort((a, b) => a - b)[(ow * oh) >> 1], seen = new Uint8Array(ow * oh); let object = 0;
    for (let i = 0; i < ow * oh; i++) {
      if (seen[i] || Math.abs(g[i] - med) <= U.obj) continue;
      const st = [i]; seen[i] = 1; let y0 = oh, y1 = 0, c = 0;
      while (st.length) { const j = st.pop(), x = j % ow, y = (j / ow) | 0; c++; y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const k of [x > 0 ? j - 1 : -1, x < ow - 1 ? j + 1 : -1, j - ow, j + ow]) if (k >= 0 && k < ow * oh && !seen[k] && Math.abs(g[k] - med) > U.obj) { seen[k] = 1; st.push(k); } }
      if (c >= U.objCells) object = Math.max(object, (y1 - y0 + 1) * 20);
    }
    const subject = Math.max(line, object), area = cells / (CW * CH);
    return { id, t: +t.toFixed(2), line, object, subject, area: +area.toFixed(2), small: subject < U.min && area < U.area };
  });
}

// The film's energy over time (research/ai-animation-cases-A.md: Cinetic and huashu's energy curve — a hook in the first 3 s,
// the densest stretch around 30–60 % of the length, the biggest peak at 75–90 %, never two bars without something new).
// e(s) = the mean motion of second s, at 60 fps scale (v × 60 / fps, so a 30 fps ruler is comparable), each frame clipped at
// ENERGY.clip so a hard cut counts as one strong frame, not as the whole second. Events: where the motion (0.1 s mean) peaks
// at ≥ ENERGY.min and ≥ ENERGY.rise × the lowest point of the 0.5 s before it, 0.25 s apart (a move starting, a cut, a hit).
// Sub-checks, on a film of ENERGY.minLen seconds or more (calibration in video-draft-review references/gate.md §1):
//   hook   the first event after the opening fade (≥ 0.3 s) comes by 3 s                         → WARN energy-hook
//   sag    the middle third: the share of its seconds with e ≥ 1.0 is at least 0.30               → FAIL energy-sag
//   dense  the densest window (15 % of the length) is centred within 30–60 %                     → WARN energy-dense
//   peak   the biggest 2 s of the film is centred within 75–90 %                                   → WARN energy-peak
//   gap    no stretch of more than ENERGY.gapBars bars without an event (the end card excluded)   → WARN energy-gap
// hook, denseAt, peakAt and gapBars are the craft targets in library/rules/motion.json (energy.*); the rest is how they are measured
export const ENERGY = { clip: 20, min: 1.0, rise: 2, back: 0.5, sep: 0.25, hookFrom: 0.3, active: 1.0, sag: 0.30, dense: 0.15, peakWin: 2, tail: 1.0, minLen: 12, ...pick(MOTION.energy, "hook", "denseAt", "peakAt", "gapBars") };

/** → { T, seconds: [e…], events: [t…], hook, middle, dense, peak, gaps: [{ t0, t1, bars }], checks: { hook, sag, dense, peak, gap } } */
export function energy(v0, fps, { bpm = null, perBar = 4 } = {}) {
  const v = v0.map((x) => Math.min(ENERGY.clip, (x * 60) / fps)), n = v.length, T = n / fps;
  const cum = [0]; for (const x of v) cum.push(cum.at(-1) + x);
  const mean = (a, b) => { const i = Math.max(0, Math.round(a * fps)), j = Math.min(n, Math.round(b * fps)); return j > i ? (cum[j] - cum[i]) / (j - i) : 0; };
  const seconds = []; for (let s = 0; s < Math.floor(T); s++) seconds.push(+mean(s, s + 1).toFixed(2));
  // events
  const h = Math.max(1, Math.round(0.05 * fps)), sm = v.map((_, i) => mean((i - h) / fps, (i + h + 1) / fps));
  const back = Math.round(ENERGY.back * fps), sep = Math.round(ENERGY.sep * fps), ev = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(sm[i] >= sm[i - 1] && sm[i] > sm[i + 1]) || sm[i] < ENERGY.min) continue;
    let lo = Infinity; for (let j = Math.max(0, i - back); j < i; j++) lo = Math.min(lo, sm[j]);
    if (sm[i] < ENERGY.rise * Math.max(lo, 0.15)) continue;
    if (ev.length && i - ev.at(-1) < sep) { if (sm[i] > sm[ev.at(-1)]) ev[ev.length - 1] = i; continue; }
    ev.push(i);
  }
  const events = ev.map((i) => +(i / fps).toFixed(2));
  const hook = events.find((t) => t >= ENERGY.hookFrom) ?? null;
  // the middle third: how much of it moves
  const m0 = Math.floor(T / 3), m1 = Math.floor((2 * T) / 3), mid = seconds.slice(m0, m1);
  const middle = { t0: m0, t1: m1, active: mid.length ? +(mid.filter((e) => e >= ENERGY.active).length / mid.length).toFixed(2) : 1, mean: +(mid.reduce((s, e) => s + e, 0) / Math.max(1, mid.length)).toFixed(2) };
  const slide = (w) => { let best = -1, at = 0; for (let a = 0; a + w <= T + 1e-9; a += 0.1) { const m = mean(a, a + w); if (m > best) { best = m; at = a; } } return { t0: +at.toFixed(1), t1: +(at + w).toFixed(1), at: +((at + w / 2) / T).toFixed(2), level: +best.toFixed(2) }; };
  const dense = slide(ENERGY.dense * T), peak = slide(Math.min(ENERGY.peakWin, T));
  // gaps between events, in bars (the stretch after the last event is the end card: not a gap)
  const bar = bpm > 0 ? (perBar * 60) / bpm : null, gaps = [];
  if (bar) {   // the last second's events are the fade out: what comes after the last event before it is the end card
    const pts = [0, ...events.filter((t) => t < T - ENERGY.tail)];
    for (let i = 1; i < pts.length; i++) { const g = pts[i] - pts[i - 1]; if (g > ENERGY.gapBars * bar + 0.05) gaps.push({ t0: pts[i - 1], t1: pts[i], bars: +(g / bar).toFixed(1) }); }
  }
  const within = (x, [a, b]) => x >= a && x <= b;
  // a clip shorter than ENERGY.minLen has no arc to judge: measured and written, every check left open (true)
  const arc = T >= ENERGY.minLen;
  const checks = arc ? { hook: hook !== null && hook <= ENERGY.hook, sag: middle.active >= ENERGY.sag, dense: within(dense.at, ENERGY.denseAt), peak: within(peak.at, ENERGY.peakAt), gap: bar ? !gaps.length : null }
    : { hook: true, sag: true, dense: true, peak: true, gap: bar ? true : null };
  return { T: +T.toFixed(2), arc, bar, seconds, events, hook, middle, dense, peak, gaps: arc ? gaps : [], checks };
}

// How much a film looks like a slideshow (research/ai-animation-cases-B.md: huashu's deliver.py and OpenMontage's slideshow
// risk). Four parts, each 0–1 (1 = slideshow):
//   motion   fast frames (60 fps scale motion ≥ SLIDE.fast) as a share of the film: ≥ 0.06 → 0, ≤ 0.035 → 1 (deliver.py's lines)
//   blank    mid-film runs ≥ 0.3 s of a near-solid frame (98th − 2nd luma percentile < SLIDE.blankRange): 0, 1, 2+ → 0, 0.5, 1
//   repeat   adjacent beats with the same composition (layout.txt same ≥ LAYOUT.same) as a share of the pairs, ÷ 0.5, capped
//   violet   frames whose picture is ≥ half blue-violet (hue 220–300°, saturation ≥ 0.25) as a share: reported, a WARN past
//            30 %, and not in the score (the brand is violet)
// score = round(100 × (0.5 motion + 0.2 blank + 0.3 repeat)); judged on films of ENERGY.minLen s or more. Thresholds and calibration: gate.md §1.
export const SLIDE = { fast: 5, fastFail: 0.035, fastOk: 0.06, rate: 20, w: 64, h: 36, blankRange: 6, blankMin: 0.3, edge: 1.0, violetHue: [220, 300], violetSat: 0.25, violetPx: 0.5, violetShare: 0.30, weights: { motion: 0.5, blank: 0.2, repeat: 0.3 }, warn: 35, fail: 60 };

/** Per-frame picture stats at SLIDE.rate fps: [{ range, violet }] (luma 98th − 2nd percentile; blue-violet pixel share). */
export function pictureStats(render) {
  const FF = require("ffmpeg-static"), N = SLIDE.w * SLIDE.h;
  const buf = execFileSync(FF, ["-nostdin", "-v", "quiet", "-i", render, "-vf", `fps=${SLIDE.rate},scale=${SLIDE.w}:${SLIDE.h}:flags=area,format=rgb24`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const out = [], Y = new Float64Array(N);
  for (let o = 0; o + 3 * N <= buf.length; o += 3 * N) {
    let vio = 0;
    for (let p = 0; p < N; p++) {
      const r = buf[o + 3 * p], g = buf[o + 3 * p + 1], b = buf[o + 3 * p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      Y[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      if (mx < 40 || mx === mn || (mx - mn) / mx < SLIDE.violetSat) continue;
      let hue = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4);
      if (hue < 0) hue += 360;
      if (hue >= SLIDE.violetHue[0] && hue <= SLIDE.violetHue[1]) vio++;
    }
    const s = Float64Array.from(Y).sort();
    out.push({ range: s[Math.floor(N * 0.98)] - s[Math.floor(N * 0.02)], violet: vio / N });
  }
  return out;
}

/** → { score, parts: { motion, blank, repeat }, fast, blanks: [{ t0, t1 }], violet, repeats, pairs } */
export function slideRisk(v, fps, stats, layoutsList = []) {
  const n = v.length, T = n / fps, fast = v.filter((x) => (x * 60) / fps >= SLIDE.fast).length / Math.max(1, n);
  const motion = Math.max(0, Math.min(1, (SLIDE.fastOk - fast) / (SLIDE.fastOk - SLIDE.fastFail)));
  const blanks = []; let s = -1;
  for (let i = 0; i <= stats.length; i++) {
    const b = i < stats.length && stats[i].range < SLIDE.blankRange;
    if (b && s < 0) s = i;
    if (!b && s >= 0) { const t0 = s / SLIDE.rate, t1 = i / SLIDE.rate; if (t1 - t0 >= SLIDE.blankMin && t0 > SLIDE.edge && t1 < T - SLIDE.edge) blanks.push({ t0: +t0.toFixed(2), t1: +t1.toFixed(2) }); s = -1; }
  }
  const blank = Math.min(1, blanks.length / 2);
  const pairs = layoutsList.filter((l) => l.same !== null && l.same !== undefined), repeats = pairs.filter((l) => l.same >= LAYOUT.same).length;
  const repeat = pairs.length ? Math.min(1, repeats / pairs.length / 0.5) : 0;
  const violet = stats.length ? stats.filter((x) => x.violet >= SLIDE.violetPx).length / stats.length : 0;
  const W = SLIDE.weights, score = Math.round(100 * (W.motion * motion + W.blank * blank + W.repeat * repeat));
  const r2 = (x) => +x.toFixed(3);
  return { score, parts: { motion: r2(motion), blank: r2(blank), repeat: r2(repeat) }, fast: r2(fast), blanks, violet: r2(violet), repeats, pairs: pairs.length };
}
