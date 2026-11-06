#!/usr/bin/env node
// A campaign: one moment of a film made several ways at once, measured, shown side by side, and the user picks. Claude cannot
// judge how motion feels from frames (it sees stills well, motion poorly), but code makes variants cheap — so the taste call is
// the user's, between finished options, instead of a draft-after-draft argument in words. The pick and the rejects become
// exemplars (scripts/exemplar.mjs), so the next film starts from what won.
//   node scripts/campaign.mjs new <projectDir> <name> --kind seam --question "主角拍的交棒用哪一種？"
//        --variant "a=甩鏡帶模糊@<card id>" --variant "b=條狀掃過@<card id>" … [--from <test or film dir to copy>] [--no-refs]
//        (each variant names the reference card it borrows from — refs.mjs cards; --no-refs only when there is truly none)
//   node scripts/campaign.mjs render  <projectDir>/campaigns/<name>   (hf render → out/clip.mp4, 60 fps, then review-pack test mode)
//   node scripts/campaign.mjs compare <projectDir>/campaigns/<name> [--all]
//   node scripts/campaign.mjs pick    <projectDir>/campaigns/<name> <key> --why "好在哪" [--quote "原話"] [--reject "b=太軟" …] [--code <file>]
// Each variant is a test clip at <projectDir>/tests/_<name>-<key> (built like any test clip, measured in test mode); the comparison
// goes to <projectDir>/previews/campaign-<name>/ (compare.mp4 grid, compare.jpg strips, COMPARE.md) — an unreviewed preview to
// choose from, and only variants that passed their measures are in it unless --all.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { verify } from "./review-pack.mjs";
import { cardFrames, findRef } from "./lib/refcards.mjs";

const TOOL = decodeURIComponent(new URL("..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json"));
const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d = "") => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] ?? d : d; };
const all = (k) => rest.flatMap((a, i) => (a === `--${k}` ? [rest[i + 1]] : []));
const pos = rest.filter((a, i) => !a.startsWith("--") && !(i && rest[i - 1].startsWith("--") && rest[i - 1] !== "--all"));
const die = (m) => { console.error(`campaign: ${m}`); process.exit(1); };
const readJSON = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const FF = require("ffmpeg-static"), FP = require("@ffprobe-installer/ffprobe").path;
const KINDS = ["seam", "open", "close", "text", "camera", "hold", "ui", "material", "sound", "other"];

/** campaign.json of a campaign folder, with the paths every command needs. */
function load(dir) {
  const C = readJSON(join(resolve(dir), "campaign.json")) ?? die(`沒有 ${join(dir, "campaign.json")}（先 campaign.mjs new）`);
  const project = resolve(dir, "../..");
  return { C, dir: resolve(dir), project, preview: join(project, "previews", `campaign-${C.name}`),
    V: C.variants.map((v) => { const d = join(project, "tests", `_${C.name}-${v.key}`); return { ...v, dir: d, clip: join(d, "out/clip.mp4"), review: join(d, "review") }; }) };
}
/** pass: PASS.json still holds for the clip; fail: measured with FAIL codes; none: not rendered or not measured. */
function status(v) {
  if (!existsSync(v.clip)) return { state: "none", why: "還沒 render" };
  if (verify(v.review, v.clip).ok) return { state: "pass", why: "量測通過" };
  const fails = (readJSON(join(v.review, "pack.json"))?.findings ?? []).filter((f) => f.level === "FAIL");
  return fails.length ? { state: "fail", why: [...new Set(fails.map((f) => f.code))].join("、") } : { state: "none", why: "還沒量測或 --check 沒過" };
}
const duration = (f) => +execFileSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim();

if (cmd === "new") {
  const [projectArg, name] = pos; if (!projectArg || !name) die("new <projectDir> <name> --kind K --question Q --variant a=做法 …");
  if (!/^[\w-]+$/.test(name)) die("name 只用英數、- 和 _（會變成資料夾名）");
  const project = resolve(projectArg), kind = opt("kind", "other"), question = opt("question");
  if (!KINDS.includes(kind)) die(`--kind 要是 ${KINDS.join("／")}`);
  if (!question) die("--question：這個 campaign 要回答什麼（「主角拍的交棒用哪一種？」）");
  const variants = all("variant").map((s) => { const m = /^([a-z0-9]+)=(.+?)(?:@([0-9a-f]{8}))?$/i.exec(s ?? ""); return m ? { key: m[1].toLowerCase(), approach: m[2].trim(), ref: m[3] ?? "" } : die(`--variant「${s}」要寫成 key=做法@參考卡id`); });
  for (const v of variants) {
    if (!v.ref && !rest.includes("--no-refs")) die(`版本 ${v.key} 沒寫它借哪一張參考卡（key=做法@id，refs.mjs cards 列出 id）；真的沒有參考才加 --no-refs`);
    if (v.ref) { const e = findRef(v.ref); if (!e) die(`版本 ${v.key} 的參考 ${v.ref} 不在參考紀錄裡`); v.refTitle = e.title; v.take = Object.values(e.card?.take ?? {}).join("；"); }
  }
  if (variants.length < 2 || variants.length > 4) die("要 2–4 個 --variant（一次比太多看不出差別）");
  if (new Set(variants.map((v) => v.key)).size !== variants.length) die("variant 的 key 重複了");
  const dir = join(project, "campaigns", name); if (existsSync(join(dir, "campaign.json"))) die(`${relative(process.cwd(), dir)} 已經有了`);
  const from = opt("from") ? resolve(opt("from")) : "";
  if (from && !existsSync(join(from, "index.html"))) die(`--from ${from} 沒有 index.html`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "campaign.json"), JSON.stringify({ name, kind, question, from: from ? relative(project, from) : "", created: new Date().toISOString().slice(0, 10), variants, pick: null }, null, 1) + "\n");
  const skip = /(^|\/)(out|renders|review[^/]*|node_modules|campaigns|previews)(\/|$)/;
  for (const { key, approach } of variants) {
    const d = join(project, "tests", `_${name}-${key}`); if (existsSync(d)) die(`${d} 已經存在`);
    if (from) cpSync(from, d, { recursive: true, filter: (s) => !skip.test(relative(from, s)) }); else mkdirSync(d, { recursive: true });
    const v = variants.find((x) => x.key === key);
    writeFileSync(join(d, "NOTES.md"), `# campaign ${name} · ${key}\n\n問題：${question}\n這一版的做法：${approach}\n${v.ref ? `借的參考：${v.refTitle}（${v.ref}）${v.take ? `；借：${v.take}` : ""}。做之前先看 \`refs.mjs cards\` 裡它的影格\n` : ""}\n只改這個做法，其他（時間、字、構圖、素材）和別的版本一樣，比較才有意義。用了哪個登錄庫項目或範例、參數改了什麼，寫在下面。\n`);
  }
  console.log(`campaign ${name}：${variants.length} 個版本\n${variants.map((v) => `  ${v.key}  tests/_${name}-${v.key}  ${v.approach}`).join("\n")}\n下一步：各自做好 → campaign.mjs render ${relative(process.cwd(), dir)}`);
} else if (cmd === "render") {
  const { V, dir } = load(pos[0] ?? die("render <campaignDir>"));
  for (const v of V) {
    if (!existsSync(join(v.dir, "index.html"))) { console.log(`- ${v.key}: 沒有 index.html，跳過`); continue; }
    mkdirSync(dirname(v.clip), { recursive: true });
    const r = spawnSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), "render", v.dir, "--output", v.clip, "--fps", "60", "--quality", "draft"], { stdio: "inherit" });
    if (r.status) { console.log(`✗ ${v.key}: render 失敗`); continue; }
    spawnSync(process.execPath, [join(TOOL, "scripts/review-pack.mjs"), v.dir, v.clip, "--out", v.review, "--force"], { stdio: "inherit" });
    spawnSync(process.execPath, [join(TOOL, "scripts/review-pack.mjs"), "--check", v.review, "--candidate"], { stdio: "inherit" });
    const s = status(v); console.log(`${s.state === "pass" ? "✓" : "✗"} ${v.key}: ${s.why}`);
  }
  console.log(`下一步：campaign.mjs compare ${relative(process.cwd(), dir)}`);
} else if (cmd === "compare") {
  const { C, V, preview } = load(pos[0] ?? die("compare <campaignDir>"));
  const S = V.map((v) => ({ ...v, ...status(v) })), shown = S.filter((v) => existsSync(v.clip) && (rest.includes("--all") || v.state === "pass"));
  if (shown.length < 2) die(`可以比的版本不到 2 個（量測通過的：${S.filter((v) => v.state === "pass").map((v) => v.key).join("、") || "沒有"}）；FAIL 先修，或 --all 連沒過的一起看`);
  mkdirSync(preview, { recursive: true });
  const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find(existsSync);
  const hasText = FONT && execFileSync(FF, ["-hide_banner", "-filters"], { encoding: "utf8" }).includes(" drawtext ");
  const label = (k) => (hasText ? `,drawtext=fontfile=${FONT}:text='${k.toUpperCase()}':x=16:y=12:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8` : "");
  const n = shown.length, [w, h] = n === 3 ? [640, 360] : [960, 540], T = Math.max(...shown.map((v) => duration(v.clip)));
  const pre = shown.map((v, i) => `[${i}:v]fps=60,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration=${T}${label(v.key)},trim=duration=${T}[v${i}]`).join(";");
  const layout = n === 4 ? "0_0|w0_0|0_h0|w0_h0" : shown.map((_, i) => (i ? `${Array.from({ length: i }, (_, j) => `w${j}`).join("+")}_0` : "0_0")).join("|");
  execFileSync(FF, ["-nostdin", "-v", "error", "-y", ...shown.flatMap((v) => ["-i", v.clip]), "-filter_complex", `${pre};${shown.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${layout}[out]`,
    "-map", "[out]", "-an", "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p", join(preview, "compare.mp4")]);
  const strips = shown.flatMap((v) => { const d = duration(v.clip), f = join(preview, `strip-${v.key}.jpg`);
    execFileSync(FF, ["-nostdin", "-v", "error", "-y", "-i", v.clip, "-vf", `fps=8/${d},scale=240:-2,tile=8x1${label(v.key)}`, "-frames:v", "1", f]);
    const rf = v.ref ? cardFrames(v.ref).slice(0, 3) : [], r = join(preview, `ref-${v.key}.jpg`);   // under each variant: the reference it borrows from
    if (rf.length) execFileSync(FF, ["-nostdin", "-v", "error", "-y", ...rf.flatMap((x) => ["-i", x]), "-filter_complex",
      `${rf.map((_, i) => `[${i}:v]scale=240:136:force_original_aspect_ratio=decrease,pad=240:136:(ow-iw)/2:(oh-ih)/2[r${i}]`).join(";")};${rf.map((_, i) => `[r${i}]`).join("")}${rf.length > 1 ? `hstack=inputs=${rf.length},` : ""}pad=1920:136:0:0:color=0x111111${label(`${v.key} ref`)}`, "-frames:v", "1", r]);
    return rf.length ? [f, r] : [f]; });
  execFileSync(FF, ["-nostdin", "-v", "error", "-y", ...strips.flatMap((f) => ["-i", f]), "-filter_complex", `${strips.map((_, i) => `[${i}:v]`).join("")}vstack=inputs=${strips.length}`, join(preview, "compare.jpg")]);
  const where = n === 4 ? ["左上", "右上", "左下", "右下"] : n === 3 ? ["左", "中", "右"] : ["左", "右"];
  writeFileSync(join(preview, "COMPARE.md"), [`# campaign ${C.name}：${C.question}`, "", "候選：只拿來挑，不是草稿。挑定之後的版本要填 MOTION.md 再 --check（video-draft-review）。", "",
    "| 版本 | 位置 | 做法 | 借的參考 | 量測 |", "|---|---|---|---|---|",
    ...S.map((v) => { const i = shown.indexOf(v); return `| ${v.key.toUpperCase()} | ${i >= 0 ? where[i] : "（沒放進比較）"} | ${v.approach} | ${v.ref ? `${v.refTitle}（${v.ref}）${v.take ? `：${v.take}` : ""}` : "—"} | ${v.state === "pass" ? "✓" : "✗"} ${v.why} |`; }), "",
    "- `compare.mp4`：同時播放，同一刻並排", "- `compare.jpg`：每版 8 格，由上到下；每版下面一列是它借的參考（REF）", "- 挑的時候也看它有沒有做到參考的「借什麼」", "",
    `挑好了：\`node <tool>/scripts/campaign.mjs pick ${relative(process.cwd(), resolve(pos[0]))} <版本> --why "好在哪" --quote "原話"\``, ""].join("\n"));
  console.log(`${relative(process.cwd(), preview)}/compare.mp4（${shown.map((v, i) => `${where[i]} ${v.key.toUpperCase()}`).join("、")}）、compare.jpg、COMPARE.md`);
} else if (cmd === "pick") {
  const { C, V, dir } = load(pos[0] ?? die("pick <campaignDir> <key> --why …")), key = (pos[1] ?? die("pick 要給版本的 key")).toLowerCase();
  const won = V.find((v) => v.key === key) ?? die(`沒有版本 ${key}（${V.map((v) => v.key).join("、")}）`), why = opt("why") || die("--why：贏的那一版好在哪");
  if (!existsSync(won.clip)) die(`${key} 還沒 render`);
  const reasons = Object.fromEntries(all("reject").map((s) => { const m = /^([a-z0-9]+)=(.+)$/i.exec(s ?? ""); return m ? [m[1].toLowerCase(), m[2]] : die(`--reject「${s}」要寫成 key=原因`); }));
  const keep = (v, verdict, reason, extra = []) => {
    const r = spawnSync(process.execPath, [join(TOOL, "scripts/exemplar.mjs"), "add", v.clip, "--at", `0-${duration(v.clip).toFixed(3)}`, "--kind", C.kind, "--verdict", verdict, "--why", reason,
      "--tags", `campaign:${C.name},variant:${v.key}`, ...extra], { encoding: "utf8" });
    console.log((r.stdout || r.stderr).trim());
  };
  keep(won, "keep", `${won.approach}：${why}`, [...(opt("quote") ? ["--quote", opt("quote")] : []), ...(opt("code") ? ["--code", opt("code")] : [])]);
  for (const v of V.filter((x) => x !== won && existsSync(x.clip))) keep(v, "reject", `${v.approach}：${reasons[v.key] ?? `沒被選（${C.question} → ${won.approach}）`}`);
  C.pick = { key, why, quote: opt("quote"), at: new Date().toISOString().slice(0, 10) };
  writeFileSync(join(dir, "campaign.json"), JSON.stringify(C, null, 1) + "\n");
  console.log(`campaign ${C.name}：選 ${key.toUpperCase()}（${won.approach}）。把它的做法搬回正片，其他版本留在 tests/ 當紀錄`);
} else die("new | render | compare | pick（見檔頭）");
