// cues.mjs: the helpers a film's cue sheet (build/cues.mjs) is written with, so the film keeps only its list of cues.
// Times come from the film's build/events.json (node <tool>/scripts/timeline-events.mjs <film>; re-export after the
// picture changes and the cues follow). Kit roles come from assets/sfx/kit/kit.lock.json (earshot kit render), file
// levels from build/levels.json (levels.py), per-cue trims from build/trim.json (measure.py --apply).
//
//   export default ({ sheet }) => {   // score.mjs hands the film this module's sheet, so the film needs no path to the toolkit
//     const S = sheet(import.meta.url, { role: { "hw-impact": "land", ... }, bedDb: { "hw-click": 6.5 }, layers: { land: [["lib/soft-impact", -6, "onset"]] } });
//     const { ev, hit, run } = S;
//     return S.done([hit(ev("book", "y").end, "hw-impact", "secondary", "book"), ...]);
//   };
//
// A cue is [t, {file, gain, tier, ev, key, bed, ...}] for pipelines/music/edit.py. `file` is a kit role's file name (ROLE maps
// it to a role: the role's next take is placed so its onset / peak lands on t + offset_ms) or a recording in assets/sfx
// (without .wav). Options:
//   role      file name -> kit role
//   bedDb     dB over the music per file name, on top of each role's bed_db from the lock
//   alias     (file) -> name, for numbered recordings that share one role (ui-key-3 -> key)
//   moves     roles whose pan / pan_from / pan_to are kept (things travelling); every other cue stays centred
//   swap      role file -> recordings used instead of the kit, rotating ([files] or {files, align}: align replaces the cue's)
//   keepKit   cue ev names that keep the kit even when their role is swapped
//   gain      starting gain per tier (default 0.8 for all): each role's level over the bed sets the rest
//   layers    role -> [[source, dB under its sound, "onset" | "peak", n takes?]]: layers at the same sync point, measured with it
//   build     (cue) -> extra layers (a riser into a hero)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const json = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { if (fallback !== undefined) return fallback; throw e; } };

export function sheet(url, o = {}) {
  const B = url.startsWith("file:") ? dirname(fileURLToPath(url)) : url;   // the film's build/
  const E = json(join(B, "events.json")).events.filter((e) => e.kind !== "set");
  const LOCK = json(join(B, "../assets/sfx/kit/kit.lock.json"), { roles: {} }).roles;
  const LV = json(join(B, "levels.json"), {}), TRIM = json(join(B, "trim.json"), {});
  const ROLE = o.role ?? {}, MOVES = new Set(o.moves ?? []), SWAP = o.swap ?? {}, KEEP = new Set(o.keepKit ?? []);
  const TIER = { hero: 0.8, primary: 0.8, secondary: 0.8, texture: 0.8, ...o.gain };
  const BEDDB = { ...Object.fromEntries(Object.entries(ROLE).map(([f, r]) => [f, LOCK[r]?.bed_db])), ...o.bedDb };
  const alias = o.alias ?? ((f) => f);

  const id = (g) => g.id || "." + g.classes.join(".");
  // the n-th tween (from 0) on a target with this property, at or after `after`
  const ev = (target, prop, n = 0, after = 0) => {
    const hit = E.filter((e) => e.t >= after - 1e-6 && e.targets.some((g) => id(g) === target) && e.props.includes(prop));
    if (!hit[n]) throw new Error(`cues: no tween #${n} of ${target} ${prop} after ${after}`);
    return hit[n];
  };
  const evs = (target, prop, from, to) => E.filter((e) => e.t >= from && e.t < to && e.targets.some((g) => id(g) === target) && e.props.includes(prop));
  const one = (target, prop, after = 0) => ev(target, prop, 0, after);
  const SX = (n) => `../assets/sfx/${n}.wav`, rr = (list, i) => list[i % list.length];
  const V = [1, 0.84, 1.1, 0.92];   // ±1.5 dB along a run, never pitch

  const turn = {}, seen = {}, rt = {}, lt = {};
  // the next take of a kit role, started so its sync point lands on `at`
  const take = (role, at, counter) => { const R = LOCK[role], tk = R.takes[(turn[counter] = (turn[counter] ?? -1) + 1) % R.takes.length];
    return [+(at - tk[`${R.align}_s`]).toFixed(4), `../assets/sfx/kit44/${tk.file}`]; };
  // each cue's trim is keyed "<ev>#<n>" (its n-th occurrence); a layer under a hit ({of: "<ev>"}) takes that hit's trim
  const C = (t, file, tier, ev_, opt = {}) => { let { g = 1, of, pan, pan_from, pan_to, bed, align, ...rest } = opt;
    if (MOVES.has(ROLE[file]) && (pan !== undefined || pan_from !== undefined)) Object.assign(rest, pan !== undefined ? { pan } : { pan_from, pan_to });
    if (SWAP[file] && !KEEP.has(ev_)) { const sw = Array.isArray(SWAP[file]) ? { files: SWAP[file] } : SWAP[file];
      bed ??= LOCK[ROLE[file]].bed_db; if ("align" in sw) align = sw.align ?? undefined;
      file = sw.files[(rt[file] = (rt[file] ?? -1) + 1) % sw.files.length]; }
    const key = of ? `${of}#0` : `${ev_}#${(seen[ev_] = (seen[ev_] ?? -1) + 1)}`;
    const name = alias(file), role = ROLE[name];
    const base = { gain: +(TIER[tier] * g * (TRIM[key] ?? 1)).toFixed(3), tier, ev: ev_, key, bed: bed ?? BEDDB[name], at: t, ...(role ? { role } : {}), ...(of ? { of } : {}), ...rest };
    if (!role) return [t, { file: SX(file), ...(align ? { align } : {}), ...base }];
    const [at, f] = take(role, t + LOCK[role].offset_ms / 1000, role);
    return [at, { file: f, ...base }]; };
  const hit = (t, file, tier, ev_, opt = {}) => C(t, file, tier, ev_, { align: "peak", ...opt });
  // a run: one cue per step time, the steps before the last 1.5 dB under the role's level (the run lands on its last step)
  const run = (times, file, tier, ev_) => times.map((t, i, a) => hit(t, file, tier, ev_, { g: rr(V, i), ...(i < a.length - 1 ? { bed: BEDDB[file] - 1.5 } : {}) }));
  // a staggered tween over n targets, each `each` long: the step times, `lead` after each target starts
  const steps = (e, n, each, lead) => [...Array(n).keys()].map((k) => e.t + k * (e.dur - each) / (n - 1) + lead);

  // layers under each cue's sound, gain from the two files' loudest 50 ms (levels.json); measured with it ({of: key})
  const layers = ([, m]) => [...(o.layers?.[m.role] ?? []), ...(o.build?.(m) ?? [])].map(([src, rel, al, n]) => {
    const k = (lt[src] = (lt[src] ?? -1) + 1), name = n ? `${src}-${(k % n) + 1}` : src, anchor = m.at + LOCK[m.role].offset_ms / 1000;
    let t, file, extra = {};
    if (ROLE[name]) [t, file] = take(ROLE[name], anchor, name);
    else { file = SX(name); if (al === "peak") { t = anchor; extra.align = "peak"; } else t = anchor - 0.005; }
    return [+t.toFixed(4), { file, gain: +(m.gain * 10 ** ((LV[m.file] - LV[file] + rel) / 20)).toFixed(3), tier: m.tier, ev: m.ev, key: `${m.key}~${name}`, of: m.key, ...extra }];
  });
  const done = (main) => [...main, ...main.flatMap(layers)].sort((a, b) => a[0] - b[0]);
  return { E, LOCK, ROLE, BEDDB, ev, evs, one, C, hit, run, steps, rr, V, SX, done };
}
