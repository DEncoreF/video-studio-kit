// Morphs.paperPlane — a window (any texture) folds into a paper plane (a classic dart, four folds) and is thrown.
//
// Numbers (video-motion-craft references/material-morphs.md and transition-ruler.md; the legal project's
// research/material-morphs.md, 2026-10-24, all watched frame by frame):
//   - real paper: one fold ≈ 0.4 s; the crease starts as a rounded band with a highlight, then is pressed sharp
//     (Foldable Flight 0:15); wing folds 0.4–0.5 s, and the throw itself is never shown slow.
//   - the UI rule for subject morphs: ≈ 0.33 s on the measured spring (library/motion/ruler-ease.js).
//   - here: 4 folds × 0.33 s, each starting while the one before is ~80 % done (fluency: one folding gesture, no
//     fold → stop → fold; the paper keeps lifting and turning a little between folds) → hold 0.3 s with a small breath →
//     pull back 0.15 s → bank 15–25° and accelerate away; the film's one ~6 % pop rides on the throw (scale), then the
//     plane dives into its target and is gone. Render at 60 fps (video-motion-craft references/transition-ruler.md §2).
//   - never a dissolve instead of a fold (Postbird does that — the cheat the research names); no CSS fake 3D.
// Semantics: the plane leaves toward the recipient / the sent box, i.e. opposite to where the mail came in, never at
// the viewer.
//
// Geometry: a subdivided plane in px units, nose at −x (the window's left edge). Each fold reflects one side of a crease
// line, bent around a cylinder whose radius shrinks from large (the flap curls) to the paper's thickness (it lands), and
// the crease keeps sharpening after it lands. Which vertices move in each fold is fixed at build time from the flat folded
// state, so draw(t) is a pure function of t (any frame, any order).
//   F1  the two nose corners fold behind to the centre line      (mountain, 180°)
//   F2  the new slanted edges fold behind to the centre line     (mountain, 180°)
//   F3  the sheet folds in half, back to back, content outside   (mountain, 180°)
//   F4  the wings fold out, one each way                         (± wing angle)
// Then the whole plane rolls keel-down into a three-quarter view, holds, pulls back, banks and goes.
//
//   const P = Morphs.paperPlane({ THREE, front: texture, alpha: maskTexture, width: 1000, height: 640, t0: 1.6,
//     origin: [60, 10, 0], to: [-1276, 526, -1200] });
//   scene.add(P.object3d); ... each frame: P.draw(t); const box = P.screenBox(camera, 1920, 1080);
(function (g) {
  const Morphs = (g.Morphs = g.Morphs || {});
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), seg = (t, a, b) => clamp((t - a) / (b - a)), lerp = (a, b, k) => a + (b - a) * k;
  const sCurve = (x) => ((x = clamp(x)) < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  Morphs.paperPlane = function (o) {
    const THREE = o.THREE, RE = g.RulerEase;
    const W = o.width ?? 1000, H = o.height ?? 640, cell = o.cell ?? 5, thick = o.thickness ?? 0.4;
    const ease = o.ease ?? RE?.spring ?? sCurve, accel = o.accel ?? ((x) => Math.pow(clamp(x), 2.6));
    const T0 = o.t0 ?? 1.6, FOLD = o.fold ?? 0.33, STRIDE = o.stride ?? FOLD * (1 - (o.overlap ?? 0.4)), HOLD = o.hold ?? 0.3, PULL = o.pull ?? 0.15;
    const DRIFT = o.drift ?? 26, YAWDRIFT = o.yawDrift ?? -0.07, BREATH = o.breath ?? 4;   // the gesture between folds; the hold's breath (px)
    const THROW = o.throwDur ?? 1.0, ENTER = o.enter ?? 0.16, LIFT = o.lift ?? 30, LIFTDUR = o.liftDur ?? 0.15;
    const BANK = o.bank ?? THREE.MathUtils.degToRad(20), POP = o.pop ?? 0.06, R0 = o.curl ?? 0.12 * H, RROUND = o.round ?? 3, SHARPEN = o.sharpen ?? 0.6;
    const keel = (o.keel ?? 0.36) * (H / 2), WING = o.wing ?? 1.45;
    const origin = new THREE.Vector3(...(o.origin ?? [0, 0, 0])), to = new THREE.Vector3(...(o.to ?? [-1200, 400, -1200]));
    const turn = o.turn ?? { x: 0.5 - Math.PI, y: -0.45, z: 0.12 };   // keel down, wings seen from above (the roll takes the short way round)

    // timings
    const folds = [0, 1, 2, 3].map((k) => [T0 + k * STRIDE, T0 + k * STRIDE + FOLD]);
    const tFolded = folds[3][1], tHold = tFolded + HOLD, tThrow = tHold + PULL, tEnd = tThrow + THROW;
    const times = { lift: T0 - LIFTDUR, folds, folded: tFolded, hold: tHold, throw: tThrow, end: tEnd };

    // the sheet
    const geo = new THREE.PlaneGeometry(W, H, Math.round(W / cell), Math.round(H / cell));
    const P = geo.attributes.position, n = P.count, X0 = new Float32Array(n), Y0 = new Float32Array(n);
    for (let i = 0; i < n; i++) { X0[i] = P.getX(i); Y0[i] = P.getY(i); }
    const L2 = W / 2, W2 = H / 2, nose = [-L2, 0];
    const dirOf = (dx, dy) => { const l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
    const t225 = Math.PI / 8;
    // a 180° fold lands its layers at 2R − z0: R must exceed the stack already there (depths 0, 2, 6, 14 × thickness)
    const RMIN = [1, 3, 7, 8];
    // fold k: lines that move together; each line: point, direction, a reference point on the moving side, z direction, angle, filter
    const spec = [
      [{ p: nose, d: dirOf(W2, W2), ref: [-L2, W2], dir: -1, ang: Math.PI }, { p: nose, d: dirOf(W2, -W2), ref: [-L2, -W2], dir: -1, ang: Math.PI }],
      [{ p: nose, d: [Math.cos(t225), Math.sin(t225)], ref: [0, W2], dir: -1, ang: Math.PI }, { p: nose, d: [Math.cos(t225), -Math.sin(t225)], ref: [0, -W2], dir: -1, ang: Math.PI }],
      [{ p: [0, 0], d: [1, 0], ref: [0, W2], dir: -1, ang: Math.PI }],
      [{ p: [0, -keel], d: [1, 0], ref: [0, -W2], dir: 1, ang: WING, layer: 0 }, { p: [0, -keel], d: [1, 0], ref: [0, -W2], dir: -1, ang: WING, layer: 1 }],
    ];
    // masks from the flat folded state (reflections of the folds before)
    const fx = Float32Array.from(X0), fy = Float32Array.from(Y0), movedF3 = new Uint8Array(n);
    const lines = spec.map((group, k) => group.map((L) => {
      const nx = -L.d[1], ny = L.d[0], s = Math.sign((L.ref[0] - L.p[0]) * nx + (L.ref[1] - L.p[1]) * ny);
      const N = [nx * s, ny * s], idx = [];
      for (let i = 0; i < n; i++) {
        if (L.layer !== undefined && movedF3[i] !== L.layer) continue;
        if ((fx[i] - L.p[0]) * N[0] + (fy[i] - L.p[1]) * N[1] > 1e-6) idx.push(i);
      }
      return { ...L, N, idx: Uint32Array.from(idx), rmin: thick * RMIN[k] };
    }));
    lines.forEach((group, k) => group.forEach((L) => {
      if (Math.abs(L.ang) < Math.PI - 1e-3) return;   // only the flat folds feed the next state
      for (const i of L.idx) { const u = (fx[i] - L.p[0]) * L.N[0] + (fy[i] - L.p[1]) * L.N[1]; fx[i] -= 2 * u * L.N[0]; fy[i] -= 2 * u * L.N[1]; if (k === 2) movedF3[i] = 1; }
    }));
    // the F4 masks needed movedF3, which is only known now: rebuild them
    lines[3] = spec[3].map((L) => {
      const nx = -L.d[1], ny = L.d[0], s = Math.sign((L.ref[0] - L.p[0]) * nx + (L.ref[1] - L.p[1]) * ny), N = [nx * s, ny * s], idx = [];
      for (let i = 0; i < n; i++) if (movedF3[i] === L.layer && (fx[i] - L.p[0]) * N[0] + (fy[i] - L.p[1]) * N[1] > 1e-6) idx.push(i);
      return { ...L, N, idx: Uint32Array.from(idx), rmin: thick * RMIN[3] };
    });

    // the fold at angle th around a cylinder of radius R (toward +z), with the vertex's layer offset z0 carried along the normal
    const out = [0, 0];
    function bend(u, z0, th, R) {
      const arc = R * th;
      let cu, cz, nu, nz;
      if (u <= arc) { const f = u / R; cu = R * Math.sin(f); cz = R * (1 - Math.cos(f)); nu = -Math.sin(f); nz = Math.cos(f); }
      else { const s = u - arc; cu = R * Math.sin(th) + s * Math.cos(th); cz = R * (1 - Math.cos(th)) + s * Math.sin(th); nu = -Math.sin(th); nz = Math.cos(th); }
      out[0] = cu + z0 * nu; out[1] = cz + z0 * nz;
    }
    const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
    function shape(t) {
      px.set(X0); py.set(Y0); pz.fill(0);
      lines.forEach((group, k) => {
        const [a, b] = folds[k], p = ease(seg(t, a, b));
        if (p <= 0) return;
        for (const L of group) {
          const R = Math.max(L.rmin, t < b ? lerp(R0, RROUND, p) : lerp(RROUND, L.rmin, sCurve(seg(t, b, b + SHARPEN))));
          const th = p * L.ang, dx = L.d[0], dy = L.d[1];
          for (const i of L.idx) {
            // u ≤ 0: a point of an earlier flap still in the air has not reached this fold's side yet — it stays (continuous at u = 0)
            const rx = px[i] - L.p[0], ry = py[i] - L.p[1], u = rx * L.N[0] + ry * L.N[1], v = rx * dx + ry * dy;
            if (u <= 0) continue;
            bend(u, pz[i] * L.dir, th, R);
            px[i] = L.p[0] + L.N[0] * out[0] + dx * v; py[i] = L.p[1] + L.N[1] * out[0] + dy * v; pz[i] = out[1] * L.dir;
          }
        }
      });
      for (let i = 0; i < n; i++) P.setXYZ(i, px[i], py[i], pz[i]);
      P.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    }
    // the folded plane's centre (the pivot it turns and flies around)
    shape(tEnd + 10);
    let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; cz += pz[i]; }
    const C = new THREE.Vector3(cx / n, cy / n, cz / n);

    // materials: the face carries the window, the back is paper; both cut by the window's rounded corners
    const common = { roughness: o.roughness ?? 0.62, metalness: 0, alphaMap: o.alpha ?? null, alphaTest: o.alpha ? 0.5 : 0 };
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...common, map: o.front ?? null, side: THREE.FrontSide }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...common, color: new THREE.Color(o.backColor ?? 0xe9e7e2), side: THREE.BackSide }));
    for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; }
    const inner = new THREE.Group(); inner.add(front, back);
    const object3d = new THREE.Group(); object3d.add(inner); object3d.rotation.order = "YXZ";

    const flight = new THREE.Vector3().subVectors(to, origin), dirN = flight.clone().normalize();
    const aimYaw = Math.atan2(flight.z, -flight.x), aimPitch = Math.atan2(flight.y, Math.hypot(flight.x, flight.z));
    const place = (t, target) => {   // position and rotation before the throw (pure in t)
      const w = sCurve(seg(t, folds[2][0], folds[3][1]));   // pivot moves to the folded centre while it folds in half
      const e = sCurve(seg(t, folds[2][0] + 0.12, tHold - 0.05));
      // one gesture: the lift eases into the folds and keeps rising through them; a breath while it holds
      const g = seg(t, T0 - LIFTDUR, tHold), lift = LIFT * sCurve(seg(t, T0 - LIFTDUR, T0 + 0.1)) + DRIFT * Math.sin(Math.PI / 2 * g);
      const breath = BREATH * Math.sin(Math.PI * seg(t, tFolded - 0.1, tThrow)), pull = PULL ? 40 * sCurve(seg(t, tHold, tThrow)) : 0;
      target.pos.copy(origin).addScaledVector(C, w).add(new THREE.Vector3(0, breath, lift)).addScaledVector(dirN, -pull);
      target.rot.set(turn.x * e, turn.y * e + YAWDRIFT * Math.sin(Math.PI * seg(t, T0, tFolded + 0.2)), turn.z * e - 0.08 * sCurve(seg(t, tHold, tThrow)));   // the pull back lifts the nose a little
      target.w = w;
    };
    const s0 = { pos: new THREE.Vector3(), rot: new THREE.Euler(), w: 0 }, s1 = { pos: new THREE.Vector3(), rot: new THREE.Euler(), w: 0 };
    place(tThrow, s1);

    function draw(t) {
      shape(t);
      const tau = seg(t, tThrow, tEnd);
      if (t < tThrow) {
        place(t, s0); object3d.position.copy(s0.pos); object3d.rotation.set(s0.rot.x, s0.rot.y, s0.rot.z); inner.position.copy(C).multiplyScalar(-s0.w);
        object3d.scale.setScalar(1); object3d.visible = true; return;
      }
      const a = accel(tau), b = RE ? RE.spring(seg(t, tThrow, tThrow + 0.4)) : sCurve(seg(t, tThrow, tThrow + 0.4)), aim = sCurve(seg(t, tThrow, tThrow + 0.45));
      object3d.position.copy(s1.pos).lerp(to, a);
      object3d.rotation.set(s1.rot.x + BANK * b, lerp(s1.rot.y, aimYaw, aim), lerp(s1.rot.z, s1.rot.z + aimPitch * 0.6, aim));
      inner.position.copy(C).multiplyScalar(-1);
      const x = seg(t, tThrow, tThrow + 0.5), bump = POP * Math.sin(Math.PI * clamp((x - 0.5) / 0.5));
      object3d.scale.setScalar((1 + bump) * (1 - sCurve(seg(t, tEnd - ENTER, tEnd))));
      object3d.visible = t < tEnd;
    }

    // the plane's box on screen (for a contact shadow or a hit test): a sample of its vertices through the camera
    const v = new THREE.Vector3();
    function screenBox(camera, sw, sh, step = 23) {
      object3d.updateMatrixWorld(true); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i += step) { v.set(px[i], py[i], pz[i]).applyMatrix4(front.matrixWorld).project(camera); const X = (v.x + 1) / 2 * sw, Y = (1 - v.y) / 2 * sh; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    draw(0);
    return { object3d, mesh: front, back, times, draw, screenBox };
  };
})(typeof window !== "undefined" ? window : globalThis);
