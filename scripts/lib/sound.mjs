// The render's sound against the mastering spec (video-motion-craft references/sound.md §4, numbers in library/rules/motion.json
// `sound`): EBU R128 integrated loudness, true peak, and sudden rises — a momentary loudness this many LU above the median of
// the window before it (the same measure as film-metrics.sh). ffmpeg's ebur128 filter, read from its log.
import { execFileSync, spawnSync } from "node:child_process";
import { MOTION } from "./rules.mjs";

/** { audio: false } for a file without an audio stream; else integrated LUFS, true peak dBTP, rises [{ t, rise }] and silent. */
export function loudness(file, { ff, fp }) {
  const streams = execFileSync(fp, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
  if (!streams) return { audio: false };
  const log = spawnSync(ff, ["-nostdin", "-hide_banner", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 }).stderr;
  const M = [...log.matchAll(/t:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-inf)/g)].map((m) => ({ t: +m[1], m: m[2] === "-inf" ? -120 : +m[2] }));
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const I = +(summary.match(/I:\s*(-?[\d.]+|-inf)\s*LUFS/)?.[1] ?? NaN), TP = +(summary.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/)?.[1] ?? NaN);
  const { jump, jumpWindow } = MOTION.sound, rises = [];
  for (const { t, m } of M) {
    const prev = M.filter((x) => x.t >= t - jumpWindow && x.t < t && x.m > -70).map((x) => x.m).sort((a, b) => a - b);
    if (prev.length > 5) { const med = prev[Math.floor(prev.length / 2)], r = m - med; if (r >= jump && !(rises.at(-1) && t - rises.at(-1).t < 1)) rises.push({ t: +t.toFixed(1), rise: +r.toFixed(1) }); }
  }
  return { audio: true, integrated: Number.isFinite(I) ? I : null, truePeak: Number.isFinite(TP) ? TP : null, rises, silent: !M.some((x) => x.m > -70) };
}
