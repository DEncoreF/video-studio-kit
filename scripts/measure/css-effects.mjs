// The light and material a web reference actually draws with (video-direction references/look-extraction.md): every distinct
// box-shadow, text-shadow, filter, backdrop-filter, gradient, blend mode and mask on the visible page, with how many elements use
// it and where. Exact values, unlike finish.py's estimates from pixels; designlang and Dembrandt do the same for design tokens
// (docs/research/reference-look-extraction-2026-11-04.md), this keeps to effects and needs nothing new.
//   node scripts/measure/css-effects.mjs <url | page.html> [--json out.json] [--shot out.png] [--width 1440] [--height 900] [--wait 1500]
import { resolve, join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { serve } from "../lib/serve.mjs";

const TOOL = resolve(new URL("../..", import.meta.url).pathname);
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const target = args[0];
if (!target || target.startsWith("--")) { console.error("usage: css-effects.mjs <url | page.html> [--json out.json] [--shot out.png] [--width 1440] [--height 900] [--wait 1500]"); process.exit(1); }

const { chromium } = await import(join(TOOL, "node_modules/playwright-core/index.mjs"));
const local = !/^https?:\/\//.test(target) && existsSync(target), server = local ? serve(dirname(resolve(target))) : null;
const exe = execFileSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: +opt("width", 1440), height: +opt("height", 900) } });
await page.goto(local ? `http://127.0.0.1:${server.address().port}/${basename(target)}` : target, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(+opt("wait", 1500));

const found = await page.evaluate(() => {
  const PROPS = { "box-shadow": "none", "text-shadow": "none", filter: "none", "backdrop-filter": "none", "mix-blend-mode": "normal", "mask-image": "none" };
  const groups = new Map();
  const where = (el) => { const r = el.getBoundingClientRect(); return { selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + [...el.classList].slice(0, 2).map((c) => `.${c}`).join(""),
    box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], text: (el.innerText || "").trim().slice(0, 40) }; };
  const add = (prop, value, el) => { const k = `${prop}\u0000${value}`; if (!groups.has(k)) groups.set(k, { prop, value, count: 0, examples: [] });
    const g = groups.get(k); g.count++; if (g.examples.length < 3) g.examples.push(where(el)); };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    for (const [p, none] of Object.entries(PROPS)) { const v = cs.getPropertyValue(p) || cs.getPropertyValue(`-webkit-${p}`); if (v && v !== none) add(p, v, el); }
    for (const p of ["background-image", "border-image-source"]) { const v = cs.getPropertyValue(p); if (/gradient\(/.test(v)) add(p, v, el); }
    if (+cs.opacity < 1 && cs.getPropertyValue("backdrop-filter") !== "none") add("glass", `opacity ${cs.opacity}; background ${cs.backgroundColor}`, el);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
});
if (opt("shot")) await page.screenshot({ path: opt("shot") });
await browser.close(); server?.close();

const out = { source: target, viewport: [+opt("width", 1440), +opt("height", 900)], effects: found };
if (opt("json")) writeFileSync(opt("json"), JSON.stringify(out, null, 1) + "\n");
const byProp = Object.groupBy ? Object.groupBy(found, (g) => g.prop) : found.reduce((o, g) => ((o[g.prop] ??= []).push(g), o), {});
console.log(`css-effects: ${target} · ${found.length} distinct effects`);
for (const [p, gs] of Object.entries(byProp)) {
  console.log(`  ${p} (${gs.length})`);
  for (const g of gs.slice(0, 6)) console.log(`    ×${String(g.count).padEnd(3)} ${g.value.length > 140 ? g.value.slice(0, 137) + "…" : g.value}   e.g. ${g.examples[0].selector}`);
}
