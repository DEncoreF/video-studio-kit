// Shared helpers for style previews (deterministic: seeded, no clock).
window.H = (() => {
  const rnd = (seed) => { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // Percent-based torn-paper polygon for any box; amp in % of the side.
  const torn = (seed, amp = 1.4, n = 28) => {
    const r = rnd(seed), p = [];
    for (let k = 0; k < n; k++) p.push(`${(100 * k) / n}% ${r() * amp * 2}%`);
    for (let k = 0; k < 8; k++) p.push(`${100 - r() * amp}% ${(100 * k) / 8}%`);
    for (let k = 0; k < n; k++) p.push(`${100 - (100 * k) / n}% ${100 - r() * amp * 2}%`);
    for (let k = 0; k < 8; k++) p.push(`${r() * amp}% ${100 - (100 * k) / 8}%`);
    return `polygon(${p.join(",")})`;
  };
  // Wobbly hand-drawn loop as an SVG path (for marker circles).
  const loop = (seed, cx, cy, rx, ry) => {
    const r = rnd(seed), pts = [];
    for (let k = 0; k <= 46; k++) { const a = -2 + (k / 40) * Math.PI * 2, w = 1 + (r() - 0.5) * 0.08 + k * 0.002; pts.push(`${(cx + Math.cos(a) * rx * w).toFixed(1)},${(cy + Math.sin(a) * ry * w).toFixed(1)}`); }
    return `M${pts.join(" L")}`;
  };
  const svgEl = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const noise = (freq, alpha, seed = 3) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.22 0 0 0 0 0.12 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;
  return { rnd, torn, loop, svgEl, noise, $: (s) => document.querySelector(s) };
})();
// DOM helper: el("div", {class, style, html}, parent)
window.H.el = (tag, props = {}, parent) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") Object.assign(e.style, v); else if (k === "html") e.innerHTML = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
};
// Wrap each character in spans (for per-char motion); spaces kept.
window.H.chars = (text) => [...text].map((c) => `<span class="ch">${c === " " ? "&nbsp;" : c}</span>`).join("");

// ---- Brand-safe building blocks. Styles own layout and motion; brand facts come from
// window.BRAND (brand.json via preview.mjs) and words from window.CONTENT — never hard-code them.

// Logo fitted into a box at its true aspect ratio (wide, square or tall logos all work).
// The wrapper is .brand-locked: it may enter and exit, but must hold still in between —
// no jitter, wobble, colour change, mask or distortion (brand.json "logo").
window.H.logo = (src, { x = 0, y = 0, w, h, align = "center" } = {}, parent) => {
  const box = window.H.el("div", { class: "brand-locked", style: { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` } }, parent);
  window.H.el("img", { src, style: { width: "100%", height: "100%", objectFit: "contain", objectPosition: align === "left" ? "left center" : align === "right" ? "right center" : "center", display: "block" } }, box);
  return box;
};

// Break copy into lines without knowing the words: honour explicit "\n", otherwise split at the
// space / punctuation closest to the middle until every line fits `max` characters (CJK = 1,
// a Latin word ≈ its letters ÷ 2). Returns an array of lines.
window.H.lines = (text, max = 8) => {
  const cjk = (c) => /[\u3000-\u9fff\uff00-\uffef]/.test(c ?? "");
  const len = (s) => [...s].reduce((n, c) => n + (cjk(c) ? 1 : 0.5), 0);
  const split = (s) => {
    if (len(s) <= max) return [s];
    const cs = [...s];
    // Prefer spaces and punctuation; otherwise any boundary between two CJK characters
    // (never inside a Latin word), and never leave a single orphan character.
    const soft = [], hard = [];
    // Word boundaries from the browser's dictionary segmenter, so CJK copy breaks between words.
    const words = new Set();
    if (typeof Intl !== "undefined" && Intl.Segmenter) { let n = 0; for (const w of new Intl.Segmenter("zh-Hant", { granularity: "word" }).segment(s)) { n += [...w.segment].length; words.add(n); } }
    cs.forEach((c, i) => { if (i === 0) return; if (/[ ，、。：；！？,]/.test(c)) soft.push(i); else if (cjk(c) && cjk(cs[i - 1]) && (!words.size || words.has(i))) hard.push(i); });
    const ok = (i) => len(cs.slice(0, i).join("")) >= 2 && len(cs.slice(i).join("").replace(/^[ ，、。：；！？,]/, "")) >= 2;
    const mid = len(s) / 2, at = (i) => Math.abs(len(cs.slice(0, i).join("")) - mid);
    const pick = (list) => list.filter(ok).sort((a, b) => at(a) - at(b))[0];
    const i = pick(soft.filter((k) => at(k) <= max / 2)) ?? pick(hard) ?? pick(soft);
    if (i == null) return [s];
    const keep = /[，、。：；！？,]/.test(cs[i]) ? 1 : 0, skip = cs[i] === " " ? 1 : keep;
    return [...split(cs.slice(0, i + keep).join("").trim()), ...split(cs.slice(i + skip).join("").trim())];
  };
  return String(text ?? "").split("\n").flatMap(split).filter(Boolean);
};
window.H.br = (text, max) => window.H.lines(text, max).join("<br>");

// Optional QR: CONTENT.QR = { image?, url?, label? } or null. Draws the supplied image, or a
// labelled placeholder frame when only the url is known. Returns null when the video has no QR.
window.H.qr = (C, { x, y, size }, parent) => {
  if (!C.QR) return null;
  const box = window.H.el("div", { class: "qr", style: { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, background: "#fff", padding: `${size * 0.06}px`, boxSizing: "border-box" } }, parent);
  if (C.QR.image) window.H.el("img", { src: C.QR.image, style: { width: "100%", height: "100%", display: "block" } }, box);
  else window.H.el("div", { text: "QR", style: { width: "100%", height: "100%", border: `${size * 0.03}px dashed #999`, display: "grid", placeItems: "center", font: `700 ${size * 0.18}px sans-serif`, color: "#999", boxSizing: "border-box" } }, box);
  if (C.QR.label) window.H.el("div", { text: C.QR.label, style: { position: "absolute", left: 0, right: 0, top: `${size + 8}px`, textAlign: "center", fontSize: `${Math.max(18, size * 0.1)}px`, fontWeight: 700 } }, box);
  return box;
};
