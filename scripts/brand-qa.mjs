#!/usr/bin/env node
// Brand QA for one video. Read-only and fail-closed: it never edits the film, its audio or
// its assets; any hard brand rule broken (wherever the text sits — source, narration,
// screenshot, photo, rendered frame) is FAIL, and anything it cannot verify is NEEDS_REVIEW.
//
//   node scripts/brand-qa.mjs <videoDir> [--kit id] [--lib dir] [--at t1,t2|--every 2] [--render file.mp4] [--no-lint] [--no-stills] [--no-ocr]
//
// Writes only: <video>/QA.md, <video>/qa/ (report.json, stills), and — when an approved film
// now fails — approval.json's status ("revoked"). Exit: 0 PASS · 2 NEEDS_REVIEW · 1 FAIL.
// Rules and data shapes: .claude/skills/video-brand-qa/references/checks.md
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { KITS_DIR, allowedKits, forbiddenTerms, kitIds, loadKit, logoRules, otherBrandTerms } from "./lib/brand.mjs";
import { findTerms, ocr } from "./lib/ocr.mjs";

import { TOOL as root, filmId, libraryFor } from "./lib/paths.mjs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && /^--(kit|lib|at|every|render)$/.test(args[i - 1])));
if (!pos[0]) { console.error("usage: node scripts/brand-qa.mjs <videoDir> [--kit id] [--lib dir] [--at t1,t2|--every 2] [--render file.mp4] [--no-lint] [--no-stills] [--no-ocr]"); process.exit(1); }
const video = resolve(pos[0]);
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");
const json = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
const today = new Date().toISOString().slice(0, 10);
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const QA_OWNED = new Set(["qa", "QA.md", "approval.json", "qa-review.json", "qa-waivers.json", "renders", "node_modules", ".DS_Store", "assets-library", "direction"]); // not part of the film itself
const walk = (d, skip = new Set()) => (existsSync(d) ? readdirSync(d) : []).flatMap((n) => {
  const p = join(d, n); if (skip.has(n)) return [];
  return statSync(p).isDirectory() ? walk(p, skip) : [p];
});

// ---------- read-only guard: fingerprint the film before, verify after
const filmFiles = () => walk(video, QA_OWNED).filter((f) => !f.includes("/.hyperframes/"));
const fingerprint = () => Object.fromEntries(filmFiles().map((f) => [relative(video, f), sha(readFileSync(f))]));
const before = fingerprint();
const hfDir = join(video, ".hyperframes"), hfExisted = existsSync(hfDir);
const hfState = walk(hfDir).map((f) => [f, readFileSync(f)]); // CLI bookkeeping: restored (or removed if new) after
const run = (...a) => { const r = spawnSync(process.execPath, [join(root, "scripts/hf.mjs"), ...a], { encoding: "utf8" }); return { code: r.status, out: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "") }; };

// ---------- context
const brief = read(join(video, "BRIEF.md"));
const fm = (k) => brief.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
const libDir = opt("lib", libraryFor(video));
const libMeta = json(join(libDir, "library.json"), {});
const kitId = opt("kit") ?? fm("brand") ?? json(join(video, "direction/content.json"), {}).brand ?? libMeta.brand;
if (!kitId || !kitIds().includes(kitId)) { console.error(`brand kit not found (${kitId ?? "none"}); pass --kit <id>`); process.exit(1); }
const kit = loadKit(kitId);
const allowTerms = (fm("allow_terms") ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean); // per-video exception the user approved in BRIEF.md
const waivers = json(join(video, "qa-waivers.json"), []).filter((w) => w.approved_by && w.check === "lint"); // only technical checks can be waived
const contentDigest = sha(JSON.stringify(Object.entries(before).filter(([f]) => !/^(QA\.md|qa\/)/.test(f)).sort()) + read(join(KITS_DIR, kit.id, "brand.json")));
const approval = json(join(video, "approval.json"));

const findings = []; // { check, severity, status, issue, where, basis, fix }
const checks = {};   // check -> status
const SEV = { hard: "硬性", major: "重大", minor: "一般" };
const worst = (a, b) => (["FAIL", "NEEDS_REVIEW", "PASS"].find((s) => s === a || s === b));
function add(check, status, f = null) {
  checks[check] = worst(checks[check] ?? "PASS", status);
  if (f) findings.push({ check, status, ...f });
}
const pass = (check) => add(check, "PASS");

// ---------- sources
const SRC_EXT = /\.(html|css|js|jsx|ts|tsx|json)$/;
const sources = filmFiles().filter((f) => SRC_EXT.test(f) && statSync(f).size < 400_000 && !f.includes("/assets/") && !f.includes("/vendor/") && !/(^|\/)app\.js$/.test(f) && !/package(-lock)?\.json$|hyperframes\.json|meta\.json$/.test(f));
const text = Object.fromEntries(sources.map((f) => [relative(video, f), read(f)]));
const refText = filmFiles().filter((f) => /\.(html|js|jsx|ts|tsx)$/.test(f)).map(read).join("\n"); // includes bundles: for "is this asset used?"

// 1. lint
if (!has("no-lint")) {
  const { out } = process.env.VSO_LINT_FIXTURE ? { out: read(process.env.VSO_LINT_FIXTURE) } : run("lint", video); // fixture: tests
  const lines = out.split("\n").map((l) => l.trim());
  const errors = lines.filter((l) => l.startsWith("✗")), warns = lines.filter((l) => l.startsWith("⚠"));
  for (const e of errors) {
    const w = waivers.find((x) => x.match && e.includes(x.match)); // a waiver names the rule it covers; an empty match waives nothing
    add("lint", w ? "PASS" : "FAIL", { severity: "major", issue: e.replace(/^✗\s*/, ""), where: "index.html", basis: w ? `已豁免：${w.reason}（${w.approved_by}）` : "hyperframes lint 錯誤", fix: "照 lint 的 Fix 修；確定是誤報時由使用者在 qa-waivers.json 簽核豁免" });
  }
  for (const e of warns) {
    const w = waivers.find((x) => x.match && e.includes(x.match));
    add("lint", w ? "PASS" : "NEEDS_REVIEW", { severity: "minor", issue: e.replace(/^⚠\s*/, ""), where: "index.html", basis: w ? `已豁免：${w.reason}（${w.approved_by}）` : "hyperframes lint 警告", fix: "確認是否影響畫面；確定是誤報時由使用者在 qa-waivers.json 簽核豁免" });
  }
  if (!errors.length && !warns.length) pass("lint");
}

// 2. design spec and colours
const spec = ["frame.md", "design.md"].find((f) => existsSync(join(video, f)));
const reviewEarly = json(join(video, "qa-review.json"));
const visuallyOk = (check) => reviewEarly?.digest === contentDigest && (reviewEarly.items ?? []).some((it) => it.check === check && it.pass === true);
if (!existsSync(join(video, "frame.md")) && visuallyOk("色彩")) {
  add("色彩", "PASS", { severity: "minor", issue: "沒有 frame.md；已用影格目視確認品牌主色", where: "qa-review.json", basis: "目視檢查", fix: "之後補 frame.md" });
} else if (!existsSync(join(video, "frame.md"))) {
  add("色彩", "NEEDS_REVIEW", { severity: "minor", issue: "沒有 frame.md，無法比對風格色票", where: "frame.md", basis: "色彩規格缺失；不自行推測", fix: "已有成片：以影格目視檢查品牌主色未被替換；之後補 frame.md" });
} else {
  const norm = (h) => { h = h.toLowerCase().slice(1); if (h.length <= 4) h = [...h.slice(0, 3)].map((c) => c + c).join(""); return "#" + h.slice(0, 6); };
  const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
  const allowed = new Set(["#ffffff", "#000000", ...Object.values(kit.colors ?? {}).map((c) => norm(c.hex))]);
  for (const f of [spec, "brand/theme.css"]) for (const m of read(join(video, f)).match(HEX) ?? []) allowed.add(norm(m));
  const stray = {};
  for (const [f, t] of Object.entries(text)) for (const m of t.match(HEX) ?? []) if (!allowed.has(norm(m))) (stray[norm(m)] ??= new Set()).add(f);
  for (const [c, fs] of Object.entries(stray)) add("色彩", "NEEDS_REVIEW", { severity: "minor", issue: `${c} 不在品牌套件或 frame.md`, where: [...fs].slice(0, 3).join("、"), basis: "frame.md colors", fix: "是風格用色就寫進 frame.md；是近似色就改用權杖" });
  if (!Object.keys(stray).length) pass("色彩");
}

// 3. fonts
{
  const GENERIC = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-monospace", "ui-sans-serif", "ui-serif", "cursive", "fantasy", "inherit", "initial", "unset", "emoji"]);
  const SYSTEM_CJK = /pingfang|hiragino|heiti|jhenghei|microsoft yahei|yu gothic|meiryo|noto sans cjk|noto serif cjk|source han|songti|kaiti|apple ligothic/i;
  const declared = new Set(Object.values(kit.fonts ?? {}).filter((f) => existsSync(join(video, "fonts", f.file))).map((f) => f.family.toLowerCase())), used = new Map();
  for (const [f, t] of Object.entries(text)) {
    for (const m of t.matchAll(/@font-face\s*{[^}]*font-family:\s*['"]?([^'";]+)/g)) declared.add(m[1].trim().toLowerCase());
    const lists = /\.(html|css)$/.test(f) ? [...t.matchAll(/font-family:\s*([^;}{\n]+)/g)].map((m) => m[1]) : [...t.matchAll(/(?:fontFamily|font-family)["']?\s*[:=]\s*(["'`])([^"'`]+)\1/g)].map((m) => m[2]);
    for (const list of lists) for (const fam of list.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean))
      if (!fam.startsWith("var(") && !GENERIC.has(fam.toLowerCase())) used.set(fam, (used.get(fam) ?? new Set()).add(f));
  }
  for (const [fam, fs] of used) {
    if (SYSTEM_CJK.test(fam)) add("字型", "FAIL", { severity: "major", issue: `用了算圖機沒有的系統中文字型 ${fam}`, where: [...fs].join("、"), basis: "算圖環境只有隨片字型", fix: "換成 brand-kits/_fonts 的字型並加 @font-face" });
    else if (!declared.has(fam.toLowerCase())) add("字型", "NEEDS_REVIEW", { severity: "minor", issue: `${fam} 沒有 @font-face 或字型檔`, where: [...fs].slice(0, 3).join("、"), basis: "font-family 與 @font-face 比對", fix: "加入字型檔或改用品牌字型" });
  }
  if (!checks["字型"]) pass("字型");
}

// 4. narration ↔ voice-over, pronunciation
const narration = json(join(video, "narration.json"));
if (narration) {
  const manifest = json(join(video, "assets/vo/manifest.json"), []);
  const byKey = Object.fromEntries(manifest.map((m) => [m.key, m]));
  for (const l of narration.lines) if (!byKey[l.key] || byKey[l.key].text !== l.text)
    add("旁白與發音", "FAIL", { severity: "major", issue: `${l.key}：${byKey[l.key] ? "文字已改，旁白檔是舊的" : "沒有旁白檔"}`, where: `${l.start ?? "?"}s`, basis: "narration.json 與 assets/vo/manifest.json 比對", fix: "重跑 pipelines/tts（已核可的片子先問使用者）" });
  for (const m of manifest) if (m.slot && m.spoken + (m.offset ?? 0) > m.slot)
    add("旁白與發音", "NEEDS_REVIEW", { severity: "minor", issue: `${m.key} 唸 ${m.spoken}s，時段只有 ${m.slot}s`, where: `${m.start}s`, basis: "manifest 時長", fix: "調語速或加長時段" });
  const table = json(join(video, "brand/pronunciation.json"), null);
  for (const p of (kit.pronunciation ?? []).filter((p) => narration.lines.some((l) => l.text.includes(p.text))))
    if (!(table ?? []).some((q) => q.text === p.text && q.say === p.say))
      add("旁白與發音", "FAIL", { severity: "major", issue: `${p.text} 應唸「${p.say}」，影片的 brand/pronunciation.json 沒有對應紀錄`, where: "brand/pronunciation.json", basis: "brand.json pronunciation", fix: "從品牌套件補發音紀錄；若旁白不是照這張表合成的，要重合成" });
  if (!checks["旁白與發音"]) pass("旁白與發音");
} else pass("旁白與發音");

// 5. assets: used-or-not, licence, freshness, logo identity
const assetsDir = join(video, "assets");
const lib = json(join(libDir, "index.json"), []);
const libBySha = Object.fromEntries(lib.filter((e) => e.sha).map((e) => [e.sha, e]));
const logoShas = new Set([kit, ...allowedKits(kit)].flatMap((k) => readdirSync(join(KITS_DIR, k.id, "logos")).map((f) => sha(readFileSync(join(KITS_DIR, k.id, "logos", f))))));
const GENERATED = [/^vo\//, /^music\//, /^sfx\//]; // our own TTS and procedural music
const MEDIA = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|wav|mp3|m4a)$/i;
const isUsed = (rel) => {
  if (refText.includes(rel)) return true;
  const dir = dirname(rel), stem = basename(rel, extname(rel));
  return dir !== "." && refText.includes(`${dir}/`) && refText.includes(stem);
};
const assets = walk(assetsDir).filter((f) => MEDIA.test(f)).map((f) => relative(assetsDir, f));
const used = assets.filter(isUsed), unused = assets.filter((a) => !isUsed(a));
for (const rel of used) {
  const h = sha(readFileSync(join(assetsDir, rel))), e = libBySha[h];
  if (GENERATED.some((r) => r.test(rel))) continue;
  if (e?.license === "reference-only") add("素材授權", "FAIL", { severity: "hard", issue: `${rel} 標為 reference-only，不能進成片`, where: rel, basis: "D7：外部參考不進成片", fix: "換成有授權的素材" });
  else if (e?.expires && e.expires < today) add("素材授權", "FAIL", { severity: "hard", issue: `${rel} 授權已過期（${e.expires}）`, where: rel, basis: "素材庫 expires", fix: "重新取得授權或換素材" });
  else if (!e && !logoShas.has(h)) add("素材授權", "FAIL", { severity: "hard", issue: `${rel} 在素材庫沒有來源與授權紀錄`, where: rel, basis: "D7：進成片的素材一律記錄授權", fix: "照 video-direction 的 references/assets.md 補登來源與授權（只補紀錄，不改檔）" });
  if ((e?.brand_marks ?? []).length && !e.marks_review) add("第三方品牌", "NEEDS_REVIEW", { severity: "major", issue: `${rel} 含 ${e.brand_marks.join("、")}，尚未人工審核`, where: rel, basis: "素材庫 brand_marks（匯入時依可見內容判定）", fix: "由使用者審核：assets.mjs review <庫> <檔> --approved-by <人>" });
  if (e?.type === "screenshot" && !e.captured) add("素材授權", "NEEDS_REVIEW", { severity: "minor", issue: `${rel} 截圖日期不明`, where: rel, basis: "素材庫 captured", fix: "補上截圖日期或重新截圖" });
  if (e?.valid_until && e.valid_until < today) add("素材授權", "NEEDS_REVIEW", { severity: "minor", issue: `${rel} 截圖有效期已過（${e.valid_until}），需重新確認畫面仍正確`, where: rel, basis: "素材庫 valid_until", fix: "重新截圖或確認後延長 valid_until（不要刪除）" });
}
if (!checks["素材授權"]) pass("素材授權");

// 5b. code licences — Remotion needs a paid licence for companies of 3+ (D1). React scenes may import "remotion" only
// when the build aliases it to a local shim; the real packages must never be installed or bundled.
{
  const REM = /^(remotion|@remotion\/.+)$/;
  const pkgs = filmFiles().filter((f) => basename(f) === "package.json");
  for (const f of pkgs) {
    const pj = json(f, {});
    const deps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => Object.keys(pj[k] ?? {})).filter((d) => REM.test(d));
    if (deps.length) add("Remotion 授權", "FAIL", { severity: "hard", issue: `${relative(video, f)} 依賴 ${deps.join("、")}`, where: relative(video, f), basis: "D1：Remotion 要求 3 人以上公司購買授權，不採用", fix: "拿掉依賴，改用本機 shim（build 的 alias）或移植成 HyperFrames（remotion-to-hyperframes）" });
  }
  for (const d of ["node_modules/remotion", "node_modules/@remotion"]) if (existsSync(join(video, d))) add("Remotion 授權", "FAIL", { severity: "hard", issue: `安裝了 ${d}`, where: d, basis: "D1：Remotion 要求 3 人以上公司購買授權，不採用", fix: "移除套件，改用本機 shim 或移植成 HyperFrames" });
  const bundles = filmFiles().filter((f) => /\.(js|mjs)$/.test(f) && !f.includes("/vendor/") && statSync(f).size < 20_000_000).filter((f) => /remotion_(?:renderReady|isPlayer|staticBase|envVariables|inputProps)/.test(read(f)));
  for (const f of bundles) add("Remotion 授權", "FAIL", { severity: "hard", issue: `${relative(video, f)} 打包進了 Remotion 的執行環境`, where: relative(video, f), basis: "D1：Remotion 要求 3 人以上公司購買授權，不採用", fix: "build 的 alias 把 remotion 指到本機 shim 後重新打包" });
  const code = filmFiles().filter((f) => /\.(jsx?|tsx?|mjs)$/.test(f) && !f.includes("/vendor/") && statSync(f).size < 400_000);
  const imported = new Set(code.flatMap((f) => [...read(f).matchAll(/(?:from|import|require\()\s*["']((?:remotion|@remotion\/[^"'/]+)[^"']*)["']/g)].map((m) => m[1].split("/").slice(0, m[1].startsWith("@") ? 2 : 1).join("/"))));
  const builds = code.map(read).join("\n");
  for (const spec of imported) {
    const aliased = new RegExp(`["']?${spec.replace(/[/@]/g, "\\$&")}["']?\\s*:\\s*[^,}\\n]*(shim|\\.\\/|here\\()`).test(builds);
    if (!aliased) add("Remotion 授權", "NEEDS_REVIEW", { severity: "major", issue: `程式 import "${spec}"，但找不到把它指到本機 shim 的 build alias`, where: "原始碼", basis: "D1；只允許 alias 到自家 shim", fix: "在 build 設 alias 指到本機 shim，或移植成 HyperFrames" });
  }
  if (!checks["Remotion 授權"]) pass("Remotion 授權");
}

// 6. forbidden terms, prices, other brands — in text, narration, images and frames
const forbidden = forbiddenTerms(kit).filter((t) => !allowTerms.includes(t));
const others = otherBrandTerms(kit);
const PRICE = /NT\$\s?\d|US\$\s?\d|\$\s?\d[\d,]*|\d[\d,]*\s?(元|萬元)|限時|優惠價|特價|折扣/;
// Source text that can reach the screen: drop scripts/styles and every kind of comment (HTML, JS, CSS).
const strip = (t) => t.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
const textHits = (where, t, at) => {
  for (const term of forbidden) { const i = t.indexOf(term); if (i >= 0) add("禁用內容", "FAIL", { severity: "hard", issue: `出現禁用詞「${term}」：…${t.slice(Math.max(0, i - 10), i + term.length + 10).replace(/\s+/g, " ")}…`, where: at ?? where, basis: `brand.json forbidden`, fix: "刪除或改寫；若本片主題就是它，需使用者在 BRIEF.md 的 allow_terms 核可" }); }
  const m = t.match(PRICE);
  if (m) add("禁用內容", kit.forbid_prices ? "FAIL" : "NEEDS_REVIEW", { severity: kit.forbid_prices ? "hard" : "minor", issue: `疑似價格「${m[0]}」`, where: at ?? where, basis: kit.forbid_prices ? "brand.json forbid_prices" : "價格樣式", fix: "刪除價格資訊" });
  for (const o of others) if (t.includes(o)) add("第三方品牌", "NEEDS_REVIEW", { severity: "major", issue: `出現其他品牌「${o}」`, where: at ?? where, basis: "brand.json allowed_brands 未列", fix: "人工審核；可用就把它加進 allowed_brands，否則移除" });
};
for (const [f, t] of Object.entries(text)) textHits(f, strip(t));
if (narration) for (const l of narration.lines) textHits("narration.json", l.text, `${l.start ?? "?"}s 旁白`);

// stills for OCR and the visual pass
let stills = [], sheets = [];
const dur = +(read(join(video, "index.html")).match(/data-composition-id="[^"]+"[^>]*data-duration="([\d.]+)"/)?.[1] ?? 0);
const END_AT = dur ? [2.5, 1.5, 0.6].map((x) => Math.max(0, dur - x).toFixed(1)) : []; // the end card: the last 3 s
if (!has("no-stills")) {
  const every = +opt("every", 2);
  const base = opt("at") ?? (dur ? Array.from({ length: Math.min(40, Math.ceil(dur / every)) }, (_, i) => Math.min(dur - 0.1, (i + 0.5) * Math.max(every, dur / 40)).toFixed(1)).join(",") : "");
  const at = [...new Set([...base.split(",").filter(Boolean), ...END_AT])].join(",");
  if (at) {
    rmSync(join(video, "qa/stills"), { recursive: true, force: true });
    mkdirSync(join(video, "qa"), { recursive: true });
    const r = run("snapshot", video, "--at", at, "--no-end", "--describe", "false", "-o", join(video, "qa/stills"));
    if (r.code) add("目視檢查", "NEEDS_REVIEW", { severity: "major", issue: "截圖失敗，無法做影格檢查", where: "qa/stills", basis: r.out.slice(-200), fix: "修正後重跑" });
    stills = walk(join(video, "qa/stills")).filter((f) => /frame-.*\.png$/.test(f)).sort();
    sheets = walk(join(video, "qa/stills")).filter((f) => /contact-sheet.*\.jpg$/.test(f)).sort().map((f) => relative(video, f));
  }
}
const timeOf = (f) => f.match(/at-([\d.]+)s/)?.[1];
const images = used.filter((a) => /\.(png|jpe?g|webp|gif)$/i.test(a)).map((a) => join(assetsDir, a));
let ocrAvailable = false, ocrResults = {};
if (!has("no-ocr")) {
  const { available, results } = ocr([...images, ...stills]); ocrAvailable = available; ocrResults = results;
  if (!available) add("圖片文字", "NEEDS_REVIEW", { severity: "major", issue: "OCR 無法執行，截圖與影格中的文字未自動檢查", where: "—", basis: "macOS Vision 不可用", fix: "逐張目視檢查禁用詞與其他品牌" });
  for (const [file, o] of Object.entries(results)) {
    const where = file.startsWith(assetsDir) ? `素材 ${relative(assetsDir, file)}` : `${timeOf(file)}s 影格`;
    if (o.error) { add("圖片文字", "NEEDS_REVIEW", { severity: "major", issue: `無法辨識：${o.error}`, where, basis: "OCR 錯誤", fix: "目視檢查" }); continue; }
    for (const h of findTerms(o.lines, forbidden)) add("禁用內容", h.sure ? "FAIL" : "NEEDS_REVIEW", { severity: "hard", issue: `圖片中出現禁用詞「${h.term}」（「${h.text}」）`, where, basis: `OCR 信心 ${h.conf.toFixed(2)}；brand.json forbidden`, fix: "重新截圖、裁切或局部遮蓋；不得已才模糊" });
    for (const h of findTerms(o.lines, others)) add("第三方品牌", "NEEDS_REVIEW", { severity: "major", issue: `圖片中出現其他品牌「${h.term}」（「${h.text}」）`, where, basis: `OCR 信心 ${h.conf.toFixed(2)}；allowed_brands 未列`, fix: "人工審核；可用就加進 allowed_brands，否則換素材" });
    if (kit.forbid_prices) for (const l of o.lines) if (PRICE.test(l.text)) add("禁用內容", l.conf >= 0.5 ? "FAIL" : "NEEDS_REVIEW", { severity: "hard", issue: `圖片中疑似價格「${l.text}」`, where, basis: `OCR 信心 ${l.conf.toFixed(2)}；brand.json forbid_prices`, fix: "遮蓋或換圖" });
  }
}
if (!checks["禁用內容"]) pass("禁用內容");
if (!checks["第三方品牌"]) pass("第三方品牌");
if (!checks["圖片文字"]) pass("圖片文字");

// 6b. the end card: the brand kit's required logos in the last 3 s (brand.json rules.end_card; user:「片尾要記得幫我補Acme 集團的logo」)
const squash = (x) => String(x).replace(/\s+/g, "").toLowerCase();
const frameLines = (f) => ocrResults[f]?.lines ?? [];
const endStills = stills.filter((f) => dur && +timeOf(f) >= dur - 3 - 0.05);
const endCard = kit.rules?.end_card;
if (!endCard?.logos?.length) add("結尾卡", "NEEDS_REVIEW", { severity: "major", issue: "品牌套件沒寫結尾卡必有的 Logo（brand.json rules.end_card），無法自動確認", where: `brand-kits/${kit.id}/brand.json`, basis: "結尾卡規則缺失；不自行推測", fix: "在 brand.json 的 rules 加 end_card（見 references/checks.md），或目視確認最後 3 秒的 Logo" });
else for (const lg of endCard.logos) {
  const name = lg.name ?? lg.id, terms = lg.ocr ?? [], files = lg.files ?? [];
  const inSource = files.some((f) => refText.includes(basename(f)));
  const seen = endStills.flatMap((f) => frameLines(f).filter((l) => l.conf >= 0.5 && terms.some((t) => squash(l.text).includes(squash(t)))).map((l) => `${timeOf(f)}s「${l.text}」`));
  if (seen.length) { add("結尾卡", "PASS"); continue; }
  const why = !dur ? "量不到片長" : has("no-stills") || !endStills.length ? "沒有最後 3 秒的影格" : !terms.length ? "這個 Logo 沒有可辨識的字（rules.end_card 的 ocr）" : !ocrAvailable ? "OCR 不能跑" : null;
  if (why) add("結尾卡", "NEEDS_REVIEW", { severity: "major", issue: `結尾卡的「${name}」無法自動確認（${why}）${inSource ? "；原始碼有引用 Logo 檔" : ""}`, where: `${dur ? (dur - 3).toFixed(1) : "?"}s–結尾`, basis: "brand.json rules.end_card", fix: "目視確認最後 3 秒有這個 Logo，記進 qa-review.json" });
  else add("結尾卡", inSource ? "NEEDS_REVIEW" : "FAIL", { severity: inSource ? "major" : "hard", issue: `最後 3 秒的影格找不到「${name}」${inSource ? "（原始碼有引用 Logo 檔，但影格裡讀不到它的字：可能太小、被蓋住或太早消失）" : ""}`, where: `${(dur - 3).toFixed(1)}s–${dur}s 影格`, basis: `brand.json rules.end_card；OCR 找「${terms.join("／")}」`, fix: `結尾卡補上「${name}」的 Logo${endCard.layout ? `（${endCard.layout}）` : ""}` });
}
if (!checks["結尾卡"]) pass("結尾卡");

// 6c. rebuilt or illustrative interface: the film must say so (taste.md: 不是真實介面就改做「情境示意」並蓋章)
{
  const script = json(join(video, "direction/script.json"), null) ?? {};
  const ILLU = /情境示意|示意|illustrative|rebuilt|重建/i;
  const uses = /^(true|yes|是)$/i.test(fm("illustrative") ?? "") || (script.beats ?? []).some((b) => ILLU.test(String(b.proof ?? "")));
  if (uses) {
    const STAMP = ["情境示意", "illustrative"];
    const hit = stills.flatMap((f) => frameLines(f).filter((l) => STAMP.some((t) => squash(l.text).includes(squash(t)))).map((l) => `${timeOf(f)}s`));
    if (hit.length) pass("情境示意");
    else add("情境示意", "NEEDS_REVIEW", { severity: "major", issue: `片子用了重建或示意的介面，影格與結尾卡${!stills.length ? "沒有截圖可查" : !ocrAvailable ? "無法 OCR" : "都沒有讀到「情境示意」或「Illustrative」"}`, where: "影格、結尾卡", basis: "direction/script.json 的 proof 或 BRIEF.md illustrative: true", fix: "在介面畫面角落或結尾卡加「情境示意／Illustrative」字樣；字太小 OCR 讀不到時目視確認並記進 qa-review.json" });
  } else pass("情境示意");
}

// 6d. delivery spec: the delivered file's frame rate equals BRIEF.md's fps (default 60; morph fluency needs 60)
let deliveryNote = "";
{
  const want = +(fm("fps") ?? 60), cands = [opt("render"), approval?.render].filter(Boolean).map((f) => resolve(video, f));
  if (!cands.length && existsSync(join(video, "renders"))) cands.push(...readdirSync(join(video, "renders")).filter((f) => /\.(mp4|mov|webm)$/i.test(f) && !/^draft|small/i.test(f)).map((f) => join(video, "renders", f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 1));
  const file = cands.find(existsSync);
  if (!file) { deliveryNote = `交件規格：還沒有正式檔（不是 draft 的 renders/*.mp4、approval.json 的 render 或 --render），出片後再驗幀率（要 ${want} fps）`; if (opt("render")) add("交件規格", "NEEDS_REVIEW", { severity: "major", issue: `找不到 --render 指定的檔：${opt("render")}`, where: opt("render"), basis: "ffprobe", fix: "確認路徑" }); }
  else {
    const FP = createRequire(join(root, "package.json"))("@ffprobe-installer/ffprobe").path;
    const r = spawnSync(FP, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
    const st = r.status === 0 ? JSON.parse(r.stdout).streams?.[0] : null, rate = (x) => { const [a, b] = String(x ?? "0/1").split("/").map(Number); return b ? a / b : a; };
    const fps = st ? rate(st.avg_frame_rate) || rate(st.r_frame_rate) : NaN, rel = relative(video, file);
    if (!Number.isFinite(fps) || !fps) add("交件規格", "NEEDS_REVIEW", { severity: "major", issue: `讀不到 ${rel} 的幀率`, where: rel, basis: "ffprobe", fix: "確認檔案完整" });
    else if (Math.abs(fps - want) > 0.05) add("交件規格", "FAIL", { severity: "major", issue: `${rel} 是 ${+fps.toFixed(2)} fps，BRIEF 要 ${want} fps${fm("fps") ? "" : "（沒寫就是 60）"}`, where: rel, basis: "ffprobe；BRIEF.md fps（預設 60：變形與轉場在 30 fps 會一格一格跳）", fix: `用 --fps ${want} 重新 render` });
    else { pass("交件規格"); deliveryNote = `交件規格：${rel} ${+fps.toFixed(2)} fps（BRIEF ${want}）`; }
  }
}

// 7. visual review (done by a person or Claude, recorded in qa-review.json for this exact content)
const review = json(join(video, "qa-review.json"));
const VISUAL = [
  "中文易讀：1080p 內文約 32px 以上、標題 64px 以上；字幕每秒約 5 字以內（英文單字算 1 字）",
  "對比：文字與底色清楚，壓在影像上的文字有底板或陰影",
  "斷行：不在詞中間斷、不留孤字；中英之間有半形空白",
  `Logo：${logoRules(kit).motion === "static" ? "進場後不抖動、不變形、不換色" : "依品牌 logo 規則"}${logoRules(kit).clear_space ? `；四周留白至少 Logo 高度 ${logoRules(kit).clear_space} 倍` : ""}`,
  ...(kit.rules?.do ?? []).map((r) => `品牌規則：${r}`),
  ...(kit.rules?.dont ?? []).map((r) => `品牌禁止：${r}`),
  "圖片與畫面中沒有禁用詞、價格或未允許的其他品牌（OCR 可能漏抓）",
  "風格：仍符合定版配方的方向與禁用清單",
  `結尾卡：最後 3 秒有${kit.rules?.end_card?.logos?.length ? `「${kit.rules.end_card.logos.map((l) => l.name ?? l.id).join("」「")}」${kit.rules.end_card.layout ? `，${kit.rules.end_card.layout}` : ""}` : "品牌要求的 Logo（brand.json 還沒寫 rules.end_card）"}`,
  "重建或示意的介面有「情境示意／Illustrative」字樣",
];
if (!review || review.digest !== contentDigest) {
  add("目視檢查", "NEEDS_REVIEW", { severity: "major", issue: review ? "目視檢查紀錄是舊內容的，需重看" : "尚未做目視檢查", where: sheets.join("、") || "qa/stills", basis: "qa-review.json digest", fix: `看完總覽圖後寫 qa-review.json（digest: ${contentDigest}）` });
} else for (const it of review.items ?? []) {
  if (it.pass === false) add("目視檢查", it.severity === "minor" ? "NEEDS_REVIEW" : "FAIL", { severity: it.severity ?? "major", issue: it.item + (it.note ? `：${it.note}` : ""), where: it.time ? `${it.time}s` : it.where ?? "—", basis: `目視（${review.by ?? "?"}）`, fix: it.fix ?? "—" });
}
if (!checks["目視檢查"]) pass("目視檢查");

// ---------- read-only guard
for (const [f, buf] of hfState) writeFileSync(f, buf);
if (!hfExisted) rmSync(hfDir, { recursive: true, force: true });
else for (const f of walk(hfDir)) if (!hfState.some(([g]) => g === f)) rmSync(f);
const after = fingerprint();
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f]);
if (changed.length) add("唯讀", "FAIL", { severity: "major", issue: `QA 執行中有影片檔案被改動：${changed.slice(0, 5).join("、")}`, where: "—", basis: "執行前後雜湊比對", fix: "回報這個 bug；用 git 還原" });

// ---------- verdict, approval, report
const verdict = Object.values(checks).reduce(worst, "PASS");
let approvalNote = "沒有核可紀錄";
if (approval?.status === "approved") {
  approvalNote = approval.digest === contentDigest ? `已核可（${approval.approved_by}，${approval.date}），內容與規則未變更` : `已核可（${approval.approved_by}，${approval.date}），但內容或品牌規則已變更`;
  if (verdict === "FAIL") {
    writeFileSync(join(video, "approval.json"), JSON.stringify({ ...approval, status: "revoked", revoked: today, revoked_reason: findings.filter((f) => f.status === "FAIL").map((f) => f.issue).slice(0, 5) }, null, 2) + "\n");
    approvalNote += " → 這次檢查不通過，核可已撤回";
  }
} else if (approval?.status === "revoked") approvalNote = `核可已於 ${approval.revoked} 撤回`;

const LABEL = { PASS: "✅ 通過", NEEDS_REVIEW: "⚠️ 待確認", FAIL: "❌ 不通過" };
const order = { FAIL: 0, NEEDS_REVIEW: 1, PASS: 2 }, sevOrder = { hard: 0, major: 1, minor: 2 };
const rows = findings.filter((f) => f.status !== "PASS").sort((a, b) => order[a.status] - order[b.status] || sevOrder[a.severity] - sevOrder[b.severity]);
const cell = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\n/g, " ");
const md = [
  `# 品牌檢查：${filmId(video)}`, "",
  `**結果：${LABEL[verdict]}**　${today}・品牌套件 ${kit.name}・內容指紋 \`${contentDigest}\``, "",
  `核可狀態：${approvalNote}`, "",
  sheets.length ? `總覽圖：${sheets.map((s) => `\`${s}\``).join("、")}` : "（沒有截圖）", "",
  ...(deliveryNote ? [deliveryNote, ""] : []),
  "| 檢查 | 結果 |", "| --- | --- |", ...Object.entries(checks).map(([k, v]) => `| ${k} | ${LABEL[v]} |`), "",
  ...(rows.length ? ["## 問題", "", "| 嚴重度 | 判定 | 檢查 | 問題 | 時間點／位置 | 判定依據 | 修正建議 |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.slice(0, 120).map((f) => `| ${SEV[f.severity]} | ${LABEL[f.status]} | ${f.check} | ${cell(f.issue)} | ${cell(f.where)} | ${cell(f.basis)} | ${cell(f.fix)} |`), ""] : []),
  ...(unused.length ? ["## 未使用的素材（不檢查）", "", ...unused.map((u) => `- assets/${u}`), ""] : []),
  "## 目視檢查清單", "", ...VISUAL.map((v) => `- ${v}`), "",
];
mkdirSync(join(video, "qa"), { recursive: true });
writeFileSync(join(video, "QA.md"), md.join("\n"));
writeFileSync(join(video, "qa/report.json"), JSON.stringify({ video: filmId(video), date: today, kit: kit.id, verdict, digest: contentDigest, checks, findings: rows, sheets, unused, visual: VISUAL }, null, 2) + "\n");
console.log(md.join("\n"));
process.exit(verdict === "PASS" ? 0 : verdict === "FAIL" ? 1 : 2);
