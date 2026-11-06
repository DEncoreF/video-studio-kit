// Semantic type helpers for HyperFrames (one paused GSAP timeline, seek-safe). Classic script: defines window.SemType.
// Extracted from the approved semantic titles of a product film (2026-10-21); see references/patterns.md for what each
// helper was first used for. Every motion is a tween on the timeline or an onUpdate that computes from tl.time(): no
// Math.random, timers or requestAnimationFrame, so any frame can be rendered on its own.
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  // Closed-form spring step response: a pure function of the time since the step (a little overshoot, then settles).
  const spring = (t, z = 0.8, f = 2.4) => {
    if (t <= 0) return 0;
    const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
  };
  const springy = (z = 0.62, f = 1.9) => (p) => (p >= 1 ? 1 : spring(p, z, f)); // as a GSAP ease
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const el = (tag, style, parent, html) => { const e = document.createElement(tag); if (style) Object.assign(e.style, style); if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

  // One inline-block span per character, so each glyph can move on its own; a space keeps its width.
  function splitChars(node) {
    if (node._semChars) return node._semChars;
    const chars = [...node.textContent]; node.textContent = "";
    if (getComputedStyle(node).position === "static") node.style.position = "relative";
    node._semChars = chars.map((ch) => el("span", { display: "inline-block", position: "relative", width: ch === " " ? "0.25em" : null }, node, ch === " " ? "&nbsp;" : ch));
    return node._semChars;
  }

  // The font's real metrics, in CSS px relative to the node's padding box: baseline, cap height (H), x-height (x), the
  // ink box of every character and of the whole line. Guides, frames and floors are placed on these, never on the em
  // box. Returns null until the font has loaded (call it inside an onUpdate: it is measured once, then cached).
  function metrics(node) {
    if (node._semMetrics) return node._semMetrics;
    const cs = getComputedStyle(node), font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!document.fonts.check(font, node.textContent || "A")) return null;
    const cx = document.createElement("canvas").getContext("2d"); cx.font = font;
    const px = parseFloat(cs.fontSize), H = cx.measureText("H"), fa = H.fontBoundingBoxAscent, fd = H.fontBoundingBoxDescent;
    const lh = parseFloat(cs.lineHeight) || fa + fd, pad = parseFloat(cs.paddingTop) || 0, padL = parseFloat(cs.paddingLeft) || 0;
    const baseline = pad + (lh - (fa + fd)) / 2 + fa;
    const spans = node._semChars ?? null, text = [...(node.textContent ?? "")];
    let x = padL; const ls = parseFloat(cs.letterSpacing) || 0;
    const chars = text.map((ch, i) => {
      const g = cx.measureText(ch), left = spans ? spans[i].offsetLeft : x;
      if (!spans) x += g.width + ls;
      return { ch, el: spans?.[i] ?? null, left: left - g.actualBoundingBoxLeft, right: left + g.actualBoundingBoxRight, top: baseline - g.actualBoundingBoxAscent, bottom: baseline + g.actualBoundingBoxDescent, advance: g.width };
    });
    const ink = chars.filter((c) => c.ch.trim()).reduce((a, c) => ({ left: Math.min(a.left, c.left), top: Math.min(a.top, c.top), right: Math.max(a.right, c.right), bottom: Math.max(a.bottom, c.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    return (node._semMetrics = { px, baseline, cap: baseline - H.actualBoundingBoxAscent, xHeight: baseline - cx.measureText("x").actualBoundingBoxAscent, ink, chars });
  }

  // Two clipped copies of one glyph (the halves of a door, a cut, a split), stacked on the original, which stays as the
  // invisible layout placeholder. axis "x" = left | right (hinges at the outer edges), "y" = top | bottom.
  function halves(ch, { axis = "x", at = 0.5, color } = {}) {
    const text = ch.textContent, c = color ?? getComputedStyle(ch).color, p = `${at * 100}%`, q = `${(1 - at) * 100}%`;
    ch.style.color = "transparent";
    const clipA = axis === "x" ? `inset(-15% ${q} -15% -15%)` : `inset(-15% -15% ${q} -15%)`, clipB = axis === "x" ? `inset(-15% -15% -15% ${p})` : `inset(${p} -15% -15% -15%)`;
    const mk = (clip, origin) => el("span", { position: "absolute", left: 0, top: 0, color: c, clipPath: clip, transformOrigin: origin, whiteSpace: "pre" }, ch, text);
    return axis === "x" ? [mk(clipA, "0% 50%"), mk(clipB, "100% 50%")] : [mk(clipA, "50% 0%"), mk(clipB, "50% 100%")];
  }

  // A hollow outline of the node's text with a solid copy on top, revealed from the bottom of the ink: set(level 0..1),
  // where 0 = empty and 1 = the top of the tallest glyph (measured, not the em box). `steps` fills in segments (a meter)
  // instead of continuously (a liquid). m() gives the measured metrics of the text (null until the font has loaded).
  function outlineFill(node, { stroke = 2, outline = "rgba(255,255,255,0.75)", steps = 0 } = {}) {
    const text = node.textContent; node.textContent = "";
    if (getComputedStyle(node).position === "static") node.style.position = "relative";
    const hollow = el("span", { color: "transparent", webkitTextStroke: `${stroke}px ${outline}` }, node, text);
    const solid = el("span", { position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" }, node, text);
    const m = () => metrics(solid);
    const set = (level) => {
      const l = steps ? Math.floor(clamp(level) * steps + 1e-6) / steps : clamp(level), M = m();
      if (l <= 0) { solid.style.visibility = "hidden"; return; }
      solid.style.visibility = "visible";
      solid.style.clipPath = M ? `inset(${(M.ink.bottom - l * (M.ink.bottom - M.ink.top)).toFixed(1)}px -10% -20% -10%)` : `inset(${(100 * (1 - l)).toFixed(2)}% -10% -20% -10%)`;
    };
    set(0);
    return { hollow, solid, set, m };
  }

  // A falling object lands with weight: drops from above (sharpening as it falls), squashes on contact, springs back.
  // Optional contact shadow (an element under the glyph) grows as it falls. Times in seconds on the timeline.
  function land(tl, ch, at, { from = -3, fall = 0.36, blur = 12, squash = 0.1, shadow = null } = {}) {
    tl.set(ch, { transformOrigin: "50% 92%" }, 0);
    tl.fromTo(ch, { y: `${from}em`, opacity: 0.3, filter: `blur(${blur}px)` }, { y: 0, opacity: 1, filter: "blur(0px)", duration: fall, ease: "power2.in" }, at - fall);
    tl.fromTo(ch, { scaleY: 1, scaleX: 1 }, { scaleY: 1 - squash, scaleX: 1 + squash / 2, duration: 0.06, ease: "power2.out", immediateRender: false }, at);
    tl.to(ch, { scaleY: 1, scaleX: 1, duration: 0.45, ease: "elastic.out(1, 0.45)" }, at + 0.06);
    if (shadow) tl.fromTo(shadow, { opacity: 0, scaleX: 0.3 }, { opacity: 1, scaleX: 1, duration: fall, ease: "power2.in" }, at - fall);
  }

  // Pressed down like a rubber stamp: from larger and above, hard ease, optional ring from the impact point.
  function stamp(tl, nodes, at, { from = 1.6, lift = -0.2, dur = 0.22, stagger = 0.04, ring = null } = {}) {
    tl.fromTo(nodes, { opacity: 0, scale: from, y: `${lift}em` }, { opacity: 1, scale: 1, y: 0, duration: dur, ease: "power4.out", stagger }, at);
    if (ring) { tl.set(ring, { opacity: 0 }, 0); tl.fromTo(ring, { scale: 0.3, opacity: 1 }, { scale: 3.2, opacity: 0, duration: 0.55, ease: "expo.out", immediateRender: false }, at + dur * 0.5); }
  }

  // A decaying shake after each impact (a thud you can feel): returns the offset in px for time t (add it in an onUpdate).
  const thud = (impacts, { amp = 6, decay = 16, freq = 75 } = {}) => (t) => impacts.reduce((acc, a, i) => { const r = t - a; return r < 0 ? acc : acc + (Array.isArray(amp) ? amp[i] : amp) * Math.exp(-r * decay) * Math.sin(r * freq); }, 0);

  // A tool writes the glyphs left to right: each glyph is revealed by a clip that follows a zigzag tip (chalk, pen,
  // brush). `tip` is an element moved to the writing point; returns the tip position function for particles.
  function writeOn(tl, node, chars, at, { per = 0.32, zig = 5, tip = null, tilt = -38 } = {}) {
    const N = chars.length, TOT = N * per;
    tl.set(chars, { clipPath: "inset(-10% 110% -10% -10%)" }, 0);
    const tipAt = (i, k) => { const ch = chars[i], z = Math.abs(((k * zig) % 2) - 1); return [ch.offsetLeft + ch.offsetWidth * k, ch.offsetTop + ch.offsetHeight * (0.16 + 0.68 * z)]; };
    const w = { k: 0 };
    tl.fromTo(w, { k: 0 }, { k: 1, duration: TOT, ease: "none", immediateRender: false, onUpdate: () => {
      const tt = w.k * TOT;
      chars.forEach((ch, i) => { const k = clamp((tt - i * per) / (per - 0.02)); ch.style.clipPath = `inset(-10% ${((1 - k) * 110).toFixed(1)}% -10% -10%)`; });
      if (tip) { const ci = Math.min(N - 1, Math.floor(tt / per)), kk = clamp((tt - ci * per) / (per - 0.02)), [x, y] = tipAt(ci, kk); gsap.set(tip, { x, y, rotation: tilt + 10 * Math.sin(tt * 30), opacity: tt < TOT ? 1 : 0 }); }
    } }, at);
    if (tip) tl.set(tip, { opacity: 0 }, 0);
    return { tipAt, end: at + TOT };
  }

  // A counter column that rolls from `from` to `to`, each number clicking into place (odometer).
  function roll(tl, node, at, { from = 1, to = 7, dur = 0.84 } = {}) {
    const n = to - from, back = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
    node.innerHTML = `<span style="display:inline-block;height:1em;overflow:hidden;vertical-align:top"><span style="display:block">${Array.from({ length: n + 1 }, (_, i) => `<span style="display:block;height:1em">${from + i}</span>`).join("")}</span></span>`;
    const col = node.firstChild.firstChild, r = { k: 0 };
    tl.fromTo(r, { k: 0 }, { k: n, duration: dur, ease: "power1.in", immediateRender: false, onUpdate: () => {
      const i = Math.floor(r.k), f = r.k - i; col.style.transform = `translateY(${-(i + (i >= n ? 0 : back(Math.min(1, f * 1.6))))}em)`;
    } }, at);
    return col;
  }

  // A seeded set of small DOM particles (dust, grit, chalk powder, sparks). `place(p, age)` returns {x, y, o} or null;
  // positions are computed from the timeline time only. Keep them inside the title's box plus a small margin.
  function particles(tl, parent, n, seed, at, life, place, { size = 3, color = "currentColor", round = true } = {}) {
    const r = rng(seed), P = Array.from({ length: n }, (_, i) => ({ i, a: r(), b: r(), c: r(), d: r(), el: el("span", { position: "absolute", left: 0, top: 0, width: `${size}px`, height: `${size}px`, borderRadius: round ? "50%" : "0", background: color, opacity: 0, pointerEvents: "none" }, parent) }));
    const k = { t: 0 };
    tl.fromTo(k, { t: 0 }, { t: life, duration: life, ease: "none", immediateRender: false, onUpdate: () => { for (const p of P) { const q = place(p, k.t); if (!q) { p.el.style.opacity = 0; continue; } gsap.set(p.el, { x: q.x, y: q.y, opacity: q.o ?? 1, scale: q.s ?? 1 }); } } }, at);
    tl.set(P.map((p) => p.el), { opacity: 0 }, 0); tl.set(P.map((p) => p.el), { opacity: 0 }, at + life);
    return P;
  }

  // SVG filters some materials need (url(#st-chalk) = grainy chalk edge). Added once per document.
  function filters() {
    if (document.getElementById("st-filters")) return;
    const s = el("div", { position: "absolute", width: 0, height: 0, overflow: "hidden" }, document.body, `<svg id="st-filters" width="0" height="0"><defs>
      <filter id="st-chalk" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.5 1.62" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="c"/><feDisplacementMap in="c" in2="n" scale="1.6"/></filter>
    </defs></svg>`);
    return s;
  }

  window.SemType = { clamp, lerp, smooth, spring, springy, rng, el, splitChars, metrics, halves, outlineFill, land, stamp, thud, writeOn, roll, particles, filters };
})();
