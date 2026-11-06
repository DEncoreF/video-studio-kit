// node scripts/measure/layout.mjs <dir> [--json out.json] [--step 0.25]
// Where things sit relative to each other, read from the composition (not the pixels): loads <dir>/index.html, seeks every --step
// seconds and, for the settled, visible, painted elements, checks two placements a viewer reads as "wrong" at once:
//   - asymmetric  a pair (exactly two visible elements of the same tag and class, same size within 5%, same height within 16 px,
//                 at least 100 px) that does not mirror about the frame's centre line: their midpoint is more than 24 px off x 960
//   - label-off   a label (a text run, or a thin rule ≤ 12 px wide) directly above or below a subject (a painted element ≥ 200 px,
//                 at most 60% of the frame wide, a label no wider than 1.1× the subject, within 240 px of its edge, its centre over the subject's span) whose centre is more
//                 than 16 px off the subject's centre
//   - text-overlap  two settled, visible things that carry words (a text run, or a painted box with text in it, at most 60% of the
//                 frame wide), neither inside the other, overlapping by more than 4% of the smaller one
//   - uneven-row  three or more of a kind (same tag and class, same height) in one row whose gaps differ by more than 4 px, or whose
//                 widths are meant to match (within 10%) but differ by more than 2%
//   - fill-variable   a unicode-range fill face cut from a variable font (it inks at the asked weight, not the main face's)
//   - glyph-fallback  a text element drawn partly in a loaded face (@font-face) and partly in a system font: the loaded face lacks those characters
//                 (read from Chrome's own font matching, CSS.getPlatformFontsForNode, once per text element)
// A subtree marked data-layout-free is skipped (a deliberate off-centre layout). Settled: the box is within 4 px 0.1 s before and after.
// Visible: effective opacity ≥ 0.15 and the element's centre is not covered by another painted layer (elementFromPoint).
// Why: an earlier film 2026-10-31, beat 03's end frame — the left machine's name and annotation line sat 66 px off the machine and
// the pair's midpoint 40 px right of centre; positions were hand-computed and nothing measured them. User: 「注意每顆鏡頭的物件、
// 文字、的位置是否合理，你應該有skill 在規範才對」.
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { openFilm } from "../lib/film-page.mjs";

const args = process.argv.slice(2), dir = resolve(args[0] ?? "."), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const step = +opt("step", "0.25"), out = opt("json");
export const LAYOUT = { pairTol: 24, labelTol: 16, pairMin: 100, subjectMin: 200, subjectMax: 1152, labelGap: 240, settle: 4, overlap: 0.04, rowGap: 4, rowSize: 0.02, rowMin: 40 };
// text-overlap, uneven-row, glyph-fallback — an earlier film 2026-11-01, beats 03–04: the two stacked names overlapped by 12 px, the
// six step cells were left at three sizes by a yoyo on a staggered tween, and 教 drew in a system face because Glow Sans TC has no
// U+6559; nothing measured them (user: 「教 這個字比其他字還細／兩個大標重疊了／6格間隔不一致」).
const film = await openFilm(dir, { webgl: false }), p = await film.open({ timeout: 10000, optional: true });
if (!p) {
  await film.close();
  if (out) writeFileSync(out, JSON.stringify({ skipped: "no window.__timelines", findings: [] }));
  console.log("layout: 沒有 window.__timelines，略過"); process.exit(0);
}
await p.addStyleTag({ content: "*{pointer-events:auto !important}" });
const dur = await p.evaluate(() => { const r = document.querySelector("[data-composition-id]"); return +(r?.getAttribute("data-duration") || Object.values(window.__timelines)[0].duration()); });

// every visible, painted element (or text run) with its box; ids are stable paths so two probes can be matched
const probe = (t) => p.evaluate(({ t, L }) => {
  Object.values(window.__timelines)[0].seek(t, false);
  const W = innerWidth, H = innerHeight;
  const opa = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= +cs.opacity; } return o; };
  const paints = (e) => { const cs = getComputedStyle(e); return /^(IMG|svg|CANVAS|VIDEO)$/i.test(e.tagName) || cs.backgroundImage !== "none" || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor); };
  const seen = (el, r) => { const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const hs = document.elementsFromPoint(x, y);
    for (const h of hs) { if (h === el || el.contains(h) || h.contains(el)) return true;
      if (/^svg$/i.test(h.tagName) && !hs.some((q) => q !== h && h.contains(q))) continue;   // an <svg> box hides only where its shapes paint (a stroke-only frame over a panel)
      if (opa(h) >= 0.15 && paints(h)) return false; }
    return false; };
  const path = (e) => { const s = []; for (; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) s.unshift(e.tagName + ":" + [...e.parentElement.children].indexOf(e)); return s.join("/"); };
  const rec = (e, r, text, rule) => ({ id: path(e), sel: name(e), kind: e.tagName + "|" + (e.getAttribute("class") || ""), text, rule, words: text || !!e.textContent.trim(), kin: e.getAttribute("class") ? document.getElementsByClassName(e.getAttribute("class")).length : 0,
    x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), anc: (() => { const a = []; for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) a.push(path(q)); return a; })() });
  const name = (e) => e.id ? "#" + e.id : e.getAttribute("class") ? "." + e.getAttribute("class").trim().split(/\s+/).join(".") : e.tagName.toLowerCase();
  const items = [], lines = new Map();
  const inlineLevel = (e) => /^inline/.test(getComputedStyle(e).display);
  for (const e of document.querySelectorAll("body *")) {
    if (/^(SCRIPT|STYLE|path|rect|circle|g|line|polyline|polygon)$/i.test(e.tagName) || e.closest("[data-layout-free]") || opa(e) < 0.15) continue;
    const direct = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (direct.length && !paints(e)) {   // a text run belongs to its line: the first block-level ancestor (per-character spans are one line)
      let blk = e; while (blk.parentElement && blk.parentElement !== document.body && inlineLevel(blk)) blk = blk.parentElement;
      const R = direct.flatMap((n) => { const g = document.createRange(); g.selectNodeContents(n); return [...g.getClientRects()]; }).filter((q) => q.width > 1);
      if (!R.length || !R.some((q) => seen(e, q))) continue;
      const L = lines.get(blk) ?? { e: blk, R: [] }; L.R.push(...R); lines.set(blk, L);
      continue;
    }
    if (!paints(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.width * r.height > 0.6 * W * H || r.left + r.width <= 0 || r.top + r.height <= 0 || r.left >= W || r.top >= H) continue;
    if (!seen(e, r)) continue;
    items.push(rec(e, r, direct.length > 0, !direct.length && r.width <= 12 && r.height >= 20));
  }
  for (const { e, R } of lines.values()) {
    const x0 = Math.min(...R.map((q) => q.left)), y0 = Math.min(...R.map((q) => q.top)), x1 = Math.max(...R.map((q) => q.right)), y1 = Math.max(...R.map((q) => q.bottom));
    items.push(rec(e, { left: x0, top: y0, width: x1 - x0, height: y1 - y0 }, true, false));
  }
  return items;
}, { t, L: LAYOUT });

const cx = (r) => r.x + r.w / 2, cy = (r) => r.y + r.h / 2;
const findings = [], key = new Set();
const once = (f, k) => { if (key.has(k)) return; key.add(k); findings.push(f); };
for (let t = 0; t <= dur - 0.05 + 1e-9; t += step) {
  // settled: the same box 0.1 s before and after (one-sided, the top of a quick pop read as settled)
  const a = await probe(t), n = new Map((await probe(Math.min(dur - 0.01, t + 0.1))).map((r) => [r.id, r])), b0 = new Map((await probe(Math.max(0, t - 0.1))).map((r) => [r.id, r]));
  const same = (q, r, k = 1) => q && Math.abs(q.x - r.x) + Math.abs(q.y - r.y) + Math.abs(q.w - r.w) <= k * LAYOUT.settle;
  const S = a.filter((r) => same(n.get(r.id), r) && same(b0.get(r.id), r));
  const slow = a.filter((r) => same(n.get(r.id), r, 2) && same(b0.get(r.id), r, 2));   // rows: a cell left drifting back from a pop is still a wrong row
  const T = +t.toFixed(2), related = (u, v) => u.anc.includes(v.id) || v.anc.includes(u.id);
  // pairs: exactly two of a kind, same size and height → they should mirror about the centre line
  const groups = {};
  for (const r of S) if (!r.text && r.w >= LAYOUT.pairMin && r.h >= LAYOUT.pairMin) (groups[r.kind] ??= []).push(r);
  for (const g of Object.values(groups)) {
    if (g.length !== 2 || g[0].kin !== 2) continue;   // a pair is two of a kind in the whole film, not two lit cells of a row of six
    const [u, v] = g;
    const inFrame = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1920 && r.y + r.h <= 1080;   // a pair cut by the frame (a push-in) is not a layout
    if (!inFrame(u) || !inFrame(v)) continue;
    if (related(u, v) || Math.abs(u.w - v.w) > 0.05 * Math.max(u.w, v.w) || Math.abs(u.h - v.h) > 0.05 * Math.max(u.h, v.h) || Math.abs(cy(u) - cy(v)) > 16) continue;
    const off = (cx(u) + cx(v)) / 2 - 960;
    if (Math.abs(off) > LAYOUT.pairTol) once({ kind: "asymmetric", t: T, sel: `${u.sel}`, centres: [Math.round(cx(u)), Math.round(cx(v))], off: Math.round(off) }, `a|${u.kind}`);
  }
  // labels over (or under) a subject → centred on it
  const subjects = S.filter((r) => !r.text && !r.rule && r.w >= LAYOUT.subjectMin && r.h >= LAYOUT.subjectMin && r.w <= LAYOUT.subjectMax);
  for (const l of S.filter((r) => r.text || r.rule)) {
    let best = null;
    for (const s of subjects) {
      if (related(l, s) || l.w > 1.1 * s.w || cx(l) < s.x || cx(l) > s.x + s.w) continue;
      const gap = l.y + l.h <= s.y + 1 ? s.y - (l.y + l.h) : l.y >= s.y + s.h - 1 ? l.y - (s.y + s.h) : -1;
      if (gap < 0 || gap > LAYOUT.labelGap) continue;
      if (!best || gap < best.gap) best = { s, gap };
    }
    if (!best) continue;
    const off = cx(l) - cx(best.s);
    if (Math.abs(off) > LAYOUT.labelTol) once({ kind: "label-off", t: T, sel: l.sel, subject: best.s.sel, off: Math.round(off), centres: [Math.round(cx(l)), Math.round(cx(best.s))] }, `l|${l.id}|${best.s.id}`);
  }
  // words on words: two things that carry text, neither inside the other, overlapping
  const W = S.filter((r) => r.words && r.w <= LAYOUT.subjectMax && r.w * r.h > 0);
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
    const u = W[i], v = W[j]; if (related(u, v)) continue;
    const ix = Math.min(u.x + u.w, v.x + v.w) - Math.max(u.x, v.x), iy = Math.min(u.y + u.h, v.y + v.h) - Math.max(u.y, v.y);
    if (ix <= 0 || iy <= 0 || ix * iy <= LAYOUT.overlap * Math.min(u.w * u.h, v.w * v.h)) continue;
    once({ kind: "text-overlap", t: T, sel: u.sel, other: v.sel, px: [Math.round(ix), Math.round(iy)] }, `o|${[u.id, v.id].sort().join("|")}`);
  }
  // a row of the same thing: equal gaps, and equal widths when they are meant to match
  const R = {};
  for (const r of slow) if (!r.text && !r.rule && r.w >= LAYOUT.rowMin && r.h >= LAYOUT.rowMin) (R[r.kind] ??= []).push(r);
  for (const g of Object.values(R)) {
    const rows = [];
    for (const r of g) { const row = rows.find((q) => Math.abs(cy(q[0]) - cy(r)) <= 4 && Math.abs(q[0].h - r.h) <= 0.1 * r.h); row ? row.push(r) : rows.push([r]); }
    for (const row of rows) {
      if (row.length < 3 || !row[0].kin || row.length !== row[0].kin) continue;   // the whole set, settled: cells still popping in leave gaps that are not spacing
      row.sort((a, b) => a.x - b.x);
      const gaps = row.slice(1).map((r, k) => r.x - (row[k].x + row[k].w)), ws = row.map((r) => r.w);
      if (gaps.some((q) => q < 0)) continue;
      const gs = Math.max(...gaps) - Math.min(...gaps), wmax = Math.max(...ws), wmin = Math.min(...ws);
      const uneven = gs > LAYOUT.rowGap || (wmax <= 1.1 * wmin && wmax - wmin > LAYOUT.rowSize * wmax);
      if (uneven) once({ kind: "uneven-row", t: T, sel: row[0].sel, n: row.length, gaps: gaps.map(Math.round), widths: ws.map(Math.round) }, `u|${row[0].kind}`);
    }
  }
}
// glyph fallback: which fonts Chrome actually drew each text element with; a system face means the loaded one lacks a character.
// The fonts do not depend on time, and seeking while the CSS domain is enabled hangs the page, so: no seek — every element is made
// laid out (display revert, so a display:none subtree is measured too) and each one is read once.
const texts = await p.evaluate(() => { const out = []; let i = 0;
  for (const e of document.querySelectorAll("body *")) { if (/^(SCRIPT|STYLE)$/.test(e.tagName)) continue;
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { e.setAttribute("data-gly", i++); out.push(e.textContent.trim().slice(0, 24)); } }
  const st = document.createElement("style"); st.textContent = "body *:not(script):not(style)[style*='display: none'], body *:not(script):not(style) { display: revert !important; }"; document.head.append(st);
  return out; });
const cdp = await p.context().newCDPSession(p);
await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-gly]" });
const gly = new Map();
for (const [k, id] of nodeIds.entries()) {
  const k2 = +((await cdp.send("DOM.getAttributes", { nodeId: id })).attributes.find((a, n, A) => A[n - 1] === "data-gly") ?? k);
  const r = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: id }).catch(() => ({ fonts: [] }));
  if (!r.fonts.some((f) => f.isCustomFont)) continue;   // a deliberate system face throughout is a choice; a loaded face that hands some characters to the system is a gap
  for (const f of r.fonts) if (!f.isCustomFont && !gly.has(`${k2}|${f.familyName}`)) gly.set(`${k2}|${f.familyName}`, { kind: "glyph-fallback", t: 0, text: texts[k2], font: f.familyName, glyphs: f.glyphCount });
}
findings.push(...gly.values());
// fill-variable: a unicode-range face (a fill for characters the main face lacks) cut from a variable font draws at the weight asked
// for, not at the weight the main face looks — Glow Sans TC "Medium" says 600 but inks like Noto Sans TC 450, so 教 drew heavier than
// its neighbours (an earlier film 2026-11-01, user: 「副標有個字的字體和其他字不一樣」). A fill has to be a static instance matched by ink.
const fills = await p.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
  .filter((r) => r instanceof CSSFontFaceRule && r.style.getPropertyValue("unicode-range"))
  .map((r) => ({ family: r.style.getPropertyValue("font-family").replace(/["']/g, ""), url: new URL((r.style.getPropertyValue("src").match(/url\(["']?([^"')]+)/) || [])[1] || "", location.href).pathname })));
for (const f of fills) {
  let buf; try { buf = readFileSync(join(dir, decodeURIComponent(f.url))); } catch { continue; }
  const sig = buf.toString("latin1", 0, 4); if (sig !== "\0\x01\0\0" && sig !== "OTTO" && sig !== "true") continue;   // woff/woff2 are compressed: not read
  const tables = new Set(Array.from({ length: buf.readUInt16BE(4) }, (_, i) => buf.toString("latin1", 12 + 16 * i, 16 + 16 * i)));
  if (tables.has("fvar")) findings.push({ kind: "fill-variable", t: 0, family: f.family, file: f.url.split("/").pop() });
}
await film.close();
const res = { step, duration: dur, ...LAYOUT, findings };
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
const say = (f) => ({
  "asymmetric": () => `${f.t} 秒 成對的 ${f.sel} 沒有以中線對稱：中心 ${f.centres.join("、")}，中點偏 ${f.off} px`,
  "label-off": () => `${f.t} 秒 標籤 ${f.sel} 沒有對準它的主體 ${f.subject}：中心 ${f.centres.join(" vs ")}，差 ${f.off} px`,
  "text-overlap": () => `${f.t} 秒 ${f.sel} 和 ${f.other} 重疊 ${f.px.join("×")} px`,
  "uneven-row": () => `${f.t} 秒 一排 ${f.n} 個 ${f.sel} 不等距或不等大：間距 ${f.gaps.join("、")}，寬 ${f.widths.join("、")}`,
  "glyph-fallback": () => `「${f.text}」有 ${f.glyphs} 個字用系統字型 ${f.font} 畫（載入的字型缺字）`,
  "fill-variable": () => `補字字型 ${f.family}（${f.file}）是可變字型：會照要求的字重畫，不是照主字型看起來的粗細`,
})[f.kind]();
for (const f of findings) console.log(`✗ ${say(f)}`);
console.log(`layout: 問題 ${findings.length} 項`);
