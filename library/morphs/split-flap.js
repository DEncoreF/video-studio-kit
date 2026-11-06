// Split-flap (Solari board) cells in three.js, for a value that changes in place (e.g. 九十 → 四十五 in a contract clause).
// Real 3D flaps: the upper flap hinges at the middle and falls toward the viewer; its front is the old character's top
// half, its back the new character's bottom half. Copy this file into a film's assets/js (films stay self-contained).
//
// Measured (video-motion-craft/references/material-morphs.md, research 2026-10-24, /watch frame by frame):
//   - real speed: one character every 78 ms (Vestaboard, audio autocorrelation, https://www.youtube.com/watch?v=frWjoOYSrqo)
//   - one flap falls in 35–40 ms, gravity-accelerated, hard stop, rebound ≤ 1 frame (same film, slow motion 0:09–0:10.5)
//   - station board: every cell clicks together every 112 ms; 2–9 kHz broadband, sharp attack
//     (Gare du Nord, https://www.youtube.com/watch?v=1Gjst-QNVE0)
//   - motion-design flip clock: 0.56 s a flap, neighbours 2 frames apart, the falling flap shades the old lower half
//     (https://www.youtube.com/watch?v=dZQCZ4-ltYA, 0:03.2)
// Defaults: 90 ms a step, moving cells 70 ms apart, angle π·u² within a step (gravity), last step 130 ms and a one-frame
// rebound, the whole change ≤ 0.8 s; flap brightness ∝ |cos θ|; the falling flap darkens the lower half it will cover.
// Pass intermediate characters that make sense (八、七、六… for a number), never random glyphs.
//
//   const f = Morphs.splitFlap({ THREE, from: ["九", "十", ""], to: ["四", "十", "五"],
//                                via: [["八", "七", "六", "五"], null, ["一", "二", "三", "四"]], t0: 1.55 });
//   scene.add(f.object3d);  …each frame: f.draw(t)   (pure in t; scrub anywhere)
//   f.events → [{ t, cell, last }] one per landing flap (the click cues); f.end → when the last flap has settled.
// Units: one cell is opts.cell.w wide (default 1) and h tall; position and scale the group yourself.
(function (g) {
  const M = (g.Morphs = g.Morphs || {});
  M.splitFlap = function (o) {
    const THREE = o.THREE, n = o.from.length;
    const step = o.step ?? 0.09, offset = o.offset ?? 0.07, last = o.last ?? 0.13, rebound = o.rebound ?? 1 / 30;
    const C = { tile: "#34383d", ink: "#f1eee7", hinge: "#0c0d0f", edge: "#1d2024", ...(o.colors ?? {}) };
    const W = o.cell?.w ?? 1, H = o.cell?.h ?? 1.32, GAP = o.cell?.gap ?? 0.08;
    const font = o.font ?? '700 190px "Noto Serif TC", serif', PX = o.texSize ?? 320;
    const group = new THREE.Group();
    // one texture per character: the whole tile, its halves picked by UV
    const texCache = new Map();
    function tex(ch) {
      if (texCache.has(ch)) return texCache.get(ch);
      const cw = PX, chh = Math.round((PX * H) / W), c = document.createElement("canvas"); c.width = cw; c.height = chh;
      const x = c.getContext("2d");
      const grd = x.createLinearGradient(0, 0, 0, chh); // a flap is a little lighter at its outer edge, darker at the hinge
      grd.addColorStop(0, shade(C.tile, 1.12)); grd.addColorStop(0.5, shade(C.tile, 0.9)); grd.addColorStop(1, shade(C.tile, 1.04));
      x.fillStyle = grd; x.fillRect(0, 0, cw, chh);
      if (ch) {
        x.fillStyle = C.ink; x.font = font; x.textAlign = "center"; x.textBaseline = "alphabetic";
        const m = x.measureText(ch), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
        x.fillText(ch, cw / 2, chh / 2 + (asc - desc) / 2);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      texCache.set(ch, t); return t;
    }
    function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return "#" + c.getHexString(); }
    // half-tile geometries: top spans y 0..H/2, bottom −H/2..0; flap back maps the new bottom half upside down so it
    // reads upright once the flap has fallen (rotation about x keeps x, so no mirroring)
    function half(top, back) {
      const geo = new THREE.PlaneGeometry(W, H / 2); geo.translate(0, top ? H / 4 : -H / 4, 0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const v = uv.getY(i); uv.setY(i, back ? 0.5 - v * 0.5 : top ? 0.5 + v * 0.5 : v * 0.5); }
      return geo;
    }
    const gTop = half(true, false), gBot = half(false, false), gBack = half(true, true);
    const cells = [];
    let order = 0;
    for (let i = 0; i < n; i++) {
      const seq = o.via?.[i] ? [o.from[i], ...o.via[i], o.to[i]] : o.from[i] === o.to[i] ? [o.from[i]] : [o.from[i], o.to[i]];
      const cg = new THREE.Group(); cg.position.x = i * (W + GAP); group.add(cg);
      const mk = (geo, side) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side, transparent: false }));
      const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.05, H + 0.05), new THREE.MeshBasicMaterial({ color: C.edge }));
      back.position.z = -0.02; cg.add(back); // the tile's body behind the flaps: reads as thickness at the edges
      const top = mk(gTop, THREE.FrontSide), bot = mk(gBot, THREE.FrontSide); cg.add(top, bot);
      const flap = new THREE.Group(); flap.position.z = 0.006; cg.add(flap);
      const ff = mk(gTop, THREE.FrontSide), fb = mk(gBack, THREE.BackSide); flap.add(ff, fb);
      const hinge = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.02, 0.028), new THREE.MeshBasicMaterial({ color: C.hinge }));
      hinge.position.z = 0.012; cg.add(hinge);
      const moving = seq.length > 1, start = (o.t0 ?? 0) + (moving ? order++ * offset : 0);
      cells.push({ seq, start, top, bot, flap, ff, fb });
    }
    // landing times (the click cues)
    const events = [];
    cells.forEach((c, i) => { let s = c.start; for (let k = 0; k < c.seq.length - 1; k++) { s += k === c.seq.length - 2 ? last : step; events.push({ t: s, cell: i, last: k === c.seq.length - 2 }); } });
    const end = Math.max(...events.map((e) => e.t), o.t0 ?? 0) + rebound;
    const set = (m, ch, b) => { const t = tex(ch); if (m.material.map !== t) { m.material.map = t; m.material.needsUpdate = true; } m.material.color.setScalar(b); };
    function draw(t) {
      for (const c of cells) {
        const q = c.seq, N = q.length;
        let top = q[0], bot = q[0], f = null;
        if (N > 1 && t >= c.start) {
          let s = c.start; top = bot = q[N - 1];
          for (let k = 0; k < N - 1; k++) {
            const d = k === N - 2 ? last : step;
            if (t < s + d) { const u = (t - s) / d; f = { a: q[k], b: q[k + 1], th: Math.PI * u * u }; top = q[k + 1]; bot = q[k]; break; }
            s += d;
            if (k === N - 2 && t < s + rebound) { f = { a: q[k], b: q[k + 1], th: Math.PI - 0.22 * Math.sin((Math.PI * (t - s)) / rebound) }; top = q[k + 1]; bot = q[k]; }
          }
        }
        set(c.top, top, f ? 0.94 + 0.06 * Math.abs(Math.cos(f.th)) : 1);
        set(c.bot, bot, f ? 1 - 0.38 * Math.sin(Math.min(f.th, Math.PI)) * (f.th > Math.PI / 2 ? 1 : 0.55) : 1);
        c.flap.visible = !!f;
        if (f) {
          c.flap.rotation.x = f.th;
          const lum = 0.58 + 0.42 * Math.abs(Math.cos(f.th));
          set(c.ff, f.a, lum); set(c.fb, f.b, lum);
        }
      }
    }
    draw(-1);
    return { object3d: group, draw, events, end, width: n * W + (n - 1) * GAP, height: H };
  };
})(typeof window !== "undefined" ? window : globalThis);
