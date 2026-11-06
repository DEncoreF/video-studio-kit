#!/usr/bin/env node
// The user's own approved and rejected moments, kept as clips (not as rules). A taste note like「轉場俐落」is hard to carry in
// prose and easy to see in two clips side by side, so every verdict on a transition, a text entrance, a camera move or a hold is
// cut out of the render it was given on and kept in the personal layer, with the one-line reason, the user's words and, when
// there is one, the code that made it — the next film starts from these instead of re-tuning from the rules.
//   node scripts/exemplar.mjs add <video.mp4> --at 12.3-14.1 --kind seam --verdict keep|reject --why "一句：好在哪／錯在哪"
//        [--quote "使用者原話"] [--film <id>] [--code <file>] [--params "hold.sign=2.0"] [--tags a,b]
//   node scripts/exemplar.mjs list [--kind seam] [--verdict keep|reject] [--film <id>] [--json]
//   node scripts/exemplar.mjs show <id>
// Kept in <profile>/exemplars/: index.jsonl (one entry a line) and <id>/clip.mp4, strip.jpg (8 frames across the clip), code.*
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, extname, join, resolve } from "node:path";
import { EXEMPLARS, TOOL, VIDEOS, filmId } from "./lib/paths.mjs";

const KINDS = ["seam", "open", "close", "text", "camera", "hold", "ui", "material", "sound", "other"];
const INDEX = join(EXEMPLARS, "index.jsonl");
const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d = "") => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] ?? d : d; };
const die = (m) => { console.error(`exemplar: ${m}`); process.exit(1); };
const read = () => (existsSync(INDEX) ? readFileSync(INDEX, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const MARK = { keep: "✓", reject: "✗" };

if (cmd === "add") {
  const video = rest[0] && !rest[0].startsWith("--") ? resolve(rest[0]) : die("add <video.mp4> --at a-b --kind K --verdict keep|reject --why W");
  if (!existsSync(video)) die(`no ${video}`);
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(opt("at")); if (!m || +m[2] <= +m[1]) die("--at a-b（秒，b > a）");
  const [t0, t1] = [+m[1], +m[2]], kind = opt("kind"), verdict = opt("verdict"), why = opt("why");
  if (!KINDS.includes(kind)) die(`--kind 要是 ${KINDS.join("／")}`);
  if (!MARK[verdict]) die("--verdict keep 或 reject");
  if (!why) die("--why：一句話說好在哪或錯在哪（範例的價值在這句）");
  const code = opt("code") ? resolve(opt("code")) : ""; if (code && !existsSync(code)) die(`no ${code}`);
  const id = `${kind}-${createHash("sha256").update(`${video}|${t0}|${t1}`).digest("hex").slice(0, 8)}`, dir = join(EXEMPLARS, id);
  if (read().some((e) => e.id === id)) die(`${id} 已經記過（同一支影片的同一段）`);
  mkdirSync(dir, { recursive: true });
  const FF = createRequire(join(TOOL, "package.json"))("ffmpeg-static"), run = (a) => execFileSync(FF, ["-nostdin", "-v", "error", "-y", ...a]);
  run(["-ss", String(t0), "-to", String(t1), "-i", video, "-vf", "scale=960:-2", "-c:v", "libx264", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", join(dir, "clip.mp4")]);
  const n = 8, step = (t1 - t0) / n;
  run(["-ss", String(t0), "-t", String(t1 - t0), "-i", video, "-vf", `fps=${n / (t1 - t0)},scale=240:-2,tile=${n}x1`, "-frames:v", "1", join(dir, "strip.jpg")]);
  if (code) copyFileSync(code, join(dir, `code${extname(code)}`));
  const film = opt("film") || (video.startsWith(VIDEOS) ? filmId(video).split("/renders/")[0] : "");
  const entry = { id, kind, verdict, why, quote: opt("quote"), film, source: video, at: [t0, t1], frameStep: +step.toFixed(3),
    code: code ? `code${extname(code)}` : "", params: opt("params"), tags: opt("tags") ? opt("tags").split(",").map((s) => s.trim()).filter(Boolean) : [], added: new Date().toISOString().slice(0, 10) };
  appendFileSync(INDEX, JSON.stringify(entry) + "\n");
  console.log(`${MARK[verdict]} ${id}  ${kind}  ${why}\n  ${join(dir, "strip.jpg")}`);
} else if (cmd === "list") {
  const E = read().filter((e) => (!opt("kind") || e.kind === opt("kind")) && (!opt("verdict") || e.verdict === opt("verdict")) && (!opt("film") || e.film.includes(opt("film"))));
  if (rest.includes("--json")) { console.log(JSON.stringify(E.map((e) => ({ ...e, strip: join(EXEMPLARS, e.id, "strip.jpg"), clip: join(EXEMPLARS, e.id, "clip.mp4") })), null, 1)); process.exit(0); }
  if (!E.length) { console.log(`沒有範例${opt("kind") ? `（kind ${opt("kind")}）` : ""}：使用者核可或退回一段動態時，用 exemplar.mjs add 記下來`); process.exit(0); }
  for (const e of E) console.log(`${MARK[e.verdict]} ${e.id.padEnd(17)} ${e.kind.padEnd(8)} ${e.why}${e.quote ? `（「${e.quote}」）` : ""}${e.code ? "  [code]" : ""}\n    ${join(EXEMPLARS, e.id, "strip.jpg")}`);
  console.log(`\n${E.filter((e) => e.verdict === "keep").length} 個核可、${E.filter((e) => e.verdict === "reject").length} 個退回；看 strip.jpg（8 格），要動態看 clip.mp4，有 [code] 的直接拿 code 改參數`);
} else if (cmd === "show") {
  const e = read().find((x) => x.id === rest[0]) ?? die(`沒有 ${rest[0] ?? "（給 id）"}`);
  console.log(JSON.stringify({ ...e, dir: join(EXEMPLARS, e.id) }, null, 1));
} else die("add | list | show（見檔頭）");
