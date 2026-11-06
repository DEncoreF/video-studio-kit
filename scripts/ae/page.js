// Runs inside the film's page (injected by scripts/ae-export.mjs). It finds every element the film's GSAP timeline moves,
// samples them frame by frame — each element's full 2D matrix (CSS transforms of the whole ancestor chain, measured on a
// transform-free layout), its effective opacity, blur, clip shapes and look — and turns the samples into After Effects layer
// values: parented layers whose Position / Scale / Rotation / Opacity keys, masks and blur effects reproduce the frame.
// Everything is a function of timeline time (the film seeks), so the samples are exact.
(() => {
  const AE = {};
  const root = document.querySelector("[data-composition-id]");
  const tl = Object.values(window.__timelines)[0];
  const FPS = +(root.dataset.fps || 60), DUR = +root.dataset.duration, NF = Math.round(DUR * FPS);
  const W = +(root.dataset.width || 1920), H = +(root.dataset.height || 1080);
  AE.info = { FPS, DUR, NF, W, H, name: root.dataset.compositionId };

  // ---- 2D affine matrices [a, b, c, d, e, f] (CSS matrix order) ----
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const inv = (m) => { const det = m[0] * m[3] - m[1] * m[2] || 1e-12, a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]; };
  const T = (x, y) => [1, 0, 0, 1, x, y], S = (x, y) => [x, 0, 0, y, 0, 0];
  const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  const apv = (m, p) => [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]];
  const parseM = (s) => { if (!s || s === "none") return I; const v = s.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
    return s.startsWith("matrix3d") ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v.slice(0, 6); };
  AE.mat = { I, mul, inv, T, S, ap, apv };

  // ---- discovery: the layers ----
  const SKIP = new Set(["SCRIPT", "STYLE", "AUDIO", "VIDEO", "TEMPLATE", "LINK", "META", "TITLE"]);
  const isDefsSvg = (e) => e.tagName.toLowerCase() === "svg" && (e.getAttribute("width") === "0" || [...e.children].every((c) => ["filter", "defs"].includes(c.tagName.toLowerCase())));
  let nodes = [], nodeIndex = new Map(), chain = [], chainIndex = new Map(), seqSet = new Set();
  AE.discover = () => {
    const targ = new Set();
    tl.getChildren(true, true, false).forEach((tw) => (tw.targets ? tw.targets() : []).forEach((t) => { if (t instanceof Element && root.contains(t)) targ.add(t); }));
    const outerSvg = (e) => { let s = e.ownerSVGElement; while (s && s.ownerSVGElement) s = s.ownerSVGElement; return s; };
    for (const t of [...targ]) {
      if (t.closest("filter")) { targ.delete(t); continue; }                       // blur primitives: read as blur sources
      if (t instanceof SVGElement && t.ownerSVGElement) { targ.delete(t); const s = outerSvg(t); if (s) seqSet.add(s); }   // animated SVG drawing → image sequence
    }
    // every visual child of the composition root and of its scene hosts is a layer too (paint order, static overlays)
    for (const c of root.children) { if (SKIP.has(c.tagName)) continue; targ.add(c); for (const d of c.children) if (!SKIP.has(d.tagName) && !isDefsSvg(d)) targ.add(d); }
    for (const t of [...targ]) if (isDefsSvg(t) || SKIP.has(t.tagName)) targ.delete(t);
    // an element under a CSS mask-image is drawn as an image sequence of that masked element
    const maskedAncestor = (e) => { for (let x = e; x && x !== root; x = x.parentElement) { const cs = getComputedStyle(x);
      if ((cs.webkitMaskImage && cs.webkitMaskImage !== "none") || (cs.maskImage && cs.maskImage !== "none")) return x; } return null; };
    for (const t of [...targ, ...seqSet]) { const m = maskedAncestor(t); if (m) seqSet.add(m); }
    const inSeq = (e) => [...seqSet].some((s) => s !== e && s.contains(e));
    for (const s of [...seqSet]) if (inSeq(s)) seqSet.delete(s);
    for (const t of [...targ]) if (inSeq(t) || seqSet.has(t)) targ.delete(t);
    const all = [...targ, ...seqSet];
    all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    nodes = all.map((el, i) => ({ i, el, seq: seqSet.has(el) }));
    nodes.forEach((n) => nodeIndex.set(n.el, n.i));
    nodes.forEach((n) => { let p = n.el.parentElement; while (p && p !== root && !nodeIndex.has(p)) p = p.parentElement;
      n.parent = p && p !== root ? nodeIndex.get(p) : -1; });
    // the elements whose layout, transform, opacity, filter or clip feed some layer: the nodes and all their ancestors
    const cs = new Set([root]); nodes.forEach((n) => { for (let x = n.el; x && x !== root; x = x.parentElement) cs.add(x); });
    chain = [...cs]; chain.sort((a, b) => (a === b ? 0 : a.contains(b) ? -1 : b.contains(a) ? 1 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)));
    chain.forEach((e, i) => chainIndex.set(e, i));
    nodes.forEach((n) => { n.ci = chainIndex.get(n.el); });
    // names
    const used = new Map();
    nodes.forEach((n) => { const e = n.el; let nm = e.id || (e.className && typeof e.className === "string" ? e.tagName.toLowerCase() + "." + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase());
      const txt = (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 18); if (!e.id && txt) nm += " " + txt;
      const k = used.get(nm) || 0; used.set(nm, k + 1); n.name = k ? `${nm} ${k + 1}` : nm; });
    // paint order (back to front), after CSS stacking: a stacking context (a positioned element with a z-index) sorts its
    // descendants by z-index — elements that are not contexts themselves are flattened into it, so a z-indexed card inside a
    // plain wrapper competes with the wrapper's siblings — negative z behind the context's own paint, the rest in tree order
    const isCtx = (e) => { if (seqSet.has(e)) return true; const s = getComputedStyle(e); return s.position !== "static" && s.zIndex !== "auto"; };
    const zOf = (e) => { const z = parseInt(getComputedStyle(e).zIndex, 10); return Number.isNaN(z) ? 0 : z; };
    const order = [];
    const visit = (ctx) => {
      if (seqSet.has(ctx)) { order.push(nodeIndex.get(ctx)); return; }
      const items = []; let t = 0;
      const collect = (e) => { for (const k of e.children) { if (SKIP.has(k.tagName)) continue;
        if (isCtx(k)) items.push({ el: k, z: zOf(k), t: t++, ctx: true });
        else { if (nodeIndex.has(k)) items.push({ el: k, z: 0, t: t++, ctx: false }); collect(k); } } };
      collect(ctx);
      items.sort((a, b) => a.z - b.z || a.t - b.t);
      const emit = (it) => { if (it.ctx) visit(it.el); else order.push(nodeIndex.get(it.el)); };
      items.filter((it) => it.z < 0).forEach(emit);
      if (nodeIndex.has(ctx)) order.push(nodeIndex.get(ctx));
      items.filter((it) => it.z >= 0).forEach(emit);
    };
    visit(root);
    AE.order = order;
    return { nodes: nodes.length, seq: seqSet.size, chain: chain.length };
  };

  // ---- painting: does an element (with the static content it carries) put pixels on screen? ----
  const alpha = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return c && c !== "transparent" ? 1 : 0; const v = m[1].split(/[ ,/]+/).filter(Boolean); return v.length > 3 ? +v[3] : 1; };
  const paints = (e) => { const s = getComputedStyle(e);
    if (alpha(s.backgroundColor) > 0 || s.backgroundImage !== "none" || s.boxShadow !== "none" || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0)) return true;
    if (["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0)) return true;
    if (["IMG", "CANVAS", "VIDEO"].includes(e.tagName) || e instanceof SVGSVGElement) return true;
    for (const ps of ["::before", "::after"]) { const p = getComputedStyle(e, ps); if (p.content && p.content !== "none" && p.content !== "normal") return true; }
    for (const c of e.childNodes) if (c.nodeType === 3 && c.textContent.trim()) return true;
    return false; };
  const staticWalk = (e, fn) => { fn(e); for (const c of e.children) if (!nodeIndex.has(c) && !SKIP.has(c.tagName)) staticWalk(c, fn); };
  const hasPaint = (e) => { let p = false; staticWalk(e, (x) => { if (!p && paints(x)) p = true; }); return p; };
  const ownText = (e) => { let t = ""; const rec = (x) => { for (const c of x.childNodes) { if (c.nodeType === 3) t += c.textContent; else if (c.nodeType === 1 && !nodeIndex.has(c)) rec(c); } }; rec(e); return t; };

  // ---- clip shapes, in the element's own (border-box) coordinates: {v, it, ot} with optional rounded corners ----
  const calc = (expr, pct) => { // px / % / calc(), % against pct
    const js = expr.replace(/calc/g, "").replace(/(-?[\d.]+(?:e-?\d+)?)px/g, "($1)").replace(/(-?[\d.]+(?:e-?\d+)?)%/g, `($1*${pct}/100)`);
    try { return Function(`return (${js});`)(); } catch { return parseFloat(expr) || 0; } };
  const splitTop = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const splitSp = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === " " && d === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch; } if (cur) out.push(cur); return out; };
  const K = 0.5523;
  const rrect = (x0, y0, x1, y1, r) => { r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
    if (r < 0.5) return { v: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], it: [[0, 0], [0, 0], [0, 0], [0, 0]], ot: [[0, 0], [0, 0], [0, 0], [0, 0]] };
    const k = r * K;
    return { v: [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]],
      it: [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]], ot: [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]] }; };
  const clipShape = (str, w, h) => {
    if (!str || str === "none") return null;
    let m = str.match(/^inset\((.*)\)$/);
    if (m) { const [box, rnd] = m[1].split(/\s+round\s+/); const p = splitSp(box.trim()); const q = [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
      const t = calc(q[0], h), r = calc(q[1], w), b = calc(q[2], h), l = calc(q[3], w), rad = rnd ? calc(splitSp(rnd.trim())[0], Math.min(w, h)) : 0;
      return rrect(l, t, w - r, h - b, rad); }
    m = str.match(/^polygon\((.*)\)$/);
    if (m) { const pts = splitTop(m[1].replace(/^(nonzero|evenodd),/, "")).map((pt) => { const [x, y] = splitSp(pt); return [calc(x, w), calc(y, h)]; });
      return { v: pts, it: pts.map(() => [0, 0]), ot: pts.map(() => [0, 0]) }; }
    return null; };

  // ---- sampling ----
  let ST = null;
  const style = document.createElement("style");
  style.textContent = ".ae-m, .ae-m * { transform: none !important; translate: none !important; rotate: none !important; scale: none !important; }";
  document.head.appendChild(style);
  AE.alloc = () => {
    tl.seek(0.02, false);   // a paused timeline that has not moved yet has not rendered its time-0 sets: move it once
    const N = nodes.length;
    ST = { G: new Float64Array(NF * N * 6), X: new Float64Array(NF * N * 6), WH: new Float32Array(NF * N * 2), OP: new Float32Array(NF * N), BL: new Float32Array(NF * N * 2),
      SIG: new Int32Array(NF * N), TX: new Int32Array(NF * N), sigs: [], sigMap: new Map(), txts: [], txtMap: new Map(), clip: new Map(), ovf: new Map(), O: new Float32Array(NF * N * 2) };
    nodes.forEach((n) => { n.texts = []; const rec = (x) => { for (const c of x.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) n.texts.push(c); else if (c.nodeType === 1 && !nodeIndex.has(c)) rec(c); } }; rec(n.el); });
    // clip sources: elements of the chain with a clip-path at some time, or with overflow clipping that carry layers inside
    chain.forEach((e, ci) => { if (e === root || e === root.parentElement) return; const s = getComputedStyle(e);
      if (s.overflow !== "visible" && nodes.some((n) => n.el !== e && e.contains(n.el))) ST.ovf.set(ci, true); });
  };
  const filterBlur = (f) => { // sum of url(#id) Gaussian blurs on one element → [sx, sy]
    if (!f || f === "none") return [0, 0]; let sx = 0, sy = 0;
    for (const m of f.matchAll(/url\("?#([^")]+)"?\)/g)) { const fe = document.getElementById(m[1]); const g = fe && fe.querySelector("feGaussianBlur");
      if (g) { const v = (g.getAttribute("stdDeviation") || "0").trim().split(/[\s,]+/).map(Number); sx += (v[0] || 0) ** 2; sy += (v.length > 1 ? v[1] : v[0] || 0) ** 2; } }
    for (const m of f.matchAll(/blur\(([\d.]+)px\)/g)) { sx += (+m[1]) ** 2; sy += (+m[1]) ** 2; }
    return [sx, sy]; };
  AE.sample = (f0, f1) => {
    const N = nodes.length, C = chain.length;
    const tf = new Array(C), org = new Array(C), op = new Float32Array(C), hid = new Uint8Array(C), dn = new Uint8Array(C), bl = new Array(C), cp = new Array(C), lay = new Array(C), G = new Array(C);
    for (let f = f0; f < f1; f++) {
      tl.seek(f / FPS, false);
      for (let ci = 0; ci < C; ci++) { const e = chain[ci], s = getComputedStyle(e);
        tf[ci] = parseM(s.transform); const o = s.transformOrigin.split(" ").map(parseFloat); org[ci] = [o[0] || 0, o[1] || 0];
        op[ci] = +s.opacity; dn[ci] = s.display === "none" ? 1 : 0; hid[ci] = dn[ci] || s.visibility === "hidden" ? 1 : 0; bl[ci] = filterBlur(s.filter); cp[ci] = s.clipPath; }
      document.documentElement.classList.add("ae-m");
      const r0 = root.getBoundingClientRect();
      for (let ci = 0; ci < C; ci++) { const r = chain[ci].getBoundingClientRect(); lay[ci] = [r.left - r0.left, r.top - r0.top, r.width, r.height]; }
      // where the layers' text sits inside them (a reflow, e.g. words pushed along by an insertion, is a new look)
      const tpos = new Array(N); const rg = document.createRange();
      for (let i = 0; i < N; i++) { const n = nodes[i]; if (!n.texts || !n.texts.length) { tpos[i] = ""; continue; } const l = lay[n.ci];
        tpos[i] = n.texts.map((tn) => { rg.selectNodeContents(tn); const r = rg.getBoundingClientRect(); return `${Math.round(r.left - r0.left - l[0])},${Math.round(r.top - r0.top - l[1])}`; }).join(";"); }
      document.documentElement.classList.remove("ae-m");
      // global matrices down the chain (the chain is sorted so parents come first)
      for (let ci = 0; ci < C; ci++) { const e = chain[ci]; if (e === root) { G[ci] = I; continue; }
        const p = chainIndex.get(e.parentElement); const pg = p === undefined ? I : G[p], pl = p === undefined ? [0, 0] : lay[p];
        const o = org[ci]; G[ci] = mul(mul(mul(mul(pg, T(lay[ci][0] - pl[0], lay[ci][1] - pl[1])), T(o[0], o[1])), tf[ci]), T(-o[0], -o[1])); }
      for (let i = 0; i < N; i++) { const n = nodes[i], ci = n.ci, k = f * N + i;
        ST.G.set(G[ci], k * 6); ST.X.set(tf[ci], k * 6); ST.WH[k * 2] = lay[ci][2]; ST.WH[k * 2 + 1] = lay[ci][3]; ST.O[k * 2] = org[ci][0]; ST.O[k * 2 + 1] = org[ci][1];
        let o = 1, bx = 0, by = 0, h = hid[ci]; for (let x = n.el; x && x !== root.parentElement; x = x.parentElement) { const c = chainIndex.get(x); if (c === undefined) break; o *= op[c]; if (dn[c]) h = 1; bx += bl[c][0]; by += bl[c][1]; }
        ST.OP[k] = h ? 0 : o; ST.BL[k * 2] = Math.sqrt(bx); ST.BL[k * 2 + 1] = Math.sqrt(by);
        const s = getComputedStyle(n.el), txt = ownText(n.el), sig = `${txt}|${s.color}|${s.backgroundColor}|${s.backgroundImage}|${s.boxShadow}|${s.borderTopColor}|${tpos[i]}`;
        let id = ST.sigMap.get(sig); if (id === undefined) { id = ST.sigs.length; ST.sigs.push(sig); ST.sigMap.set(sig, id); } ST.SIG[k] = id;
        let tid = ST.txtMap.get(txt); if (tid === undefined) { tid = ST.txts.length; ST.txts.push(txt); ST.txtMap.set(txt, tid); } ST.TX[k] = tid; }
      // clip sources this frame: clip-path on any chain element, overflow clips on ancestors of layers
      for (let ci = 0; ci < C; ci++) { const has = cp[ci] && cp[ci] !== "none"; if (!has && !ST.ovf.has(ci)) continue;
        let rec = ST.clip.get(ci); if (!rec) { rec = { frames: new Map() }; ST.clip.set(ci, rec); }
        const w = lay[ci][2], h = lay[ci][3];
        rec.frames.set(f, { G: G[ci], cp: has ? clipShape(cp[ci], w, h) : null, ov: ST.ovf.has(ci) ? rrect(0, 0, w, h, 0) : null }); }
    }
    return f1;
  };

  // ---- planning: states, capture frames, layer kinds ----
  const get6 = (arr, k) => [arr[k * 6], arr[k * 6 + 1], arr[k * 6 + 2], arr[k * 6 + 3], arr[k * 6 + 4], arr[k * 6 + 5]];
  const shearOf = (m) => { const sx = Math.hypot(m[0], m[1]) || 1e-9, th = Math.atan2(m[1], m[0]); const r12 = Math.cos(th) * m[2] + Math.sin(th) * m[3]; return r12 / sx; };
  let layers = [];
  AE.plan = () => {
    const N = nodes.length;
    layers = [];
    const nodeLayers = new Array(N).fill(null);
    for (const i of AE.order) {
      const n = nodes[i], vis = [];
      // visible: some opacity, and its box (through its full matrix) overlaps the frame
      const onScreen = (f) => { const k = f * N + i, g = get6(ST.G, k), w = ST.WH[k * 2], h = ST.WH[k * 2 + 1];
        const c = [[0, 0], [w, 0], [w, h], [0, h]].map((p) => ap(g, p)); const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
        const m = 120; return Math.max(...xs) > -m && Math.min(...xs) < W + m && Math.max(...ys) > -m && Math.min(...ys) < H + m; };
      for (let f = 0; f < NF; f++) if (ST.OP[f * N + i] > 0.002 && onScreen(f)) vis.push(f);
      n.vis = vis;
      const hasKids = nodes.some((m) => m.parent === i);
      if (!vis.length && !hasKids) continue;
      const f0 = vis.length ? vis[0] : 0, f1 = vis.length ? vis[vis.length - 1] : NF - 1;
      if (n.seq) { const L = { id: layers.length, node: i, kind: "seq", name: n.name, f0, f1 }; layers.push(L); nodeLayers[i] = [L]; continue; }
      // skew baked into the picture (constant per element), sizes, reveal vs stretch
      let shear = 0, maxSh = 0; vis.forEach((f) => { const s = shearOf(get6(ST.X, f * N + i)); shear += s; maxSh = Math.max(maxSh, Math.abs(s)); }); shear = vis.length ? shear / vis.length : 0;
      if (maxSh < 1e-3) shear = 0;
      let wmin = Infinity, wmax = 0, hmin = Infinity, hmax = 0; vis.forEach((f) => { const k = f * N + i; wmin = Math.min(wmin, ST.WH[k * 2]); wmax = Math.max(wmax, ST.WH[k * 2]); hmin = Math.min(hmin, ST.WH[k * 2 + 1]); hmax = Math.max(hmax, ST.WH[k * 2 + 1]); });
      const sizeVar = wmax - wmin > 0.5 || hmax - hmin > 0.5;
      const ovf = getComputedStyle(n.el).overflow !== "visible";
      const resize = !sizeVar ? null : ovf ? "reveal" : "stretch";
      // looks. A new text cuts to its picture; within one text, a change of look crossfades between the stable looks
      // (runs of ≥ 3 frames) around it, or cuts when the change takes 1–2 frames. Identical looks share one picture.
      const states = [], stateOf = new Map(), wts = [], tseqs = [];
      const stateFor = (sig) => { let si = stateOf.get(sig); if (si === undefined) { si = states.length; states.push({ sig }); stateOf.set(sig, si); wts.push(new Float32Array(NF)); } return si; };
      const segs = []; let sa = 0;
      for (let j = 1; j <= vis.length; j++) { if (j === vis.length || vis[j] !== vis[j - 1] + 1 || ST.TX[vis[j] * N + i] !== ST.TX[vis[j - 1] * N + i]) { segs.push(vis.slice(sa, j)); sa = j; } }
      for (const seg of segs) {
        const runs = []; let a = 0;
        for (let j = 1; j <= seg.length; j++) if (j === seg.length || ST.SIG[seg[j] * N + i] !== ST.SIG[seg[j - 1] * N + i]) { runs.push([a, j - 1]); a = j; }
        const stable = runs.filter(([x0, x1]) => x1 - x0 + 1 >= 3);
        if (!stable.length) { if (seg.length <= 2) { const si = stateFor(ST.SIG[seg[0] * N + i]); seg.forEach((f) => { wts[si][f] = 1; }); } else tseqs.push([seg[0], seg[seg.length - 1]]); continue; }
        const sts = stable.map(([x0]) => stateFor(ST.SIG[seg[x0] * N + i]));
        let tr = null; const flush = () => { if (tr) { tseqs.push(tr); tr = null; } };
        seg.forEach((f, j) => {
          const r = stable.findIndex(([x0, x1]) => j >= x0 && j <= x1);
          if (r >= 0) { flush(); wts[sts[r]][f] = 1; return; }
          const nx = stable.findIndex(([x0]) => x0 > j), pv = nx < 0 ? stable.length - 1 : nx - 1;
          if (nx < 0 || pv < 0) { // changing before the first / after the last stable look
            const a0 = nx < 0 ? stable[pv][1] + 1 : 0, a1 = nx < 0 ? seg.length - 1 : stable[nx][0] - 1;
            if (a1 - a0 + 1 <= 2) { flush(); wts[sts[nx < 0 ? pv : nx]][f] = 1; } else { if (!tr) tr = [f, f]; tr[1] = f; } return; }
          const pe = stable[pv][1], ns = stable[nx][0], gap = ns - pe;
          if (gap <= 3) { flush(); wts[sts[j - pe >= gap / 2 ? nx : pv]][f] = 1; return; }   // a cut
          if (!tr) tr = [f, f]; tr[1] = f; });                                                     // a change: drawn frame by frame
        flush();
      }
      // a picture for each look that paints: its capture frame is its most opaque, largest, fully weighted frame
      const out = [];
      states.forEach((st, si) => { let best = -1, bf = -1;
        for (const f of vis) { const k = f * N + i; if (wts[si][f] < 0.999) continue; const sc = ST.OP[k] * 1e6 + ST.WH[k * 2] * ST.WH[k * 2 + 1] * 1e-3; if (sc > best) { best = sc; bf = f; } }
        if (bf < 0) for (const f of vis) { const k = f * N + i, sc = wts[si][f] * 1e6 + ST.OP[k]; if (sc > best) { best = sc; bf = f; } }
        tl.seek(bf / FPS, false);
        if (!hasPaint(n.el)) return;
        out.push({ node: i, kind: "footage", state: si, sig: st.sig, cap: bf, shear, resize, f0, f1, w: wts[si], capW: ST.WH[(bf * N + i) * 2], capH: ST.WH[(bf * N + i) * 2 + 1] }); });
      // the changes, as picture sequences of the element in its own space (placed and keyed like the pictures)
      tseqs.forEach(([a, b]) => { let mw = 0, mh = 0, best = -1, bf = a; for (let f = a; f <= b; f++) { const k = f * N + i; mw = Math.max(mw, ST.WH[k * 2]); mh = Math.max(mh, ST.WH[k * 2 + 1]); if (ST.OP[k] > best) { best = ST.OP[k]; bf = f; } }
        tl.seek(bf / FPS, false); if (!hasPaint(n.el)) return;
        const w = new Float32Array(NF); for (let f = a; f <= b; f++) w[f] = 1;
        out.push({ node: i, kind: "tseq", cap: a, shear, resize, f0: a, f1: b, w, capW: ST.WH[(a * N + i) * 2], capH: ST.WH[(a * N + i) * 2 + 1], maxW: mw, maxH: mh }); });
      if (!out.length) { const L = { id: layers.length, node: i, kind: "null", name: n.name, f0, f1, shear: 0, resize: null }; layers.push(L); nodeLayers[i] = [L]; continue; }
      out.sort((x, y) => (x.kind === "tseq") - (y.kind === "tseq"));
      out.forEach((L, j) => { L.id = layers.length; L.name = out.length > 1 ? `${n.name} · ${j + 1}` : n.name; layers.push(L); });
      nodeLayers[i] = out;
    }
    // parents: the nearest ancestor layer that can carry children (not stretched; its first state)
    layers.forEach((L) => { if (L.kind === "seq") { L.parent = -1; return; }
      let p = nodes[L.node].parent; while (p >= 0 && (!nodeLayers[p] || nodeLayers[p][0].kind === "seq" || nodeLayers[p][0].kind === "tseq" || nodeLayers[p][0].resize === "stretch")) p = nodes[p].parent;
      L.parent = p >= 0 ? nodeLayers[p][0].id : -1; L.parentNode = p; });
    AE.nodeLayers = nodeLayers;
    return layers.map((L) => ({ id: L.id, node: L.node, kind: L.kind, name: L.name, cap: L.cap, shear: L.shear, f0: L.f0, f1: L.f1, parent: L.parent, maxW: L.maxW, maxH: L.maxH, sel: `[data-ae-node="${L.node}"]` }));
  };
  AE.tagNodes = () => { nodes.forEach((n) => n.el.setAttribute("data-ae-node", n.i)); return nodes.length; };

  // ---- finalize: AE values from the samples and the captured pictures ----
  // A layer's picture maps to the element's local coordinates by Λ (pixel q ↔ local p: q = Λ p). For an element with a
  // baked skew Λ = T(off) · B (B = the skew about the element's transform origin), else Λ = T(off). In the parent layer's
  // space the layer is M = Λ_P · G_P⁻¹ · G · Λ⁻¹, which AE writes as Position + Rotation · Scale about the anchor.
  const rdp = (n, dist, tol) => { // indices to keep so linear interpolation stays within tol
    if (n <= 2) return [...Array(n).keys()];
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
    while (st.length) { const [a, b] = st.pop(); let md = -1, mi = -1; for (let j = a + 1; j < b; j++) { const d = dist(a, b, j); if (d > md) { md = d; mi = j; } } if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    const out = []; for (let j = 0; j < n; j++) if (keep[j]) out.push(j); return out; };
  const track = (frames, vals, tol) => { // vals: arrays (vectors) per frame
    const dist = (a, b, j) => { const u = (j - a) / (b - a); let m = 0; for (let c = 0; c < vals[j].length; c++) m = Math.max(m, Math.abs(vals[a][c] + (vals[b][c] - vals[a][c]) * u - vals[j][c])); return m; };
    return rdp(vals.length, dist, tol).map((j) => [frames[j], ...vals[j]]); };
  const skewB = (sh, o) => mul(mul(T(o[0], o[1]), [1, 0, sh, 1, 0, 0]), T(-o[0], -o[1]));
  AE.finalize = (caps) => { // caps: {layerId: {ox, oy, w, h}} — the element's (skewed) box min corner in its picture, picture size
    const N = nodes.length, res = [];
    const Lam = new Map();
    layers.forEach((L) => { if (L.kind !== "footage" && L.kind !== "tseq") { Lam.set(L.id, I); return; }
      const c = caps[L.id], k = L.cap * N + L.node, o = [ST.O[k * 2], ST.O[k * 2 + 1]];
      const B = L.shear ? skewB(L.shear, o) : I;
      const box = [[0, 0], [L.capW, 0], [L.capW, L.capH], [0, L.capH]].map((p) => ap(B, p));
      const minx = Math.min(...box.map((p) => p[0])), miny = Math.min(...box.map((p) => p[1]));
      Lam.set(L.id, mul(T(c.ox - minx, c.oy - miny), B)); L.png = c; });
    const Geff = (L, f) => { const k = f * N + L.node; let g = get6(ST.G, k);
      if (L.resize === "stretch" && L.capW && L.capH) g = mul(g, S((ST.WH[k * 2] || L.capW) / L.capW, (ST.WH[k * 2 + 1] || L.capH) / L.capH));
      return g; };
    for (const L of layers) {
      const out = { id: L.id, name: L.name, kind: L.kind, parent: L.parent, f0: L.f0, f1: L.f1 };
      if (L.kind === "seq") { res.push(out); continue; }
      const isParent = layers.some((c) => c.parent === L.id);
      const frames = []; for (let f = isParent ? 0 : L.f0; f <= (isParent ? NF - 1 : L.f1); f++) frames.push(f);
      if (!frames.length) frames.push(0);
      const lam = Lam.get(L.id), lamI = inv(lam);
      const P = L.parent >= 0 ? layers[L.parent] : null, lamP = P ? Lam.get(P.id) : I;
      const k0 = L.cap !== undefined ? L.cap * N + L.node : frames[0] * N + L.node;
      const o = [ST.O[k0 * 2], ST.O[k0 * 2 + 1]];
      const anchor = ap(lam, o);
      out.anchor = anchor;
      const pos = [], scl = [], rot = [], opa = [], blr = []; let lastRot = null;
      for (const f of frames) {
        const g = Geff(L, f), gp = P ? Geff(P, f) : I;
        const M = mul(mul(mul(lamP, inv(gp)), g), lamI);
        const p = ap(M, anchor), sx = Math.hypot(M[0], M[1]), det = M[0] * M[3] - M[1] * M[2];
        let r = Math.atan2(M[1], M[0]) * 180 / Math.PI; if (lastRot !== null) { while (r - lastRot > 180) r -= 360; while (r - lastRot < -180) r += 360; } lastRot = r;
        pos.push(p); scl.push([sx * 100, (det / (sx || 1e-9)) * 100]); rot.push([r]);
        const k = f * N + L.node; opa.push([Math.max(0, Math.min(100, ST.OP[k] * (L.w ? L.w[f] : 1) * 100))]); blr.push([ST.BL[k * 2], ST.BL[k * 2 + 1]]);
      }
      const t = frames;
      out.pos = track(t, pos, 0.05); out.scale = track(t, scl, 0.05); out.rot = track(t, rot, 0.01); out.op = track(t, opa, 0.2);
      if (blr.some((b) => b[0] > 0.05 || b[1] > 0.05)) out.blur = track(t, blr, 0.1);
      if (L.kind === "footage" || L.kind === "tseq") {
        // masks: the element's own clip-path and every clipping ancestor, in this layer's picture space; reveal-resized elements clip to their own box
        const srcs = []; for (let x = nodes[L.node].el; x && x !== root; x = x.parentElement) { const ci = chainIndex.get(x); if (ST.clip.has(ci)) srcs.push(ci); }
        const pw = L.png.w, ph = L.png.h, rect = [[0, 0], [pw, 0], [pw, ph], [0, ph]];
        const inside = (poly, pt) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b]; if ((ya > pt[1]) !== (yb > pt[1]) && pt[0] < ((xb - xa) * (pt[1] - ya)) / (yb - ya) + xa) c = !c; } return c; };
        const masks = [];
        const BIG = [[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]];
        const pad = (sh, nv) => { const v = sh.v.slice(), it = sh.it.slice(), ot = sh.ot.slice(); while (v.length < nv) { v.push(v[v.length - 1].slice()); it.push([0, 0]); ot.push([0, 0]); } return { v, it, ot }; };
        const addMask = (shapeAt) => { const shapes = frames.map((f) => shapeAt(f)); const nv = Math.max(4, ...shapes.map((sh) => (sh ? sh.v.length : 0)));
          const vals = [], fr = []; let needed = false;
          frames.forEach((f, j) => { const sh = pad(shapes[j] || { v: BIG, it: BIG.map(() => [0, 0]), ot: BIG.map(() => [0, 0]) }, nv);
            if (ST.OP[f * N + L.node] > 0.002 && !rect.every((pt) => inside(sh.v, pt))) needed = true;
            fr.push(f); vals.push([...sh.v.flat(), ...sh.it.flat(), ...sh.ot.flat()]); });
          if (!needed) return; masks.push({ n: nv, keys: track(fr, vals, 0.3) }); };
        const toLayer = (f, Gs, sh) => { const m = mul(mul(lam, inv(Geff(L, f))), Gs); return { v: sh.v.map((p) => ap(m, p)), it: sh.it.map((p) => apv(m, p)), ot: sh.ot.map((p) => apv(m, p)) }; };
        for (const ci of srcs) { const rec = ST.clip.get(ci);
          const isSelf = chain[ci] === nodes[L.node].el;
          addMask((f) => { const r = rec.frames.get(f); if (!r) return null;
            if (r.cp) return toLayer(f, r.G, r.cp);
            if (r.ov && !isSelf) return toLayer(f, r.G, r.ov);
            return null; });
          if ([...rec.frames.values()].some((r) => r.ov) && [...rec.frames.values()].some((r) => r.cp) && !isSelf) // an overflow and a clip-path on the same ancestor
            addMask((f) => { const r = rec.frames.get(f); return r && r.ov ? toLayer(f, r.G, r.ov) : null; });
        }
        if (L.resize === "reveal") addMask((f) => { const k = f * N + L.node; return toLayer(f, get6(ST.G, k), rrect(0, 0, ST.WH[k * 2], ST.WH[k * 2 + 1], 0)); });
        if (masks.length) out.masks = masks;
        out.png = { w: L.png.w, h: L.png.h };
      }
      res.push(out);
    }
    return res;
  };
  window.__ae = AE;
})();
