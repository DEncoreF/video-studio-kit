// master.mjs: render a film's music + effects mix. Each file's level (levels.py), the spec from sections.json and the cue sheet
// (score.mjs), the track stretched to the film's tempo, cut and laid with the effects (pipelines/music/edit.py), an optional tilt,
// then the loudness target with a 4×-oversampled limiter and Apple's AAC encoder when present (ffmpeg's own overshot a
// transient by ~3 dB).
//   node <tool>/pipelines/mix/master.mjs <film> [--stems] [--trim N]   (from the studio root)
//   --stems   also writes build/stems/{music,mix}.wav and gain.json for measure.py
//   --trim N  N rounds of: render with stems, measure.py --apply (each cue to its level over the music), then the final render
// After the picture changes, re-export the cue times first: node <tool>/scripts/timeline-events.mjs <film>
// sections.json "mix": lufs (default -14; earshot's reference films median -14.8), limit (the limiter's ceiling, linear; default
// 0.71), tilt (an ffmpeg filter before the loudness gain, e.g. "lowshelf=f=150:g=-3,highshelf=f=2500:g=5" when earshot measures
// the mix darker than the references), and score.mjs's keys.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { TOOL, WORKSPACE } from "../../scripts/lib/paths.mjs";
import { score } from "./score.mjs";

const FF = createRequire(import.meta.url)("ffmpeg-static");
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const ff = (...a) => run(FF, ["-nostdin", "-loglevel", "error", "-y", ...a]);
// integrated loudness: the last "I:" of ebur128's summary
const lufsOf = (f) => { const m = [...spawnSync(FF, ["-nostdin", "-i", f, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr.matchAll(/I:\s+(-?[\d.]+)/g)];
  if (!m.length) throw new Error(`master: no loudness read from ${f}`); return +m.at(-1)[1]; };
const EDIT = join(TOOL, "pipelines/music/edit.py");

export async function master(filmArg, { stems = false } = {}) {
  run("python3", [join(TOOL, "pipelines/mix/levels.py"), resolve(WORKSPACE, filmArg)]);
  const { S, film, scoreFile, line } = await score(filmArg, { stems });
  console.log(line);
  const X = S.mix ?? {}, target = X.lufs ?? -14, limit = X.limit ?? 0.71, tilt = X.tilt ? `${X.tilt},` : "";
  const TMP = mkdtempSync(join(tmpdir(), "mix-"));
  try {
    ff("-i", join(film, S.track.file), "-af", `atempo=${(S.bpm / S.track.bpm).toFixed(6)}`, "-ar", "44100", "-ac", "2", "-sample_fmt", "s16", join(TMP, "track.wav"));
    const MG = +run("python3", [EDIT, join(film, scoreFile), join(TMP, "track.wav"), join(TMP, "mix.wav")]).match(/gain (\S+)/)[1];
    let src = join(TMP, "mix.wav");
    if (tilt) { ff("-i", src, "-af", X.tilt, join(TMP, "tilt.wav")); src = join(TMP, "tilt.wav"); }
    let G = target - lufsOf(src);
    for (let i = 0; i < 3; i++) {
      ff("-i", join(TMP, "mix.wav"), "-af", `${tilt}volume=${G}dB,aresample=192000,alimiter=limit=${limit}:level=false:attack=1:release=80,aresample=48000`, join(TMP, "norm.wav"));
      const D = target - lufsOf(join(TMP, "norm.wav"));
      if (Math.abs(D) < 0.15) break;
      G += D;
    }
    if (stems) {
      const sd = join(film, "build/stems"); mkdirSync(sd, { recursive: true });
      // the music alone at the mix's own output gain (edit.py master_gain) and the same loudness gain; measure.py reads it
      const mf = join(film, "build/score-music.json"), m = JSON.parse(readFileSync(mf, "utf8"));
      writeFileSync(mf, JSON.stringify({ ...m, master_gain: MG }, null, 1));
      run("python3", [EDIT, mf, join(TMP, "track.wav"), join(TMP, "music.wav")]);
      ff("-i", join(TMP, "music.wav"), "-af", `${tilt}volume=${G}dB`, "-ac", "1", join(sd, "music.wav"));
      ff("-i", join(TMP, "norm.wav"), "-ac", "1", "-ar", "44100", join(sd, "mix.wav"));
      writeFileSync(join(sd, "gain.json"), JSON.stringify({ master_gain: MG, loudness_db: G }) + "\n");
    }
    const out = join(film, S.music.src); mkdirSync(dirname(out), { recursive: true });
    try { run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "192000", join(TMP, "norm.wav"), join(TMP, "out.m4a")]); renameSync(join(TMP, "out.m4a"), out); }
    catch (e) { if (e.code !== "ENOENT") throw e; ff("-i", join(TMP, "norm.wav"), "-c:a", "aac", "-b:a", "192k", out); }
    console.log(`${S.music.src} (gain ${G} dB)`);
  } finally { rmSync(TMP, { recursive: true, force: true }); }
  return film;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), f = a.find((x) => !x.startsWith("--") && !/^\d+$/.test(x));
  if (!f) { console.error("usage: node pipelines/mix/master.mjs <film> [--stems] [--trim N]"); process.exit(1); }
  const ti = a.indexOf("--trim"), rounds = ti >= 0 ? +a[ti + 1] : 0;
  for (let i = 0; i < rounds; i++) {
    const film = await master(f, { stems: true });
    process.stdout.write(run("python3", [join(TOOL, "pipelines/mix/measure.py"), film, "--apply"]).split("\n").filter(Boolean).at(-1) + "\n");
  }
  const film = await master(f, { stems: a.includes("--stems") || rounds > 0 });
  if (rounds) process.stdout.write(run("python3", [join(TOOL, "pipelines/mix/measure.py"), film]));
}
