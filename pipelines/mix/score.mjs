// score.mjs: a film's build/sections.json + cue sheet -> the spec pipelines/music/edit.py renders. The chosen track is cut to the
// bar grid by sections.json's map; the music steps down before each hero hit and comes back on it (sound.md §4); the effects
// are the cue sheet's (sections.json "cues", default build/cues.mjs).
//   node <tool>/pipelines/mix/score.mjs <film> [--stems]   (master.mjs runs the whole chain; --stems also writes build/score-music.json)
// sections.json "mix" (all optional):
//   musicGain  music level into edit.py's master (0.5: well under its tanh, which squashed every click laid on a louder groove)
//   stopDown   {lead: s before the hit, to: gain}: the step down (default 0.4 s to 0.35, about −9 dB: earshot's launch films 6–12 dB, 0.3–0.5 s)
//   bedSteps   [[from s, to s, gain]]: a whole stretch of the music lower (in over 1 s, back over 2 s)
//   xfade, fadeIn, fadeOut, seed
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WORKSPACE } from "../../scripts/lib/paths.mjs";
import { sheet } from "./cues.mjs";

export async function score(filmArg, { stems = false } = {}) {
  const film = resolve(WORKSPACE, filmArg);
  const S = JSON.parse(readFileSync(join(film, "build/sections.json"), "utf8")), X = S.mix ?? {};
  const bar = (60 / S.bpm) * S.beatsPerBar, stretch = S.bpm / S.track.bpm, down0 = S.track.firstDownbeat / stretch, r = (x) => +x.toFixed(4);
  const end = Math.max(...S.map.map((m) => m.bar + m.bars));
  const segments = S.map.map((m) => ({ at: r(S.offset + m.bar * bar), from: r(down0 + m.from * bar),
    dur: r(m.bar + m.bars >= end ? S.total - S.offset - m.bar * bar + 0.3 : m.bars * bar), ...(m.xin ? { xin: m.xin } : {}) }));
  // the stop-down: 50 ms down, held to 20 ms before the hit, back on it (not a duck after the hit, not a dip under every effect)
  const sd = { lead: 0.4, to: 0.35, ...X.stopDown }, env = [[0, 1]];
  for (const t of S.heroes ?? []) env.push([r(t - sd.lead - 0.05), 1], [r(t - sd.lead), sd.to], [r(t - 0.02), sd.to], [r(t + 0.01), 1]);
  // the cue sheet exports its cues, or a function that gets the helpers ({ sheet }: cues.mjs) and returns them
  const mod = (await import(pathToFileURL(join(film, S.cues ?? "build/cues.mjs")).href + `?t=${Date.now()}`)).default;
  const C = typeof mod === "function" ? await mod({ sheet }) : mod;
  const sfx = C.map(([t, o]) => ({ t: r(t), kind: "sample", ...o }));
  env.sort((a, b) => a[0] - b[0]);
  const BED = X.bedSteps ?? [], bed = (x) => BED.reduce((g, [a, b, v]) => g * (x <= a - 1 || x >= b + 2 ? 1 : x >= a && x <= b ? v : 1 - (1 - v) * (x < a ? x - (a - 1) : ((b + 2) - x) / 2)), 1);
  for (const [a, b] of BED) env.push([a - 1, 1], [a, 1], [b, 1], [b + 1, 1], [b + 2, 1]);
  env.sort((a, b) => a[0] - b[0]);
  for (const p of env) p[1] = r(p[1] * bed(p[0]));
  // effects dry (no room, no softening): earshot measured the mixes darker than the references
  const spec = { duration: S.total, seed: X.seed ?? 7, segments, xfade: X.xfade ?? 0.05, music_gain: X.musicGain ?? 0.5, fade_in: X.fadeIn ?? 0,
    fade_out: X.fadeOut ?? 1.5, music_env: env, sfx_gain: S.sfxGain ?? 1, sfx };
  const out = (n, s) => writeFileSync(join(film, n), JSON.stringify(s, null, 1) + "\n");
  const scoreFile = S.score ?? "build/score.json";
  out(scoreFile, spec);
  // --stems: the music alone (no effects), rendered at the mix's output gain so measure.py reads the bed the mix has
  if (stems) out("build/score-music.json", { ...spec, sfx: [] });
  return { S, film, scoreFile, line: `${scoreFile}: ${segments.length} music segments, ${sfx.length} effects, ${S.total} s` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [f] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!f) { console.error("usage: node pipelines/mix/score.mjs <film> [--stems]"); process.exit(1); }
  console.log((await score(f, { stems: process.argv.includes("--stems") })).line);
}
