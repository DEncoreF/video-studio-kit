#!/usr/bin/env node
// The personal layer: one folder per user, outside the tool, so taste and references survive tool
// updates and can be backed up on their own (it is its own git repo). Paths: scripts/lib/paths.mjs.
//
//   node scripts/profile.mjs                 show where everything resolves to
//   node scripts/profile.mjs init [--name N] [--workspace DIR] [--brand-kits DIR]
//   node scripts/profile.mjs migrate         move references, taste log and inbox files out of the tool's library/
//
// Layout of <profile> (default ~/.video-studio):
//   config.json            name, workspace, brand_kits (all optional)
//   taste.md               what this user likes / rejects / uses by default — video-direction reads it
//   taste-log.jsonl        one line per style pick or rejection
//   references-log.jsonl   every reference, found by Claude or handed in by the user (refs.mjs)
//   inbox/                 files the user drops in for Claude to look at (never committed)
//   assets/                personal asset library (assets.mjs)
//   styles/recipes|examples  personal styles, used before the built-in ones
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as P from "./lib/paths.mjs";

const [cmd = "show", ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
const tilde = (p) => (p.startsWith(homedir() + "/") ? "~" + p.slice(homedir().length) : p);
const lines = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : []);
const today = new Date().toISOString().slice(0, 10);
const write = (f, text) => { if (!existsSync(f)) writeFileSync(f, text); };
const git = (...a) => spawnSync("git", ["-C", P.PROFILE, ...a], { encoding: "utf8" });

const TASTE_TEMPLATE = (name) => `# 品味檔${name ? `（${name}）` : ""}

video-direction 依這份檔排序風格、挑配樂與預設值。Claude 在你選擇、否決或給參考之後會提議更新這份檔，你同意才改。

## 喜歡

## 不要

## 預設

- 旁白：
- 配樂：
- 常用比例與長度：

## 被否決過的做法

## 備註
`;

function show() {
  const rows = [
    ["工具（scripts、內建風格）", P.TOOL],
    ["個人層", P.PROFILE],
    ["工作資料夾（videos/）", P.WORKSPACE],
    ["品牌套件", P.KITS],
    ["暫存（OCR 執行檔）", P.CACHE],
  ];
  for (const [k, v] of rows) console.log(`${k}：${tilde(v)}${existsSync(v) ? "" : "（不存在）"}`);
  if (!existsSync(P.PROFILE)) return console.log("\n個人層還沒建立：node scripts/profile.mjs init");
  const inbox = existsSync(P.INBOX) ? readdirSync(P.INBOX).filter((f) => !f.startsWith(".") && f !== "README.md").length : 0;
  const mine = existsSync(join(P.PROFILE, "styles/recipes")) ? readdirSync(join(P.PROFILE, "styles/recipes")).filter((f) => f.endsWith(".md") && f !== "README.md").length : 0;
  console.log(`\n品味檔 ${existsSync(P.TASTE) ? "有" : "沒有"}・選擇紀錄 ${lines(P.TASTE_LOG).length} 筆・參考 ${lines(P.REFS_LOG).length} 筆・inbox ${inbox} 個檔・個人風格 ${mine} 份`);
}

function init() {
  for (const d of ["inbox", "assets/brand", "assets/products", "assets/claims", "assets/media", "styles/recipes", "styles/examples"]) mkdirSync(join(P.PROFILE, d), { recursive: true });
  const cfg = { ...P.config };
  if (opt("name")) cfg.name = opt("name");
  if (opt("workspace")) cfg.workspace = resolve(opt("workspace"));
  if (opt("brand-kits")) cfg.brand_kits = resolve(opt("brand-kits"));
  writeFileSync(P.CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
  write(P.TASTE, TASTE_TEMPLATE(cfg.name));
  write(P.TASTE_LOG, "");
  write(P.REFS_LOG, "");
  write(join(P.INBOX, "README.md"), "# 參考收件匣\n\n把想給 Claude 參考的截圖、影片、PDF 丟進來，然後在對話說「看 inbox」。這裡的檔案不進 git，也不會放進成片（D7）；紀錄只存路徑與分析。網址直接貼在對話裡即可。\n");
  write(join(P.PERSONAL_ASSETS, "library.json"), JSON.stringify({ name: `${cfg.name ?? "個人"}的素材庫`, brand: "", default_license: "", linked: [], created: today }, null, 2) + "\n");
  write(join(P.PERSONAL_ASSETS, "index.json"), "[]\n");
  write(join(P.PROFILE, "styles/recipes/README.md"), "# 個人風格配方\n\n格式同工具內建的 `styles/recipes/*.md`。同名時個人版優先；要在圖庫顯示，另在 `styles/catalog.json` 加一筆（格式同內建 catalog）。\n");
  write(join(P.PROFILE, ".gitignore"), "inbox/*\n!inbox/README.md\ngallery-selection.json\n.DS_Store\n");
  write(join(P.PROFILE, "README.md"), "# 個人層（marketing-video-studio）\n\n你的品味、參考、收件匣、個人素材與風格。工具更新不會動到這裡。說明見工具的 `scripts/profile.mjs`。\n");
  if (!existsSync(join(P.PROFILE, ".git")) && git("init", "-q").status === 0) { git("add", "-A"); git("commit", "-q", "-m", "Create personal layer"); }
  console.log(`個人層就緒：${tilde(P.PROFILE)}`);
}

// Move the per-user data that used to live in the tool's library/ (dedupe by line).
function migrate() {
  if (!existsSync(P.PROFILE)) init();
  const from = join(P.TOOL, "library");
  let moved = 0;
  for (const [src, dst] of [[join(from, "references-log.jsonl"), P.REFS_LOG], [join(from, "taste-log.jsonl"), P.TASTE_LOG]]) {
    const have = new Set(lines(dst));
    const add = lines(src).filter((l) => !have.has(l));
    if (add.length) appendFileSync(dst, add.join("\n") + "\n");
    moved += add.length;
    if (existsSync(src)) console.log(`${tilde(src)} → ${tilde(dst)}（新增 ${add.length} 筆）`);
  }
  const inbox = join(from, "inbox");
  if (existsSync(inbox)) for (const f of readdirSync(inbox).filter((f) => !f.startsWith(".") && f !== "README.md")) { renameSync(join(inbox, f), join(P.INBOX, f)); moved++; console.log(`inbox/${f} → ${tilde(P.INBOX)}/`); }
  if (existsSync(join(homedir(), ".video-assets", "library.json"))) console.log("! 舊的個人素材庫 ~/.video-assets 仍會被讀取；要搬進個人層請手動移到 assets/");
  if (moved && existsSync(join(P.PROFILE, ".git"))) { git("add", "-A"); git("commit", "-q", "-m", "Import references and taste log from the tool's library/"); }
  console.log(moved ? `完成，共 ${moved} 筆` : "沒有要搬的資料");
}

({ show, init, migrate }[cmd] ?? (() => { console.error("usage: profile.mjs [show|init|migrate]"); process.exit(1); }))();
