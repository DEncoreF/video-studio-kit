#!/usr/bin/env node
// semantic-type: a test bed for one semantic title, the objective checks, and a short clip with its sound.
//   node .claude/skills/semantic-type/scripts/semtype.mjs init <dir> --title "<標題>" [--dept …] [--sw …] [--line "第一行|第二行"]
//        [--theme dark|light] [--duration 4] [--cue 1.2]
//   node …/semtype.mjs copy <film> --to <dir> --target <id> --freeze <t> --key <t> [--off <s>] [--dur 4] [--sub <id>]
//        [--nb id,id…] [--drop <selector>] [--fx Name.fn] [--script <file>]
//        → a test copy of a film drawn from the time (a one-take, the camera always moving): the world frozen at --freeze,
//        only the title runs; film time = test time + --off (see copy() below)
//   node …/semtype.mjs root          → the tool root (the repo that has scripts/hf.mjs); every command runs from any folder
//   node …/semtype.mjs check <dir>   → <dir>/check/check.json + sheet.jpg: the last frame equals the plain layout (unless
//        semtype.json says {"end": "meaning", "approved": true}), nothing
//        is drawn on a neighbour or outside the title's box, no text is added, it settles and holds, a sound cue lands on the key moment
//   node …/semtype.mjs clip <dir>    → <dir>/out/clip.mp4 (draft render + the sfx.json cues) and out/stills.jpg (start / mid / end);
//        it also checks that the real render holds the same final frame the check saw (render_matches_check)
// The reference for every check is the same page built with ?static (no effect). Runs from the tool root.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
let TOOL = process.env.VSO_TOOL || SKILL;
while (!existsSync(join(TOOL, "scripts/hf.mjs")) && dirname(TOOL) !== TOOL) TOOL = dirname(TOOL);
const require = createRequire(join(TOOL, "package.json"));
const FFMPEG = require("ffmpeg-static");
const [cmd, dirArg, ...rest] = process.argv.slice(2);
if (cmd === "root") { console.log(TOOL); process.exit(0); } // the tool root, for the tool's own scripts (refs, profile, hf)
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const die = (m) => { console.error(m); process.exit(1); };
if (!cmd || !dirArg) die("usage: semtype.mjs init|copy|check|clip|render-check <dir> … | root");
const DIR = resolve(dirArg);

// ---------- init ----------
async function init() {
  if (existsSync(DIR) && readdirSync(DIR).length) die(`${DIR} already has files: pick a new test-copy folder`);
  const title = opt("title") ?? die("--title is required");
  const { KITS } = await import(join(TOOL, "scripts/lib/paths.mjs"));
  const fonts = [join(KITS, "_fonts"), join(TOOL, "brand-kits/_fonts")].find((d) => existsSync(join(d, "NotoSerifTC-VF.ttf"))) ?? die("no brand-kits/_fonts with NotoSerifTC-VF.ttf");
  const duration = +opt("duration", 4), cue = +opt("cue", 1.2);
  for (const d of ["fonts", "vendor", "lib"]) mkdirSync(join(DIR, d), { recursive: true });
  const fill = { TITLE: esc(title), DEPT: esc(opt("dept", "企業 AI")), SW: esc(opt("sw", "MODULE · DEMO")), LINE: opt("line") ? esc(opt("line")).replace(/&lt;br\s*\/?&gt;|\\n|\s*\|\s*/g, "<br>") : "一句話說明這個功能做什麼，<br>第二行補充一點細節。", THEME: opt("theme", "dark"), DURATION: duration, CUE: cue };
  writeFileSync(join(DIR, "index.html"), readFileSync(join(SKILL, "templates/testbed/index.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k]));
  for (const f of ["NotoSerifTC-VF.ttf", "NotoSansTC-VF.ttf", "OFL.txt"]) copyFileSync(join(fonts, f), join(DIR, "fonts", f));
  copyFileSync(require.resolve("gsap/dist/gsap.min.js"), join(DIR, "vendor/gsap.min.js"));
  copyFileSync(join(SKILL, "lib/semantic-type.js"), join(DIR, "lib/semantic-type.js"));
  writeFileSync(join(DIR, "effect.js"), `// The semantic title (semantic-type skill): one physical action, once, ending exactly on the plain layout.
// S = { tl, title, root, cue, lib }: add tweens to S.tl only; no Math.random or timers (lib.rng(seed) for randomness).
window.SEMANTIC_EFFECT = ({ tl, title, cue, lib }) => {
  // placeholder entrance, not semantic: replace it with the action chosen in NOTES.md
  tl.fromTo(lib.splitChars(title), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: lib.springy(), stagger: 0.05 }, cue - 0.6);
};
`);
  writeFileSync(join(DIR, "sfx.json"), JSON.stringify({ key: cue, cues: [] }, null, 2) + "\n");
  writeFileSync(join(DIR, "NOTES.md"), `# ${title}\n\n- 在這支片裡的意思：\n- 造成動作的字（重點字）：\n- 三個真實動作：\n  1. \n  2. \n  3. \n- 選哪個、為什麼（其他兩個為什麼輸）：\n- 結尾：回到原排版／結尾狀態就是語意（要先問）\n- 音效：材質＋動作 → 音色\n`);
  writeFileSync(join(DIR, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n");
  writeFileSync(join(DIR, "meta.json"), JSON.stringify({ id: DIR.split(sep).pop(), name: title }, null, 2) + "\n");
  console.log(`test bed → ${DIR}\n  write effect.js, sfx.json (cues), NOTES.md; then: semtype.mjs check ${dirArg} → semtype.mjs clip ${dirArg}`);
}

// ---------- copy ----------
// A film whose whole picture is one page drawn from the time (a one-take: render(t), the camera always moving) has no
// still layout to put the title on, so the test bed does not fit. Its test copy is the real page with the world frozen
// at --freeze (the film's own timeline seeked there once): the real layout and neighbours, every other title removed,
// and a "main" timeline that only runs the title. Film time = test time + --off. The effect is make(title, key, lib)
// → draw(t), where t is film time and every style comes from t alone, so it moves into the film's render(t) unchanged.
// Run again on an existing copy to follow the film: the film's files are refreshed; effect.js, sfx.json, NOTES.md and
// semtype.json (the work) are kept.
function copy() {
  const FILM = DIR, TO = resolve(opt("to") ?? die("--to <test-copy dir> is required (videos/_semantic-<slug>)"));
  const num = (k, d) => { const v = opt(k); if (v === undefined && d === undefined) die(`--${k} is required`); const n = v === undefined ? d : +v; if (!Number.isFinite(n)) die(`--${k} must be a number`); return n; };
  const target = opt("target") ?? die("--target <id of the title> is required"), sub = opt("sub"), fx = opt("fx");
  const freeze = num("freeze"), key = num("key"), off = num("off", Math.max(0, +(key - 1.2).toFixed(3))), dur = num("dur", 4), cue = +(key - off).toFixed(3);
  if (cue <= 0 || cue >= dur) die(`the key moment (${key} s) must fall inside the copy: film ${off}–${off + dur} s`);
  let html = readFileSync(join(FILM, "index.html"), "utf8");
  const rootTag = html.match(/<[^>]*\bdata-composition-id="([^"]+)"[^>]*>/) ?? die("no data-composition-id in the film's index.html");
  const filmId = rootTag[1], filmDur = rootTag[0].match(/\bdata-duration="([\d.]+)"/)?.[1] ?? die("the film's root has no data-duration");
  // every clip must span the whole film: the copy stretches them all to its own duration (a scene-based film: copy the scene)
  const odd = [...html.matchAll(/\bdata-(start|duration)="([^"]*)"/g)].filter(([, k, v]) => (k === "start" ? v !== "0" : v !== filmDur));
  if (odd.length) die(`copy needs a film drawn as one page (every clip from 0 to ${filmDur} s); found ${odd.map((m) => m[0]).join(", ")}`);
  const tagOf = (id) => html.match(new RegExp(`<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`)) ?? die(`no element with id="${id}" in the film`);
  const [outer, , inner] = tagOf(target), name = inner.replace(/<[^>]+>/g, "").trim(), cls = (t) => t.match(/^<[^>]*\bclass="([^"]*)"/)?.[1].split(/\s+/)[0];
  const subTag = sub ? tagOf(sub)[0] : null;
  const drop = opt("drop") ?? [cls(outer), subTag && cls(subTag)].filter(Boolean).map((c) => `.${c}`).join(", ");
  const nb = (opt("nb") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of nb) tagOf(id);
  const fresh = !existsSync(TO);
  mkdirSync(TO, { recursive: true });
  // the film's files the page loads: each one's folder (fonts/, vendor/, assets/brand/…) or the file itself at the top
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"|url\(\s*['"]?([^'")]+)/g)].map((m) => m[1] ?? m[2]).filter((r) => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(r));
  for (const r of new Set(refs.map((r) => (r.includes("/") ? dirname(r) : r)))) {
    if (!existsSync(join(FILM, r))) die(`the film loads ${r}, which is missing`);
    cpSync(join(FILM, r), join(TO, r), { recursive: true });
  }
  const loaded = new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]));
  const add = [];
  if (!loaded.has("lib/semantic-type.js")) { mkdirSync(join(TO, "lib"), { recursive: true }); copyFileSync(join(SKILL, "lib/semantic-type.js"), join(TO, "lib/semantic-type.js")); add.push("lib/semantic-type.js"); }
  const extra = opt("script"); // a shared effect module that is not in the film yet (several titles of one film share it)
  if (extra) { const b = basename(extra); copyFileSync(resolve(extra), join(TO, b)); if (!loaded.has(b)) add.push(b); }
  const ns = fx?.split(".")[0], fxFile = fx && [...loaded, ...add].find((f) => existsSync(join(TO, f)) && new RegExp(`window\\.${ns}\\s*=`).test(readFileSync(join(TO, f), "utf8")));
  if (fx && !fxFile) die(`no script the copy loads defines window.${ns} (--script <file> adds one)`);
  html = html.replace(rootTag[0], rootTag[0].replace(`data-composition-id="${filmId}"`, 'data-composition-id="main"'))
    .replaceAll(`data-duration="${filmDur}"`, `data-duration="${dur}"`)
    .replace(/<\/body>/, () => `${add.map((s) => `  <script src="${s}"></script>\n  `).join("")}  <script src="effect.js"></script>
    <script>
      // test copy (semantic-type copy): the world frozen at ${freeze} s of the film; only the title runs, film time = t + ${off}
      (function () {
        window.__timelines["${filmId}"].seek(${freeze}, false);
        delete window.__timelines["${filmId}"];
        // nothing in the frozen world moves again: without will-change its layers rasterise the same in every frame
        for (const el of document.querySelectorAll("#root *")) if (getComputedStyle(el).willChange !== "auto") el.style.willChange = "auto";
        for (const el of document.querySelectorAll(${JSON.stringify(drop || "#none")})) if (!${JSON.stringify([target, sub].filter(Boolean)).replace(/,/g, ", ")}.includes(el.id)) el.remove();
        // a fresh title from the film's markup: nothing the film's scripts set on it (styles, split characters, caches) carries over
        const title = document.createRange().createContextualFragment(${JSON.stringify(outer)}).firstElementChild;
        document.getElementById("${target}").replaceWith(title); title.id = "title";
        ${sub ? `const sub = document.getElementById("${sub}"); sub.style.opacity = "1"; sub.style.transform = "none"; sub.classList.add("nb");` : ""}
        for (const id of ${JSON.stringify(nb).replace(/,/g, ", ")}) document.getElementById(id).classList.add("nb");
        const tl = gsap.timeline({ paused: true });
        const plain = location.search.includes("static") || document.documentElement.hasAttribute("data-static");
        if (!plain && window.SEMANTIC_EFFECT) window.SEMANTIC_EFFECT({ tl, title, root: document.getElementById("root"), cue: ${cue}, lib: window.SemType });
        tl.set({}, {}, ${dur});
        window.__timelines["main"] = tl;
        tl.seek(0);
      })();
    </script>
  </body>`);
  writeFileSync(join(TO, "index.html"), html);
  for (const f of ["hyperframes.json"]) if (existsSync(join(FILM, f))) copyFileSync(join(FILM, f), join(TO, f));
  writeFileSync(join(TO, "meta.json"), JSON.stringify({ id: TO.split(sep).pop(), name }, null, 2) + "\n");
  const keep = (f, body) => { if (!existsSync(join(TO, f))) writeFileSync(join(TO, f), body); };
  const drive = (make) => `window.SEMANTIC_EFFECT = ({ tl, title, cue, lib }) => {
  const OFF = ${off}, draw = ${make}(title, cue + OFF, lib), c = { t: 0 };
  tl.fromTo(c, { t: 0 }, { t: ${dur}, duration: ${dur}, ease: "none", immediateRender: false, onUpdate: () => draw(c.t + OFF) }, 0);
  draw(OFF);
};
`;
  keep("effect.js", fx ? `// ${name}: ${fx} (${fxFile}), driven by film time = t + ${off}\n${drive(`window.${fx}`)}` : `// ${name} (semantic-type copy of ${FILM.split(sep).pop()}): make(title, key, lib) prepares the title once and returns
// draw(t), t = film time, key = the key moment in film time. Set every style from t alone, and once the action is over
// clear every inline style it set, so the end is the plain layout; then draw() moves into the film's render(t) unchanged.
const make = (title, key, lib) => {
  // placeholder entrance, not semantic: replace it with the action chosen in NOTES.md
  const cs = lib.splitChars(title);
  return (t) => cs.forEach((ch, i) => {
    const k = Math.min(1, Math.max(0, (t - (key - 0.6 + i * 0.05)) / 0.4));
    ch.style.opacity = k >= 1 ? "" : k.toFixed(3);
  });
};
${drive("make")}`);
  keep("sfx.json", JSON.stringify({ key: cue, cues: [] }, null, 2) + "\n");
  keep("NOTES.md", `# ${name}\n\n- 測試複本：${FILM.split(sep).pop()} 凍結在 ${freeze} 秒，只跑標題；片內時間＝測試時間＋${off}，關鍵瞬間 ${key} 秒（測試 ${cue} 秒）\n- 在這支片裡的意思：\n- 造成動作的字（重點字）：\n- 三個真實動作：\n  1. \n  2. \n  3. \n- 選哪個、為什麼（其他兩個為什麼輸）：\n- 結尾：回到原排版／結尾狀態就是語意（要先問）\n- 音效：材質＋動作 → 音色\n`);
  console.log(`${fresh ? "test copy" : "refreshed"} → ${TO}（${filmId} frozen at ${freeze} s, film = t + ${off}, key ${cue} s, neighbours ${[sub, ...nb].filter(Boolean).join(" ") || "none: pass --nb"}）\n  then: semtype.mjs check ${TO} → semtype.mjs clip ${TO}`);
}

// ---------- check ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".ttf": "font/ttf", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const serveDir = (root) => new Promise((done) => {
  const srv = createServer((req, res) => {
    const f = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!f.startsWith(root + sep) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f));
  }).listen(0, "127.0.0.1", () => done(srv));
});

// PNG (8-bit RGB/RGBA, not interlaced: what the browser's screenshots are) → RGB bytes.
function decodePNG(buf) {
  let pos = 8, w, h, ct; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error("unsupported PNG"); }
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), rgb = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], o = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw[o + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) rgb[(y * w + x) * 3 + k] = cur[x * bpp + k];
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgb };
}
const TH = 40; // a pixel differs when a channel moves more than this (anti-aliasing and grain stay under it)
const differs = (A, B, i) => Math.abs(A.rgb[i] - B.rgb[i]) > TH || Math.abs(A.rgb[i + 1] - B.rgb[i + 1]) > TH || Math.abs(A.rgb[i + 2] - B.rgb[i + 2]) > TH;
const bboxOf = (pts) => pts.length ? pts.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }), { x0: 1e9, y0: 1e9, x1: -1, y1: -1 }) : null;

// visible text characters on the page (opacity, visibility, colour or stroke, inside the frame)
const VISIBLE_TEXT = () => {
  const out = new Set(), walker = document.createTreeWalker(document.getElementById("root"), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode, s = n.textContent.replace(/\s/g, ""); if (!s) continue;
    const e = n.parentElement; if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let o = 1; for (let x = e; x && x !== document.documentElement; x = x.parentElement) o *= +getComputedStyle(x).opacity;
    const cs = getComputedStyle(e), clear = cs.color === "transparent" || /,\s*0\)$/.test(cs.color);
    if (o < 0.05 || (clear && !(parseFloat(cs.webkitTextStrokeWidth) > 0))) continue;
    const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
    if (b.width < 1 || b.right < 0 || b.left > innerWidth || b.bottom < 0 || b.top > innerHeight) continue;
    for (const ch of s) out.add(ch);
  }
  return [...out];
};

async function check() {
  const { chromium } = require("playwright-core");
  const exe = execFileSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
  const srv = await serveDir(DIR), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: exe });
  const S = 0.5, page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: S });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const open = async (url) => { await page.goto(url); await page.evaluate(() => document.fonts.ready); await page.waitForFunction(() => !!window.__timelines?.main); await page.waitForTimeout(150); };
  const shot = async (t) => { await page.evaluate((t) => { window.__timelines.main.seek(t, false); }, t); return decodePNG(await page.screenshot()); };
  try {
    await open(`${base}?static`);
    const info = await page.evaluate(() => ({ dur: +document.getElementById("root").dataset.duration, fps: +document.getElementById("root").dataset.fps || 30,
      px: parseFloat(getComputedStyle(document.getElementById("title")).fontSize), title: (() => { const r = document.getElementById("title").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      nb: [...document.querySelectorAll(".nb")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.x, y: r.y, w: r.width, h: r.height }; }) }));
    const B = await shot(info.dur), refText = await page.evaluate(VISIBLE_TEXT);
    await page.evaluate(() => (document.getElementById("title").style.visibility = "hidden"));
    const C = await shot(info.dur), { w, h } = B;
    // the title's box: its layout box and its ink, plus a small margin (0.15 em)
    const ink = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (differs(B, C, (y * w + x) * 3)) ink.push([x, y]);
    const ib = bboxOf(ink), m = 0.15 * info.px * S, T = info.title;
    const box = { x0: Math.min(ib.x0, T.x * S) - m, y0: Math.min(ib.y0, T.y * S) - m, x1: Math.max(ib.x1, (T.x + T.w) * S) + m, y1: Math.max(ib.y1, (T.y + T.h) * S) + m };
    const inBox = (x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
    const nbAt = (x, y) => info.nb.find((n) => x >= n.x * S && x <= (n.x + n.w) * S && y >= n.y * S && y <= (n.y + n.h) * S);
    // semtype.json: {"end": "meaning", "approved": true} = the end state is itself the meaning (stops at the cap, stays
    // cut), which needs the user's OK first; {"transient_text": "123456", "why": "…"} = characters that pass by as part of
    // the action itself (a counter rolling 1→7), never a label or a reading. Both are reported, not hidden.
    const decl = existsSync(join(DIR, "semtype.json")) ? JSON.parse(readFileSync(join(DIR, "semtype.json"), "utf8")) : {};
    const allowText = [...String(decl.transient_text ?? "")];
    await open(base);
    // frames in time order, like a render; the first at 0.001 so the timeline passes its t=0 sets as the renderer does
    const step = 0.1, times = [0.001]; for (let t = step; t < info.dur - 1e-6; t += step) times.push(+t.toFixed(3)); times.push(+(info.dur - 1 / info.fps).toFixed(3));
    const frames = [], spill = [], touch = [], added = [];
    for (const t of times) {
      const F = await shot(t); frames.push({ t, F });
      const out = [], hit = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; if (!differs(F, B, i)) continue; const n = nbAt(x, y); if (n) hit.set(n.id, (hit.get(n.id) ?? 0) + 1); if (!inBox(x, y)) out.push([x, y]); }
      for (const [id, pixels] of hit) if (pixels > 3) touch.push({ t, id, pixels });
      if (out.length > 6) spill.push({ t, pixels: out.length, where: bboxOf(out) });
      const txt = await page.evaluate(VISIBLE_TEXT), extra = txt.filter((c) => !refText.includes(c) && !allowText.includes(c));
      if (extra.length) added.push({ t, chars: extra.join("") });
    }
    // the end: the last frame against the plain layout; it must also have stopped moving well before the end
    const last = frames.at(-1).F; let endDiff = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (differs(last, B, (y * w + x) * 3)) endDiff.push([x, y]);
    const moving = frames.filter(({ F }) => { let n = 0; for (let i = 0; i < F.rgb.length && n < 7; i += 3) if (differs(F, last, i)) n++; return n > 6; });
    const settle = moving.length ? moving.at(-1).t + step : 0, start = frames.find(({ F }) => { let n = 0; for (let i = 0; i < F.rgb.length && n < 7; i += 3) if (differs(F, B, i)) n++; return n > 6; })?.t ?? null;
    // sound: cues exist, use kinds the sound engine has, and one lands on the key moment
    const sfx = existsSync(join(DIR, "sfx.json")) ? JSON.parse(readFileSync(join(DIR, "sfx.json"), "utf8")) : { cues: [] };
    const kinds = new Set([...readFileSync(join(TOOL, "pipelines/music/edit.py"), "utf8").matchAll(/"(\w+)":\s*[\d.]+/g)].map((x) => x[1]));
    const badKinds = (sfx.cues ?? []).filter((c) => !kinds.has(c.kind)).map((c) => c.kind), onKey = (sfx.cues ?? []).some((c) => Math.abs(c.t - sfx.key) <= 0.07);
    const nbTouched = [...new Set(touch.map((x) => x.id))];
    const endOk = endDiff.length <= 20, meaning = decl.end === "meaning";
    const checks = {
      end_matches_layout: { pass: endOk || (meaning && decl.approved === true), pixels: endDiff.length, where: bboxOf(endDiff), declared: meaning ? `end state is the meaning${decl.approved === true ? " (approved)" : " — waiting for the user's OK"}` : undefined, note: "最後一格和沒有效果的原版面比對（半解析度）；結尾狀態就是語意時寫 semtype.json，使用者同意後才算過" },
      no_neighbour_touch: { pass: !nbTouched.length, neighbours: nbTouched, first: touch[0] ?? null, note: "任何一格都不能改到鄰近元素（.nb）" },
      stays_in_box: { pass: !spill.length, frames: spill.slice(0, 5), box: box, note: "效果只在標題的框（版面框＋墨跡＋0.15em）內" },
      no_added_text: { pass: !added.length, frames: added.slice(0, 5), transient: allowText.length ? `${decl.transient_text}（${decl.why ?? "沒寫理由"}）` : undefined, note: "畫面上出現的字只能是原版面已有的字（動作本身經過的字要在 semtype.json 的 transient_text 寫明）" },
      settles_and_holds: { pass: start !== null && info.dur - settle >= 0.8, starts: start, settles: +settle.toFixed(2), hold: +(info.dur - settle).toFixed(2), note: "有動作，且最後至少靜止 0.8 秒" },
      sound_cue: { pass: (sfx.cues ?? []).length > 0 && !badKinds.length && onKey && (sfx.cues ?? []).every((c) => c.why), cues: (sfx.cues ?? []).length, unknown_kinds: badKinds, on_key: onKey, key: sfx.key, note: "sfx.json 有音效、音色存在、有一個落在 key（±0.07 秒）、每個 cue 寫了材質理由 why" },
      no_page_errors: { pass: !errors.length, errors },
    };
    const pass = Object.values(checks).every((c) => c.pass);
    mkdirSync(join(DIR, "check"), { recursive: true });
    const win = frames.filter((f) => start !== null && f.t >= start - 0.1 && f.t <= settle + 0.1), pick = win.length ? Array.from({ length: 6 }, (_, i) => win[Math.round((i * (win.length - 1)) / 5)]) : frames.slice(0, 6);
    sheet(pick, B, box, w, h, join(DIR, "check/sheet.jpg"));
    writeFileSync(join(DIR, "check/last.rgb"), last.rgb); // the clip step compares the real render with this
    writeFileSync(join(DIR, "check/check.json"), JSON.stringify({ pass, frame: { w, h }, window: { start, settle: +settle.toFixed(2), mid: start === null ? null : +((start + settle) / 2).toFixed(2), end: info.dur }, checks }, null, 2) + "\n");
    for (const [k, c] of Object.entries(checks)) console.log(`${c.pass ? "✓" : "✗"} ${k}${c.pass ? "" : `  ${JSON.stringify({ ...c, pass: undefined, note: undefined, box: undefined })}`}`);
    console.log(`${pass ? "PASS" : "FAIL"} → ${join(dirArg, "check/check.json")}, sheet ${join(dirArg, "check/sheet.jpg")}（紅＝框外或鄰近元素被改到，青框＝標題的框）`);
    process.exitCode = pass ? 0 : 2;
  } finally { await browser.close(); srv.close(); }
}

// six frames across the effect, pixels outside the box that differ from the layout painted red, the box outlined
function sheet(pick, B, box, w, h, out) {
  const W = w * 3, H = h * 2, img = Buffer.alloc(W * H * 3);
  pick.forEach(({ F }, k) => {
    const ox = (k % 3) * w, oy = Math.floor(k / 3) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3, o = ((oy + y) * W + ox + x) * 3, edge = (Math.abs(x - box.x0) < 1 || Math.abs(x - box.x1) < 1) && y >= box.y0 && y <= box.y1 || (Math.abs(y - box.y0) < 1 || Math.abs(y - box.y1) < 1) && x >= box.x0 && x <= box.x1;
      const bad = differs(F, B, i) && !(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1);
      if (edge) { img[o] = 0; img[o + 1] = 220; img[o + 2] = 230; } else if (bad) { img[o] = 255; img[o + 1] = 40; img[o + 2] = 40; } else F.rgb.copy(img, o, i, i + 3);
    }
  });
  const ppm = out.replace(/\.jpg$/, ".ppm");
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img]));
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", ppm, "-q:v", "3", out]); rmSync(ppm);
}

// The renderer renders frames out of order (and in parallel): an effect that only works when every frame is visited
// in sequence (state kept between onUpdate calls, a callback that has to fire) passes the check in the browser but
// renders wrong. So the held frames of the real render must equal the last frame the check saw.
function renderMatches(video, dur) {
  const cj = join(DIR, "check/check.json"), lastF = join(DIR, "check/last.rgb");
  if (!existsSync(cj) || !existsSync(lastF)) { console.log("! render not compared: run check first"); return; }
  const c = JSON.parse(readFileSync(cj, "utf8")), { w, h } = c.frame, last = { rgb: readFileSync(lastF) };
  const times = [...new Set([c.window.settle + 0.3, (c.window.settle + dur) / 2, dur - 0.05].filter((t) => t < dur && t > c.window.settle).map((t) => +t.toFixed(2)))];
  // compared on a coarse grid (8×8-pixel cells, averaged, after removing the overall colour offset between the browser and
  // the encoded video): on held frames renderer and codec noise stays under ~55 per cell; a wrong held frame (a door left
  // open, a word half drawn) moves whole cells by 100+
  const G = 8, gw = Math.floor(w / G), gh = Math.floor(h / G), grid = (rgb, off = [0, 0, 0]) => { const o = new Float32Array(gw * gh * 3);
    for (let y = 0; y < gh * G; y++) for (let x = 0; x < gw * G; x++) for (let k = 0; k < 3; k++) o[((Math.floor(y / G) * gw) + Math.floor(x / G)) * 3 + k] += (rgb[(y * w + x) * 3 + k] - off[k]) / (G * G);
    return o; };
  const ref = grid(last.rgb);
  const frames = times.map((t) => {
    const rgb = execFileSync(FFMPEG, ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", `scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    const off = [0, 0, 0]; for (let i = 0; i < rgb.length; i++) off[i % 3] += (rgb[i] - last.rgb[i]) / (w * h);
    const g = grid(rgb, off); let n = 0, worst = 0; for (let i = 0; i < g.length; i++) { const d = Math.abs(g[i] - ref[i]); worst = Math.max(worst, d); if (d > 64) n++; }
    return { t, cells: Math.ceil(n / 3), worst: +worst.toFixed(0) };
  });
  const ok = frames.every((f) => f.cells <= 3);
  c.checks.render_matches_check = { pass: ok, frames, note: "實際渲染在靜止段的畫面要和檢查看到的最後一格一樣（不一樣＝效果靠逐格依序播放才對，渲染時會錯）" };
  c.pass = Object.values(c.checks).every((x) => x.pass);
  writeFileSync(cj, JSON.stringify(c, null, 2) + "\n");
  console.log(`${ok ? "✓" : "✗"} render_matches_check  ${frames.map((f) => `${f.t}s:${f.cells}`).join(" ")}${ok ? "" : "  → 渲染和檢查不一樣：不要依賴 onUpdate 之間保留的狀態或 callback；每個畫面只由時間決定"}`);
}

// ---------- clip ----------
function clip() {
  const out = join(DIR, "out"); mkdirSync(out, { recursive: true });
  const hf = (...a) => { const r = spawnSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), ...a], { cwd: TOOL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); if (r.status) die(r.stdout + r.stderr); return r.stdout; };
  const dur = +readFileSync(join(DIR, "index.html"), "utf8").match(/data-duration="([\d.]+)"/)[1];
  hf("render", DIR, "--quality", "draft", "--output", join(out, "video.mp4"));
  renderMatches(join(out, "video.mp4"), dur);
  // sound: the cues through the studio's sound engine and its effects bus (one small room, softened top), no music
  const sfx = JSON.parse(readFileSync(join(DIR, "sfx.json"), "utf8"));
  if (sfx.cues?.length) {
    const silent = join(out, "silence.wav"), hdr = Buffer.alloc(44); // 44.1 kHz 16-bit stereo, a few samples
    hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + 16, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(44100, 24); hdr.writeUInt32LE(176400, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(16, 40);
    writeFileSync(silent, Buffer.concat([hdr, Buffer.alloc(16)]));
    const spec = { duration: dur, segments: [], sfx: sfx.cues.map(({ why, ...c }) => c), sfx_bus: sfx.bus ?? { room: 0.2, decay: 0.74, damp: 0.42, soften: 11000 } };
    writeFileSync(join(out, "sfx-spec.json"), JSON.stringify(spec, null, 2));
    const py = spawnSync("python3", [join(TOOL, "pipelines/music/edit.py"), join(out, "sfx-spec.json"), silent, join(out, "sfx.wav")], { encoding: "utf8" });
    if (py.status) die(py.stderr);
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", join(out, "video.mp4"), "-i", join(out, "sfx.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-af", "volume=0.6", "-shortest", join(out, "clip.mp4")]);
    rmSync(silent);
  } else copyFileSync(join(out, "video.mp4"), join(out, "clip.mp4"));
  const c = existsSync(join(DIR, "check/check.json")) ? JSON.parse(readFileSync(join(DIR, "check/check.json"), "utf8")).window : null;
  // start = on the way in, mid = the key moment (sfx.json key, where the action lands), end = the last frame
  const key = sfx.key ?? c?.mid ?? dur / 2, s0 = c?.start ?? 0;
  const at = [s0 + 0.5 * Math.max(0.1, key - s0), key + 0.03, dur - 0.05];
  rmSync(join(out, "stills"), { recursive: true, force: true });
  hf("snapshot", DIR, "--at", at.map((t) => t.toFixed(2)).join(","), "--no-end", "--keep", "-o", join(out, "stills"));
  const pngs = readdirSync(join(out, "stills")).filter((f) => f.endsWith(".png")).sort((a, b) => parseFloat(a.slice(3)) - parseFloat(b.slice(3))).map((f) => join(out, "stills", f));
  execFileSync(FFMPEG, ["-v", "error", "-y", ...pngs.flatMap((p) => ["-i", p]), "-filter_complex", `${pngs.map((_, i) => `[${i}:v]scale=640:-2[s${i}]`).join(";")};${pngs.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${pngs.length}`, "-q:v", "3", join(out, "stills.jpg")]);
  console.log(`clip → ${join(dirArg, "out/clip.mp4")}　stills → ${join(dirArg, "out/stills.jpg")}（${at.map((t) => t.toFixed(2)).join(" / ")} 秒）`);
}

if (cmd === "init") await init();
else if (cmd === "copy") copy();
else if (cmd === "check") await check();
else if (cmd === "clip") clip();
else if (cmd === "render-check") renderMatches(join(DIR, "out/video.mp4"), +readFileSync(join(DIR, "index.html"), "utf8").match(/data-duration="([\d.]+)"/)[1]); // an existing render, after a new check
else die("usage: semtype.mjs init|copy|check|clip|render-check <dir> … | root");
