#!/usr/bin/env node
// Self-built asset libraries, one per project (D6). A library is a folder anyone can create
// in their own project; the video workflow searches: this project's library → your personal
// library (<profile>/assets, see lib/paths.mjs) → libraries you linked. Brand assets only ever come from the
// project's own library, so one client's logo never lands in another client's film.
//
//   node scripts/assets.mjs init <dir> --brand kestrel [--name 名稱] [--license 預設授權]
//   node scripts/assets.mjs add <lib> <file|folder> --type logo|screenshot|photo|video|audio|copy|other
//        [--product P] [--tags a,b] [--license L] [--source S] [--approved-by X] [--expires YYYY-MM-DD] [--note N]
//        [--captured YYYY-MM-DD] [--valid-days 30]          (screenshots: when it was taken, how long it stays true)
//   node scripts/assets.mjs add-plan <lib> <plan.json>     (the draft table the user confirmed: one entry per file)
//   node scripts/assets.mjs review <lib> <path|id> --approved-by X [--note N]   (clear an other-brand-mark warning)
//   node scripts/assets.mjs capture <lib> <url> [--name N] [--product P] [--valid-days 30] [--hide "selector,…"]
//   node scripts/assets.mjs claim <lib> --text "…" --source S [--approved-by X] [--expires YYYY-MM-DD] [--product P]
//   node scripts/assets.mjs link <lib> <otherLibDir>
//   node scripts/assets.mjs check <lib> <needs.json> [--out ASSETS.md]
//   node scripts/assets.mjs promote <lib> <videoDir>     (list files a finished video made that the library lacks)
//   node scripts/assets.mjs tidy <lib>
//   node scripts/assets.mjs search <lib> <words…>
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { KITS_DIR, allowedKits, canonicalProduct, kitIds, loadKit, otherBrandTerms, products } from "./lib/brand.mjs";
import { findTerms, ocr } from "./lib/ocr.mjs";
import { PERSONAL_ASSETS } from "./lib/paths.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const pos = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
const opt = (k, d = "") => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const today = () => new Date().toISOString().slice(0, 10);
const DIRS = { logo: "brand", screenshot: "products", photo: "products", copy: "products", video: "media", audio: "media", other: "media" };
// Personal library: <profile>/assets; ~/.video-assets is still read if that is where an older one lives.
const PERSONAL = [PERSONAL_ASSETS, join(homedir(), ".video-assets")].find((d) => existsSync(join(d, "library.json"))) ?? PERSONAL_ASSETS;

const libDir = (p) => { const d = resolve(p); return existsSync(join(d, "library.json")) ? d : join(d, "assets-library"); };
const loadLib = (p) => {
  const d = libDir(p);
  if (!existsSync(join(d, "library.json"))) throw new Error(`no asset library at ${p} (run: assets.mjs init ${p})`);
  const meta = JSON.parse(readFileSync(join(d, "library.json"), "utf8"));
  const index = existsSync(join(d, "index.json")) ? JSON.parse(readFileSync(join(d, "index.json"), "utf8")) : [];
  for (const e of index) if (e.type === "screenshot" && /^https?:\/\//.test(e.source ?? "") && e.expires && !e.valid_until) { e.captured ??= e.added; e.valid_until = e.expires; e.expires = ""; }
  return { dir: d, meta, index, save() { writeFileSync(join(d, "library.json"), JSON.stringify(meta, null, 2) + "\n"); writeFileSync(join(d, "index.json"), JSON.stringify(index, null, 2) + "\n"); } };
};
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16);
const expired = (e) => e.expires && e.expires < today(); // licence
const stale = (e) => e.type === "screenshot" && (!e.captured || (e.valid_until && e.valid_until < today())); // picture may no longer be true
const unreviewed = (e) => (e.brand_marks ?? []).length > 0 && !e.marks_review;
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
const kitOf = (lib) => (lib.meta.brand && kitIds().includes(lib.meta.brand) ? loadKit(lib.meta.brand) : null);
// Product names come from brand.json (single source); aliases resolve to the official name.
function productName(lib, p) {
  if (!p) return "";
  const kit = kitOf(lib);
  if (!kit) return p;
  const c = canonicalProduct(kit, p);
  if (!c) throw new Error(`"${p}" is not a product of ${kit.name} (brand.json products: ${products(kit).map((x) => x.name).join(", ") || "none"}). Use the official name, or add it / an alias in brand-kits/${kit.id}/brand.json.`);
  return c;
}
// What the file visibly shows, not just its name: OCR for other brands' names; logos must be the kit's own files.
function inspect(lib, file, info) {
  const kit = kitOf(lib), warn = [];
  if (!kit) return { brand_marks: [], warn };
  let marks = [];
  if (/\.(png|jpe?g|webp|gif)$/i.test(file)) {
    const { available, results } = ocr([file]);
    if (!available) warn.push("OCR unavailable: check by eye for other brands' logos or names");
    marks = [...new Set(findTerms(results[file]?.lines ?? [], otherBrandTerms(kit)).map((h) => h.term))];
    if (marks.length) warn.push(`shows other brand(s): ${marks.join(", ")} — needs review before use (assets.mjs review …)`);
  }
  if (info.type === "logo") {
    const own = [kit, ...allowedKits(kit)].flatMap((k) => readdirSync(join(KITS_DIR, k.id, "logos")).map((f) => sha(join(KITS_DIR, k.id, "logos", f))));
    if (!own.includes(sha(file))) { warn.push("not byte-identical to a brand-kit logo — confirm it is an approved logo version"); marks = [...marks, "logo-version"]; }
  }
  return { brand_marks: marks, warn };
}
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

function init() {
  const d = join(resolve(pos[0] ?? "."), "assets-library");
  for (const sub of ["brand", "products", "claims", "media"]) mkdirSync(join(d, sub), { recursive: true });
  const meta = { name: opt("name", basename(resolve(pos[0] ?? "."))), brand: opt("brand"), default_license: opt("license", "company-owned"), linked: [], created: today() };
  writeFileSync(join(d, "library.json"), JSON.stringify(meta, null, 2) + "\n");
  if (!existsSync(join(d, "index.json"))) writeFileSync(join(d, "index.json"), "[]\n");
  console.log(`asset library ready: ${d}`);
}

function addFile(lib, file, info) {
  const h = sha(file);
  const dup = lib.index.find((e) => e.sha === h);
  if (dup) { console.log(`skip (already in library as ${dup.path}): ${file}`); return dup; }
  const sub = DIRS[info.type] ?? "media";
  const name = `${info.product ? info.product.replace(/\s+/g, "-") + "_" : ""}${basename(file)}`;
  const dest = join(lib.dir, sub, name);
  copyFileSync(file, dest);
  const seen = inspect(lib, file, info);
  const e = { id: h, sha: h, path: relative(lib.dir, dest), ...info, brand_marks: seen.brand_marks, added: today() };
  if (e.type === "screenshot") { e.captured ??= ""; e.valid_until = e.captured ? addDays(e.captured, info.valid_days ?? 30) : ""; }
  delete e.valid_days;
  lib.index.push(e);
  console.log(`added ${e.path}${e.type === "screenshot" && !e.captured ? "  ! capture date unknown — inventory will ask to re-confirm it" : ""}`);
  for (const w of seen.warn) console.log(`  ! ${w}`);
  return e;
}

function add() {
  const lib = loadLib(pos[0]);
  const src = resolve(pos[1]);
  const info = { type: opt("type", "other"), product: productName(lib, opt("product")), tags: opt("tags").split(",").filter(Boolean),
    license: opt("license", lib.meta.default_license), source: opt("source", src), approved_by: opt("approved-by"), expires: opt("expires"), note: opt("note"),
    ...(opt("captured") ? { captured: opt("captured") } : {}), valid_days: +opt("valid-days", 30) };
  for (const f of statSync(src).isDirectory() ? walk(src) : [src]) if (!basename(f).startsWith(".")) addFile(lib, f, info);
  lib.save();
}

function addPlan() {
  const lib = loadLib(pos[0]);
  const plan = JSON.parse(readFileSync(resolve(pos[1]), "utf8"));
  for (const p of plan) {
    const f = resolve(p.file);
    addFile(lib, f, { type: p.type ?? "other", product: productName(lib, p.product), tags: p.tags ?? [], license: p.license ?? lib.meta.default_license,
      source: p.source ?? f, approved_by: p.approved_by ?? "", expires: p.expires ?? "", note: p.note ?? "", ...(p.captured ? { captured: p.captured } : {}), valid_days: p.valid_days ?? 30 });
  }
  lib.save();
}

function review() {
  const lib = loadLib(pos[0]);
  const e = lib.index.find((x) => x.path === pos[1] || x.id === pos[1]);
  if (!e) throw new Error(`no entry ${pos[1]}`);
  if (!opt("approved-by")) throw new Error("--approved-by is required: a person decides whether another brand's mark may appear");
  e.marks_review = { by: opt("approved-by"), date: today(), note: opt("note") };
  lib.save();
  console.log(`reviewed ${e.path}: ${(e.brand_marks ?? []).join(", ")} approved by ${e.marks_review.by}`);
}

async function capture() {
  const lib = loadLib(pos[0]);
  const url = pos[1];
  const { chromium } = await import("playwright-core");
  const { execFileSync } = await import("node:child_process");
  const exe = execFileSync(process.execPath, [join(decodeURIComponent(new URL("..", import.meta.url).pathname), "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const hide = opt("hide");
  if (hide) await page.addStyleTag({ content: `${hide} { visibility: hidden !important; }` });
  const tmp = join(lib.dir, "products", `${opt("name", new URL(url).hostname)}_${today()}.png`);
  await page.screenshot({ path: tmp, fullPage: true });
  await browser.close();
  const exp = addDays(today(), +opt("valid-days", opt("expires-days", 30)));
  const h = sha(tmp);
  const seen = inspect(lib, tmp, { type: "screenshot" });
  lib.index.push({ id: h, sha: h, path: relative(lib.dir, tmp), type: "screenshot", product: productName(lib, opt("product")), tags: ["web-capture"], license: "company-owned",
    source: url, captured: today(), valid_until: exp, expires: "", brand_marks: seen.brand_marks, note: hide ? `hidden before capture: ${hide}` : "", added: today() });
  lib.save();
  console.log(`captured ${url} → ${relative(lib.dir, tmp)} (re-confirm after ${exp})`);
  for (const w of seen.warn) console.log(`  ! ${w}`);
}

function claim() {
  const lib = loadLib(pos[0]);
  const text = opt("text");
  if (!text || !opt("source")) throw new Error("--text and --source are required: a claim on screen must be traceable");
  const id = createHash("sha256").update(text).digest("hex").slice(0, 12);
  lib.index.push({ id, type: "claim", text, product: opt("product"), source: opt("source"), approved_by: opt("approved-by"), approved_on: opt("approved-by") ? today() : "", expires: opt("expires"), added: today() });
  lib.save();
  console.log(`claim ${id} recorded${opt("approved-by") ? "" : " (NOT yet approved — it will not be used on screen until approved)"}`);
}

function link() {
  const lib = loadLib(pos[0]);
  const other = libDir(pos[1]);
  if (!lib.meta.linked.includes(other)) lib.meta.linked.push(other);
  lib.save();
  console.log(`linked ${other} (searched after this project and your personal library; brand assets are never taken from it)`);
}

// Libraries in search order, with whether brand assets may come from each.
function chain(lib) {
  const out = [{ lib, brandOk: true, label: "project" }];
  if (existsSync(join(PERSONAL, "library.json")) && PERSONAL !== lib.dir) out.push({ lib: loadLib(PERSONAL), brandOk: false, label: "personal" });
  for (const l of lib.meta.linked) if (existsSync(join(l, "library.json"))) out.push({ lib: loadLib(l), brandOk: false, label: `linked:${basename(resolve(l, ".."))}` });
  return out;
}

function matches(e, need) {
  if (need.type && e.type !== need.type) return false;
  if (need.product && e.product && e.product !== need.product) return false;
  if (need.product && !e.product && need.type !== "logo") return false;
  return (need.tags ?? []).every((t) => (e.tags ?? []).includes(t) || (e.text ?? "").includes(t));
}

function check() {
  const lib = loadLib(pos[0]);
  const needs = JSON.parse(readFileSync(resolve(pos[1]), "utf8")).map((n) => ({ ...n, product: n.product ? productName(lib, n.product) : n.product }));
  const rows = needs.map((need) => {
    let found = null, where = "";
    for (const { lib: l, brandOk, label } of chain(lib)) {
      if (need.type === "logo" && !brandOk) continue;
      const hit = l.index.find((e) => matches(e, need) && (need.type !== "claim" || e.approved_by));
      if (hit) { found = hit; where = label; break; }
    }
    const status = !found ? "缺少" : expired(found) ? "授權過期" : stale(found) ? "需重新確認" : unreviewed(found) ? "待審核" : "已有";
    return { need, found, where, status };
  });
  const md = [`# 素材盤點（${today()}）`, "", `素材庫：${lib.dir}`, "", "| 需要 | 狀態 | 來源 | 檔案／內容 | 處理 |", "| --- | --- | --- | --- | --- |",
    ...rows.map(({ need, found, where, status }) => `| ${need.label ?? need.type} | ${status} | ${where || "—"} | ${found ? found.path ?? found.text : "—"} | ${status === "已有" ? "" : need.how ?? "待決定：你提供／系統抓取／AI 生成"} |`)].join("\n") + "\n";
  const out = opt("out");
  if (out) writeFileSync(resolve(out), md);
  process.stdout.write(md);
}

function promote() {
  const lib = loadLib(pos[0]);
  const video = resolve(pos[1]);
  const have = new Set(lib.index.map((e) => e.sha));
  const dirs = ["assets", "renders"].map((d) => join(video, d)).filter(existsSync);
  const fresh = dirs.flatMap(walk).filter((f) => /\.(png|jpe?g|svg|mp4|mov|webm|wav|mp3|m4a)$/i.test(f) && !have.has(sha(f)));
  if (!fresh.length) return console.log("nothing new to save back");
  console.log("Files this video produced that the library does not have (add the ones the user approves with `add`):");
  for (const f of fresh) console.log(`  ${relative(video, f)}  (${(statSync(f).size / 1e6).toFixed(1)} MB)`);
}

function tidy() {
  const lib = loadLib(pos[0]);
  const by = (f) => lib.index.filter(f);
  const kit = kitOf(lib);
  const report = [["授權過期", by(expired)], ["需重新確認（截圖日期不明或已過有效期）", by(stale)], ["待審核（含其他品牌標誌或非品牌套件 Logo）", by(unreviewed)],
    ["缺授權", by((e) => e.type !== "claim" && !e.license)], ["宣稱未核可", by((e) => e.type === "claim" && !e.approved_by)],
    ["產品名稱不在 brand.json", by((e) => kit && e.product && !canonicalProduct(kit, e.product))],
    ["檔案不見了", by((e) => e.path && !existsSync(join(lib.dir, e.path)))]];
  for (const [label, list] of report) { console.log(`${label}：${list.length}`); for (const e of list) console.log(`  ${e.path ?? e.text} ${e.expires ? `(到期 ${e.expires})` : ""}`); }
}

function search() {
  const lib = loadLib(pos[0]);
  const words = pos.slice(1).map((w) => w.toLowerCase());
  for (const { lib: l, label } of chain(lib))
    for (const e of l.index.filter((x) => words.every((w) => JSON.stringify(x).toLowerCase().includes(w))))
      console.log(`[${label}] ${e.type} ${e.path ?? e.text}${expired(e) ? " (過期)" : ""}`);
}

const cmds = { init, add, "add-plan": addPlan, review, capture, claim, link, check, promote, tidy, search };
if (!cmds[cmd]) { console.error("usage: assets.mjs init|add|add-plan|review|capture|claim|link|check|promote|tidy|search …"); process.exit(1); }
try { await cmds[cmd](); } catch (e) { console.error(e.message); process.exit(1); }
