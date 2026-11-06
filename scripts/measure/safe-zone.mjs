// node scripts/measure/safe-zone.mjs <dir> [--json out.json] [--step 0.5]
// Where the words and the logo sit, read from the composition itself (not the pixels): loads <dir>/index.html, seeks every
// --step seconds, and for every visible text run and every logo image records its box. Safe boxes are the hyperframes skill's
// "Keep it editable" (Premiere defaults): action-safe = 5% inset on every edge, title-safe = 10%.
//   - a text run that is fully on screen but reaches into the outer 5%      → action  (review-pack FAIL safe-zone)
//   - a text run that is fully on screen, inside action-safe, outside 10%  → title   (review-pack WARN safe-title)
//   - a text run cut by the frame edge is a deliberate bleed (Google Vids close-ups) and is not counted
//   - a logo (img/svg whose id, class or src says logo, or a Kestrel/NovaMind brand file) must sit inside action-safe and, once it
//     is fully in, never move or resize                                    → logo    (review-pack FAIL logo-moved / safe-zone)
// A run that moves more than 12 px in the next 0.05 s is in flight (whip, push-through) and is skipped: only settled words count.
// Visibility: effective opacity ≥ 0.15, not visibility:hidden, and the run's centre is not clipped away (elementFromPoint).
// Why: an earlier film 2026-10-29 — the label sat at x 96 (outside title-safe) and frame lines ran behind the logo; nothing
// measured it. User: 「我覺得你要有一個規矩，logo 在哪？主畫面要在哪？」
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { openFilm } from "../lib/film-page.mjs";

const args = process.argv.slice(2), dir = resolve(args[0] ?? "."), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const step = +opt("step", "0.5"), out = opt("json");
const film = await openFilm(dir, { webgl: false }), p = await film.open({ timeout: 10000, optional: true });
if (!p) {   // not a seekable composition (a fixture, a static page): nothing to measure, say so and leave
  await film.close();
  if (out) writeFileSync(out, JSON.stringify({ skipped: "no window.__timelines", findings: [] }));
  console.log("safe-zone: 沒有 window.__timelines，略過"); process.exit(0);
}
// visibility is tested with elementFromPoint: overlays with pointer-events:none (HUD layers) would be skipped, so make everything hittable
await p.addStyleTag({ content: "*{pointer-events:auto !important}" });
const dur = await p.evaluate(() => { const r = document.querySelector("[data-composition-id]"); return +(r?.getAttribute("data-duration") || Object.values(window.__timelines)[0].duration()); });

const samples = [];
// a run that is still flying (moves > 12 px in the next 0.05 s: a whip, a push-through) is not a readable state — only settled words count
const probe = async (t) => p.evaluate((t) => {
    Object.values(window.__timelines)[0].seek(t, false);
    const W = innerWidth, H = innerHeight;
    const opa = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= +cs.opacity; } return o; };
    // walk the hit stack from the top: transparent layers (a fade sheet at opacity 0, an empty wrapper) don't hide anything;
    // the first painted, visible thing that isn't this text's own element covers it. Clipped-away text is not in the stack at all.
    const paints = (e) => { const cs = getComputedStyle(e); return /^(IMG|svg|CANVAS|VIDEO)$/i.test(e.tagName) || cs.backgroundImage !== "none" || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor); };
    const seen = (el, r) => { const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x >= W || y >= H) return true;
      for (const h of document.elementsFromPoint(x, y)) { if (h === el || el.contains(h) || h.contains(el)) return true; if (h.closest?.("#cursor,[data-cursor]") || h.id === "ripple") continue; if (opa(h) >= 0.15 && paints(h)) return false; }
      return false; };
    const texts = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.textContent.trim() ? 1 : 2 });
    for (let n; (n = tw.nextNode()); ) {
      const el = n.parentElement; if (!el || el.closest("script,style,svg") || opa(el) < 0.15) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
        if (!seen(el, r)) continue;
        texts.push({ text: n.textContent.trim().slice(0, 24), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), sel: el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase() });
      }
    }
    const logos = [...document.querySelectorAll("img,svg")].filter((e) => /logo/i.test(e.id + " " + (e.getAttribute("class") || "") + " " + (e.getAttribute("src") || "")) || /(kestrel|novamind)[-\w]*\.svg/i.test(e.getAttribute("src") || ""))
      .map((e) => { const r = e.getBoundingClientRect(); return { sel: e.id ? "#" + e.id : e.getAttribute("src"), o: +opa(e).toFixed(2), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })
      .filter((l) => l.o >= 0.15 && l.w > 1);
    return { t: +t.toFixed(2), texts, logos };
  }, t);
for (let t = 0; t <= dur - 0.05 + 1e-9; t += step) {
  const s = await probe(t), n = await probe(Math.min(dur - 0.01, t + 0.05)), key = (r) => `${r.sel}|${r.text}`;
  const next = new Map(n.texts.map((r) => [key(r), r]));
  s.texts = s.texts.filter((r) => { const q = next.get(key(r)); return !!q && Math.hypot(q.x - r.x, q.y - r.y) + Math.abs(q.w - r.w) <= 12; });   // gone 0.05 s later = leaving, not read
  s.t = +t.toFixed(2);
  samples.push(s);
}
await film.close();

const W = 1920, H = 1080, A = { x: W * 0.05, y: H * 0.05 }, T = { x: W * 0.1, y: H * 0.1 };
const inBox = (r, m) => r.x >= m.x - 0.5 && r.y >= m.y - 0.5 && r.x + r.w <= W - m.x + 0.5 && r.y + r.h <= H - m.y + 0.5;
const onScreen = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
const findings = [], key = new Set();
const once = (f) => { const k = `${f.kind}|${f.sel}|${f.text ?? ""}`; if (key.has(k)) return; key.add(k); findings.push(f); };
for (const s of samples) for (const r of s.texts) {
  if (!onScreen(r)) continue;   // cut by the frame edge: a deliberate bleed
  if (!inBox(r, A)) once({ kind: "action", t: s.t, sel: r.sel, text: r.text, box: [r.x, r.y, r.w, r.h] });
  else if (!inBox(r, T)) once({ kind: "title", t: s.t, sel: r.sel, text: r.text, box: [r.x, r.y, r.w, r.h] });
}
const bySel = {};
for (const s of samples) for (const l of s.logos) (bySel[l.sel] ??= []).push({ t: s.t, ...l });
for (const [sel, L] of Object.entries(bySel)) {
  const full = L.filter((l) => l.o >= 0.98);
  for (const l of full) if (!inBox(l, A)) { once({ kind: "logo-out", t: l.t, sel, box: [l.x, l.y, l.w, l.h] }); break; }
  const ref = full[0];
  const moved = ref && full.find((l) => Math.abs(l.x - ref.x) > 2 || Math.abs(l.y - ref.y) > 2 || Math.abs(l.w - ref.w) > 2);
  if (moved) once({ kind: "logo-moved", t: moved.t, sel, from: [ref.x, ref.y, ref.w], to: [moved.x, moved.y, moved.w] });
}
const res = { step, duration: dur, action: A, title: T, logos: Object.keys(bySel), texts: samples.reduce((n, s) => n + s.texts.length, 0), findings };
if (args.includes("--debug")) console.log(JSON.stringify(samples.filter((s, i) => i % 6 === 0).map((s) => [s.t, s.texts.slice(0, 4)])));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
const say = { action: "字進到畫面外圈 5%（action-safe 外）", title: "字在 title-safe（10%）外", "logo-out": "Logo 在 action-safe 外", "logo-moved": "Logo 進場後移動或縮放" };
for (const f of findings) console.log(`${f.kind === "title" ? "△" : "✗"} ${f.t} 秒 ${say[f.kind]}：${f.sel}${f.text ? `「${f.text}」` : ""} ${JSON.stringify(f.box ?? [f.from, f.to])}`);
console.log(`safe-zone: ${samples.length} 個取樣、Logo ${Object.keys(bySel).length} 個、問題 ${findings.length} 項`);
