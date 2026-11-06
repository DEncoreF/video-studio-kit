#!/usr/bin/env node
// Direction previews: build a short preview of a few candidate styles for ONE video, using that
// video's own content and brand kit. Stage 1 = stills for 4–6 candidates; stage 2 = draft motion
// for the top 2. Nothing is stored in the style library — previews live with the video.
//   node scripts/preview.mjs <videoDir> <style[,style…]> [--brand kestrel] [--motion] [--no-stills] [--force-example]
//
// Per style, the composition code is taken from (first match):
//   <video>/direction/<style>/style/style.{js,css}   ← written for this video from styles/recipes/<style>.md
//   styles/examples/<style>/style.{js,css}           ← sample implementation (personal layer first, then built-in;
//                                                      copied in, then editable)
// Content: <video>/direction/content.json, else styles/_preview/content.json[brand]. Schema:
//   KICKER TAG TITLE LINE NUM LABEL CTA (required) · PRODUCT MESSAGE URL QR{image?,url?,label?} (optional)
//   product (image path) · brand (kit id) · must: ["product-photo", …] (what this video cannot drop)
// Brand facts reach the style as window.BRAND (from brand.json); styles never hard-code them.
// Before building, brand hard rules and content musts are checked against the recipe's `bans`;
// a clash stops that style (exit 3) — it is reported, never silently resolved either way.
// Output:  <video>/direction/<style>/{index.html, stills/, preview.mp4, meta.json}
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { canonicalProduct, loadKit, logoRules } from "./lib/brand.mjs";
import { KITS, TOOL as root, WORKSPACE, examplePath, filmId, recipePath } from "./lib/paths.mjs";
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !["--brand"].includes(a)));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--brand");
if (pos.length < 2) {
  console.error("usage: node scripts/preview.mjs <videoDir> <style[,style…]> [--brand kestrel] [--motion] [--no-stills] [--force-example]");
  process.exit(1);
}
const video = resolve(pos[0]);
const ids = pos[1].split(",").map((s) => s.trim()).filter(Boolean);
const dir = join(video, "direction");
const local = join(dir, "content.json");
const content = existsSync(local)
  ? JSON.parse(readFileSync(local, "utf8"))
  : JSON.parse(readFileSync(join(root, "styles/_preview/content.json"), "utf8"))[opt("brand", "kestrel")];
const brand = opt("brand", content.brand ?? "kestrel");
const kit = loadKit(brand);
const REQUIRED = ["KICKER", "TAG", "TITLE", "LINE", "NUM", "LABEL", "CTA"];
const missing = REQUIRED.filter((k) => !String(content[k] ?? "").trim());
if (missing.length) { console.error(`✗ content.json is missing ${missing.join(", ")}`); process.exit(1); }
if (content.PRODUCT && !canonicalProduct(kit, content.PRODUCT)) console.warn(`! PRODUCT "${content.PRODUCT}" is not in brand-kits/${kit.id}/brand.json products — confirm the official name (or add an alias) before production`);
const BRAND = { id: kit.id, name: kit.name, logo: logoRules(kit), colors: Object.fromEntries(Object.entries(kit.colors ?? {}).map(([k, v]) => [k, v.hex])) };

// Recipe bans vs. brand hard rules and this video's musts.
const recipeMeta = (id) => {
  const fm = readFileSync(recipePath(id), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return { bans: (fm.match(/^bans:\s*\[(.*)\]/m)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
};
const chroma = (hex) => { const n = parseInt(hex.slice(1, 7), 16), c = [n >> 16, (n >> 8) & 255, n & 255]; return (Math.max(...c) - Math.min(...c)) / 255; };
const logoHexes = Object.values(kit.logos ?? {}).flatMap((l) => readFileSync(join(KITS, kit.id, l.file), "utf8").match(/#[0-9a-fA-F]{6}\b/g) ?? []);
const musts = new Set([...(content.must ?? []), ...(content.product ? ["product-photo"] : [])]);
function conflicts(id) {
  const out = [];
  for (const b of recipeMeta(id).bans) {
    if (b === "photo" && musts.has("product-photo")) out.push("配方禁用照片，但這支片必須出現產品照片");
    if (b === "color" && logoHexes.some((h) => chroma(h) > 0.2)) out.push(`配方只用黑白，但 ${kit.name} 的 Logo 有彩色，品牌規則不允許換色`);
  }
  return out;
}
let blocked = 0;
const STILLS_AT = "1.6,4.6,7.4,9.6"; // one per beat: logo · product · stat · cta
const run = (...a) => { const r = spawnSync(process.execPath, a, { stdio: "inherit", cwd: root }); if (r.status) process.exit(r.status); };
const findAsset = (p) => (p ? [join(video, p), join(WORKSPACE, p), join(root, p)].find((f) => existsSync(f)) : undefined);

for (const id of ids) {
  if (!recipePath(id)) { console.error(`✗ ${id}: no recipe at styles/recipes/${id}.md (built-in or personal)`); process.exit(1); }
  const clash = conflicts(id);
  if (clash.length) { console.error(`✗ ${id}: 規則衝突，未產生預覽 —\n${clash.map((c) => `   - ${c}`).join("\n")}\n   交給使用者決定：換風格、調整配方，或改這支片的必備內容（品牌硬性規範優先，不可自行忽略）。`); blocked++; continue; }
  const out = join(dir, id);
  const code = join(out, "style");
  const example = examplePath(id) ?? join(root, "styles/examples", id);
  const same = (f) => existsSync(join(code, f)) && existsSync(join(example, f)) && readFileSync(join(code, f), "utf8") === readFileSync(join(example, f), "utf8");
  let source = same("style.js") && same("style.css") ? "example" : "authored";
  if (flags.has("--force-example") || !existsSync(join(code, "style.js"))) {
    if (!existsSync(join(example, "style.js"))) {
      console.error(`✗ ${id}: no example implementation. Write ${join(filmId(video), "direction", id, "style/style.js")} from styles/recipes/${id}.md first (see styles/README.md for the build(tl, S, C, root) contract).`);
      process.exit(1);
    }
    mkdirSync(code, { recursive: true });
    cpSync(example, code, { recursive: true });
    source = "example";
  }
  mkdirSync(join(out, "vendor"), { recursive: true });
  run(join(root, "scripts/brand-kit.mjs"), "apply", brand, out);
  copyFileSync(join(KITS, "_fonts/LXGWWenKaiTC-Medium.ttf"), join(out, "fonts/LXGWWenKaiTC-Medium.ttf"));
  copyFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), join(out, "vendor/gsap.min.js"));
  copyFileSync(join(root, "styles/_preview/helpers.js"), join(out, "vendor/helpers.js"));
  const product = findAsset(content.product);
  if (product) copyFileSync(product, join(out, "assets/brand/product.png"));
  else if (content.product) console.warn(`! ${id}: product image "${content.product}" not found — preview will show an empty product slot`);
  let qr = content.QR ?? null;
  if (qr?.image) { const f = findAsset(qr.image); if (f) { copyFileSync(f, join(out, `assets/brand/qr${extname(f)}`)); qr = { ...qr, image: `assets/brand/qr${extname(f)}` }; } else { console.warn(`! ${id}: QR image "${qr.image}" not found — showing a placeholder`); qr = { ...qr, image: undefined }; } }
  const C = { ...content, URL: content.URL ?? "", QR: qr, logo: "assets/brand/logo.svg", logoReversed: "assets/brand/logo-reversed.svg", product: product ? "assets/brand/product.png" : "" };
  const html = readFileSync(join(root, "styles/_preview/template.html"), "utf8").replaceAll("{{STYLE_ID}}", id)
    .replace("{{CONTENT}}", JSON.stringify(C)).replace("{{BRAND}}", JSON.stringify(BRAND));
  writeFileSync(join(out, "index.html"), html);
  writeFileSync(join(out, "meta.json"), JSON.stringify({ style: id, video: filmId(video), brand, source, builtAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`preview ${id} (${source}) → ${join(filmId(video), "direction", id)}`);
  if (!flags.has("--no-stills")) run(join(root, "scripts/hf.mjs"), "snapshot", out, "--at", STILLS_AT, "--no-end", "--describe", "false", "-o", join(out, "stills"));
  if (flags.has("--motion")) run(join(root, "scripts/hf.mjs"), "render", out, "--output", join(out, "preview.mp4"), "--quality", "draft");
}
console.log(`\nreview: node scripts/gallery.mjs --video ${pos[0]}   (本片候選)`);
if (blocked) process.exit(3);
