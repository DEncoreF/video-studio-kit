// sound-gate.mjs: the sound half of the draft gate. review-pack's PASS.json binds a render's picture; a new mix muxed onto the
// same picture (every sound version of one film: v6b → v6d kept PASS e0e3dfa76c94) went to the user on a rule alone
// ("run earshot critique and timeline before sending sound"). This runs both, judges them, and binds the result to the file's
// decoded audio, so a re-encode that copies the audio (the phone copy) is covered and any change to the mix is not.
//   node scripts/sound-gate.mjs <film or test dir> <file.mp4> [--cues cues.json]   # earshot critique + timeline → SOUND-PASS.json (exit 0) or FAIL (exit 1)
//   node scripts/sound-gate.mjs --verify <file.mp4>                                 # exit 0 only while a SOUND-PASS.json in its project holds its audio
// Cues default to the film's build/score.json (the mix's effects at their action times; layers and beds left out). Output in
// <dir>/review/sound/: critique.*, timeline.*, cues.json and SOUND-PASS.json (one entry per passed audio). Fails, from
// library/rules/motion.json sound.ears: a verdict outside `verdicts`, any critical or major issue, under `heard` of the cues
// answered within 100 ms, more than `missed` cues with no sound. The user can waive one in <dir>/review-waivers.json
// (checks sound-verdict, sound-issues, sound-heard, sound-missed; their words in "quote", as for review-pack).
// The draft-gate hook asks verifySound() for every video with an audio track in a project that mixes its own sound.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { MOTION } from "./lib/rules.mjs";
import { TOOL } from "./lib/paths.mjs";
import { validWaiver } from "./review-pack.mjs";

const FF = createRequire(import.meta.url)("ffmpeg-static");
const PY = process.env.EARSHOT_PYTHON || join(homedir(), "Projects/earshot/.venv/bin/python");
const EARS = MOTION.sound.ears;
const readJSON = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

/** md5 of the decoded first audio stream, or null when the file has none. */
export function audioHash(file) {
  const r = spawnSync(FF, ["-nostdin", "-v", "error", "-i", file, "-map", "0:a:0", "-f", "md5", "-"], { encoding: "utf8" });
  const m = r.stdout?.match(/MD5=([0-9a-f]+)/);
  return m ? m[1] : null;
}

/** The project folder (videos/<project>) a file lives in. */
export function projectDir(file) {
  const parts = resolve(file).split(sep), v = parts.lastIndexOf("videos");
  return v < 0 || parts.length < v + 3 ? null : parts.slice(0, v + 2).join(sep);
}

const SKIP = new Set(["node_modules", ".git", ".hyperframes", "out", "renders", "assets", "previews", "stems", "frames"]);
function walk(dir, hit, depth) {
  let names = []; try { names = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    const p = join(dir, n);
    if (hit(n, p)) out.push(p);
    else if (depth > 0 && !SKIP.has(n) && !n.endsWith(".frames")) { try { if (statSync(p).isDirectory()) out.push(...walk(p, hit, depth - 1)); } catch { /* gone */ } }
  }
  return out;
}

/** Does this project mix its own sound (a pipelines/mix or edit.py spec somewhere)? Then its videos need a sound pass. */
export const mixesSound = (proj) => walk(proj, (n, p) => n === "score.json" && p.includes(`${sep}build${sep}`), 4).length > 0;

/** An audition is the point of the A/B: it goes out to be chosen from, like an unreviewed picture preview. */
export const isAudition = (file) => /audition|candidate/i.test(relative(projectDir(file) ?? "", resolve(file)));

/** → { gated: false } | { gated: true, ok, why } */
export function verifySound(file) {
  const f = resolve(file), proj = projectDir(f);
  if (!proj || isAudition(f) || !mixesSound(proj)) return { gated: false };
  const h = audioHash(f);
  if (!h) return { gated: false };
  for (const p of walk(proj, (n) => n === "SOUND-PASS.json", 6)) {
    const e = (readJSON(p, {}).passes ?? []).find((x) => x.audio_md5 === h);
    if (e) return { gated: true, ok: true, why: `SOUND PASS ${basename(e.file)} ${h.slice(0, 12)}（${e.verdict}，${e.heard_txt}）` };
  }
  return { gated: true, ok: false, why: [`${basename(f)} 的聲音（${h.slice(0, 12)}）還沒過聲音關卡。`,
    `先跑 node ${TOOL}/scripts/sound-gate.mjs <片或試片資料夾> ${relative(process.cwd(), f)}（earshot critique + timeline，約 1–2 分鐘）。`].join("\n") };
}

function cuesFromScore(dir, outFile) {
  const S = readJSON(join(dir, "build/score.json"));
  if (!S?.sfx?.length) return null;
  const fps = 60, ev = S.sfx.filter((c) => !c.of && c.ev !== "bed").map((c) => ({ f: Math.round((c.at ?? c.t) * fps), kind: c.ev ?? c.tier ?? "cue", id: c.key ?? c.ev ?? "cue" }));
  writeFileSync(outFile, JSON.stringify({ fps, events: ev.sort((a, b) => a.f - b.f) }));
  return outFile;
}

function gate(dirArg, fileArg, cuesArg) {
  const dir = resolve(dirArg), file = resolve(fileArg), out = join(dir, "review/sound");
  if (!existsSync(file)) { console.error(`✗ 沒有 ${file}`); process.exit(1); }
  const h = audioHash(file);
  if (!h) { console.error(`✗ ${basename(file)} 沒有音軌`); process.exit(1); }
  if (!existsSync(PY)) { console.error(`✗ 找不到 earshot（${PY}；EARSHOT_PYTHON 可改）：聲音關卡要 earshot 才能聽`); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const cues = cuesArg ? resolve(cuesArg) : cuesFromScore(dir, join(out, "cues.json"));
  console.log(`sound-gate: earshot 聽 ${relative(process.cwd(), file)}${cues ? `，對 ${relative(process.cwd(), cues)} 的 cue` : "（沒有 cue 表：只看評分）"}`);
  const r = spawnSync(PY, [join(TOOL, "scripts/lib/earshot-gate.py"), file, out, ...(cues ? [cues] : [])], { encoding: "utf8", env: { EARSHOT_THREADS: "3", ...process.env } });
  if (r.status !== 0) { console.error(`✗ earshot 沒跑完：${(r.stderr || "").trim().split("\n").slice(-3).join(" ")}`); process.exit(1); }
  const R = JSON.parse(r.stdout.trim().split("\n").at(-1));
  const F = [];
  if (!EARS.verdicts.includes(R.verdict)) F.push(["sound-verdict", `評分 ${R.verdict}（${R.in_range}/${R.scored}），要 ${EARS.verdicts.join(" / ")}：看 critique.txt 的 actions`]);
  if (R.critical || R.major) F.push(["sound-issues", `${R.critical} 個 critical、${R.major} 個 major：先修 critique.txt 列的項目`]);
  if (R.cues.n && R.cues.heard < EARS.heard) F.push(["sound-heard", `${Math.round(R.cues.heard * 100)}% 的 cue 在 100 ms 內聽得到（要 ≥ ${Math.round(EARS.heard * 100)}%）：看 timeline.txt`]);
  if (R.cue_misses.length > EARS.missed) F.push(["sound-missed", `${R.cue_misses.length} 個 cue 沒有聲音：${R.cue_misses.slice(0, 8).map((m) => `${m.t} 秒 ${m.id}`).join("、")}`]);
  const waivers = (readJSON(join(dir, "review-waivers.json"), []) ?? []).filter(validWaiver);
  const open = F.filter(([code]) => !waivers.some((w) => w.check === code)), waived = F.filter(([code]) => waivers.some((w) => w.check === code));
  const heard_txt = R.cues.n ? `${R.cues.n} 個 cue ${Math.round(R.cues.heard * 100)}% 聽得到、中位數 ${R.cues.median_ms} ms` : "沒有 cue 表";
  const warn = R.cuts.no_sound?.length ? [`畫面切點沒有聲音：${R.cuts.no_sound.join("、")} 秒（timeline 標 NO HIT；刻意安靜的就留著）`] : [];
  if (open.length) { console.log(`✗ 聲音關卡沒過（${open.length} 項）`); open.forEach(([c, m]) => console.log(`  \`${c}\` ${m}`)); warn.forEach((w) => console.log(`  提醒：${w}`)); process.exit(1); }
  const pf = join(out, "SOUND-PASS.json"), P = readJSON(pf, { passes: [] });
  const entry = { file, audio_md5: h, sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), verdict: R.verdict, score: R.score,
    in_range: `${R.in_range}/${R.scored}`, cues: R.cues, cuts: R.cuts, heard_txt, waived: waived.map(([c, m]) => ({ code: c, msg: m })), warns: warn, passed_at: new Date().toISOString() };
  P.passes = [...P.passes.filter((x) => x.audio_md5 !== h), entry];
  writeFileSync(pf, JSON.stringify(P, null, 1) + "\n");
  console.log(`✓ 聲音關卡通過：${basename(file)} 音訊 ${h.slice(0, 12)}；${R.verdict} ${R.in_range}/${R.scored}、${heard_txt}${waived.length ? `；豁免 ${waived.length}` : ""} → ${relative(process.cwd(), pf)}`);
  warn.forEach((w) => console.log(`  提醒：${w}`));
  console.log(`  回報時貼這一行：SOUND PASS ${basename(file)} ${h.slice(0, 12)} · ${R.verdict} ${R.in_range}/${R.scored} · ${heard_txt}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const a = process.argv.slice(2);
  if (a[0] === "--verify") { const r = verifySound(a[1]); console.log(r.gated ? `${r.ok ? "✓" : "✗"} ${r.why}` : "不需要聲音關卡（沒有音軌、試聽片，或這個專案沒有自己混音）"); process.exit(r.gated && !r.ok ? 1 : 0); }
  const ci = a.indexOf("--cues"), pos = a.filter((x, i) => !x.startsWith("--") && !(ci >= 0 && i === ci + 1));
  if (pos.length < 2) { console.error("usage: node scripts/sound-gate.mjs <film dir> <file.mp4> [--cues cues.json] | --verify <file.mp4>"); process.exit(1); }
  gate(pos[0], pos[1], ci >= 0 ? a[ci + 1] : null);
}
