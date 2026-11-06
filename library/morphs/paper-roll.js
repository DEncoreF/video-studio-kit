// A sheet of paper that rolls up into a scroll and unrolls again, bent for real on the GPU (three.js).
// Copy into a film's assets/js and load it as a classic script; it adds Morphs.paperRoll to window and uses the THREE
// you hand it, so it works next to an ES-module three.js.
//
//   const roll = Morphs.paperRoll({ THREE, width: 14.14, height: 10, front: canvasA, frontAfter: canvasB,
//     keys: { up: [0.5, 1.4], swap: 1.55, down: [1.7, 3.1] }, axis: "left" });
//   scene.add(roll.object3d);  …  roll.draw(t);   // every frame, from the timeline's time only
//
// How it moves (measured, video-motion-craft references/material-morphs.md, research by /watch 2026-10-24):
// - A real scroll (Torah, youtube vznws6smsnk): starts slower for ~0.7 s, then near constant speed; the roll turns as it
//   travels and never slips (turn = travel ÷ radius); the paper next to the roll lifts about one roll diameter.
// - A motion-graphics scroll (Motion Array, youtube 9cSyKUphGrI) cheats by keeping the roll's radius fixed; here the roll
//   gets thicker as more paper winds on (an Archimedean spiral: radius = r0 + thickness · turns).
// - Timing used for a hero beat: roll up 0.8–1.0 s → hold 0.3 s (swap the printed face while it is hidden inside the
//   roll) → unroll 1.2–1.5 s with the last 20% slowing → hold ≥ 1.5 s. Modern thin white paper, no parchment.
// - Keep the back free of show-through print: the back is what the roll shows, so a print on it would change visibly at
//   the swap.
// - Sound (only an AI-made ASMR clip measured): paper crackle ~14 per second, ~20 ms decay, while the roll moves.
//
// Geometry: the sheet lies in the x–y plane facing +z (the camera). With axis "left" the right edge winds first (it is the
// core) and the roll travels left, ending at the left edge; unrolling runs left→right, revealing the face left to right.
// The printed face ends up inside the roll, so it is hidden while rolled; the back of the paper is what the roll shows.
// Shading: lambert + a little sheen from the bent normals (cylinder shading), a dark crease where the outer layer meets
// the flat sheet, and a soft contact shadow on the flat sheet beside the roll. draw(t) depends on t only.
(function (g) {
  const clamp = (x) => Math.min(1, Math.max(0, x));
  // trapezoid speed: ramps up over the first `a`, constant, ramps down over the last `d` (position 0→1)
  function trapezoid(x, a, d) {
    x = clamp(x); const vm = 1 / (1 - a / 2 - d / 2);
    if (x < a) return (vm * x * x) / (2 * a);
    if (x < 1 - d) return vm * (a / 2 + (x - a));
    return 1 - (vm * (1 - x) * (1 - x)) / (2 * d);
  }

  const VERT = /* glsl */ `
    uniform float uW, uH, uP, uR0, uK, uMirror;
    varying vec2 vUv; varying vec3 vN; varying vec3 vPos; varying float vU; varying float vWound; varying float vDelta;
    float theta(float s) { return (-uR0 + sqrt(uR0 * uR0 + 2.0 * uK * s)) / uK; }
    void main() {
      vUv = uv;
      float u = (uMirror > 0.5) ? (uW * 0.5 - position.x) : (position.x + uW * 0.5);   // 0 at the edge the roll ends on
      vec3 p = vec3(u, position.y, 0.0); vec3 n = vec3(0.0, 0.0, 1.0); float wound = 0.0, delta = 0.0;
      if (u > uP) {
        float Lw = uW - uP, s = uW - u;                       // s: arc length from the core (the edge that wound first)
        float T = theta(Lw), Rout = uR0 + uK * T, ts = theta(s), r = uR0 + uK * ts;
        delta = T - ts; float a = -1.5707963 + delta;
        p = vec3(uP + r * cos(a), position.y, Rout + r * sin(a));
        n = -vec3(cos(a), 0.0, sin(a));                       // the printed face looks into the roll
        wound = 1.0;
      }
      if (uMirror > 0.5) { p.x = uW * 0.5 - p.x; n.x = -n.x; } else { p.x = p.x - uW * 0.5; }
      vU = u; vWound = wound; vDelta = delta;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const FRAG = /* glsl */ `
    uniform sampler2D uFront, uBack; uniform vec3 uLight, uCam, uPaper; uniform float uP, uRout, uAmb, uKey, uSheen, uCrease, uShadow;
    uniform vec4 uHl;   // highlight band on the printed face: x0, x1 (uv.x, the band grows to x1), y0, y1 (uv.y); off when x1 <= x0
    uniform float uHlAmt;
    varying vec2 vUv; varying vec3 vN; varying vec3 vPos; varying float vU; varying float vWound; varying float vDelta;
    void main() {
      bool front = gl_FrontFacing;
      vec3 n = normalize(front ? vN : -vN);
      vec3 base = front ? texture2D(uFront, vUv).rgb : texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb;
      if (front && uHl.y > uHl.x && vUv.x >= uHl.x && vUv.x <= uHl.y && vUv.y >= uHl.z && vUv.y <= uHl.w) base *= mix(1.0, 0.86, uHlAmt);
      vec3 L = normalize(uLight), V = normalize(uCam - vPos), Hh = normalize(L + V);
      float diff = max(dot(n, L), 0.0), wrap = max(dot(n, L) * 0.5 + 0.5, 0.0);
      float light = uAmb + uKey * mix(diff, wrap, 0.35);
      float spec = uSheen * pow(max(dot(n, Hh), 0.0), 40.0);
      float facing = abs(dot(n, V));
      // the flat sheet beside the roll: contact shadow; the outer layer near the contact: the crease
      float d = (uP - vU) / max(uRout, 0.001);
      float shade = 1.0;
      if (vWound < 0.5) shade -= (uShadow * exp(-pow(max(d, 0.0) / 1.3, 2.0)) + uCrease * 0.7 * exp(-pow(max(d, 0.0) / 0.07, 2.0))) * step(0.0, d);
      else {
        shade = (shade - uCrease * exp(-pow(vDelta / 0.35, 2.0))) * mix(0.7, 1.0, pow(facing, 0.6));   // the crease, and the roll darkening toward its silhouette
        // inside the roll light can't reach: the deeper the layer (more than a turn in), and the inner face, the darker —
        // so the open end reads as a hollow spiral of paper, not a solid rod
        shade *= 1.0 - 0.7 * smoothstep(3.0, 6.6, vDelta);
        if (front) shade *= 0.72;
      }
      gl_FragColor = vec4((base * light + spec) * shade, 1.0);
      #include <colorspace_fragment>
    }`;

  function paperRoll(o) {
    const THREE = o.THREE, W = o.width ?? 14.14, H = o.height ?? 10;
    const tex = (c) => { if (!c) return null; const t = c.isTexture ? c : new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };
    const front = tex(o.front), frontAfter = tex(o.frontAfter) ?? front;
    const back = tex(o.back) ?? tex(o.backAfter) ?? front;
    const backAfter = tex(o.backAfter) ?? back;
    const r0 = o.r0 ?? H * 0.022, thick = o.thickness ?? H * 0.0068;   // core radius, paper thickness per turn (exaggerated so the layers read)
    const keys = o.keys ?? { up: [0, 1], swap: 1.15, down: [1.3, 2.7] };
    const U = {
      uW: { value: W }, uH: { value: H }, uP: { value: W }, uR0: { value: r0 }, uK: { value: thick / (2 * Math.PI) }, uMirror: { value: o.axis === "right" ? 1 : 0 },
      uFront: { value: front }, uBack: { value: back }, uLight: { value: new THREE.Vector3(...(o.light ?? [-0.7, 0.45, 0.55])) }, uCam: { value: new THREE.Vector3() },
      uPaper: { value: new THREE.Color(o.paper ?? "#f4f3ef") }, uRout: { value: r0 }, uAmb: { value: o.ambient ?? 0.42 }, uKey: { value: o.key ?? 0.72 },
      uSheen: { value: o.sheen ?? 0.1 }, uCrease: { value: o.crease ?? 0.35 }, uShadow: { value: o.shadow ?? 0.4 },
      uHl: { value: new THREE.Vector4(0, 0, 0, 0) }, uHlAmt: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(W, H, o.segments ?? 720, 1);
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    const group = new THREE.Group(); group.add(mesh);
    const ease = { up: (x) => trapezoid(x, o.upAccel ?? 0.3, o.upDecel ?? 0.25), down: (x) => trapezoid(x, o.downAccel ?? 0.15, o.downDecel ?? 0.2) };
    // how much of the sheet is wound (0 = flat, 1 = all of it) at time t; opts.woundAt overrides (e.g. paperRoll.gesture)
    function wound(t) {
      if (o.woundAt) return o.woundAt(t);
      const [a, b] = keys.up, [c, d] = keys.down;
      if (t < a) return 0; if (t < b) return ease.up((t - a) / (b - a));
      if (t < c) return 1; if (t < d) return 1 - ease.down((t - c) / (d - c)); return 0;
    }
    function draw(t, camera) {
      const w = wound(t), p = W * (1 - w);
      U.uP.value = p;
      const T = (-r0 + Math.sqrt(r0 * r0 + 2 * U.uK.value * (W - p))) / U.uK.value; U.uRout.value = r0 + U.uK.value * T;
      const after = t >= keys.swap; U.uFront.value = after ? frontAfter : front; U.uBack.value = after ? backAfter : back;
      if (camera) U.uCam.value.copy(camera.position);
      return { wound: w, contact: p, radius: U.uRout.value };
    }
    return { object3d: group, mesh, uniforms: U, draw, wound, trapezoid };
  }
  // Roll up and unroll as ONE gesture (the fluency rule: no freeze inside a morph). The speed is piecewise linear, so the
  // position is smooth: it ramps up, runs, slows to `vTurn` as the sheet is almost all wound (`edge`), turns over through
  // fully wound at the midpoint of `turn` (the only instant at rest — put the face swap there: at ≥ edge only the sheet's
  // margin is flat, so keep edge·width inside the blank margin of both faces), then unrolls the same way back to flat.
  //   paperRoll.gesture({ up: [0.35, 1.3], turn: [1.3, 1.6], down: [1.6, 3.0] }) → (t) => wound fraction
  paperRoll.gesture = function (k) {
    const edge = k.edge ?? 0.97, [a, b] = k.up, [c, d] = k.down, tw = c - b, vt = (2 * (1 - edge)) / (tw / 2);   // speed at the turn's edges
    const L1 = b - a, ra = (k.accelUp ?? 0.3) * L1, rd = (k.decelUp ?? 0.25) * L1, V1 = (edge - (vt * rd) / 2) / (ra / 2 + (L1 - ra - rd) + rd / 2);
    const L2 = d - c, ra2 = (k.accelDown ?? 0.15) * L2, rd2 = (k.decelDown ?? 0.2) * L2, V2 = (edge - (vt * ra2) / 2) / (ra2 / 2 + (L2 - ra2 - rd2) + rd2 / 2);
    // velocity knots [t, v]; position is the integral (trapezoids between knots)
    const knots = [[a, 0], [a + ra, V1], [b - rd, V1], [b, vt], [c, -vt], [c + ra2, -V2], [d - rd2, -V2], [d, 0]];
    return (t) => {
      if (t <= a) return 0; if (t >= d) return 0;
      let w = 0;
      for (let i = 0; i < knots.length - 1; i++) {
        const [t0, v0] = knots[i], [t1, v1] = knots[i + 1]; if (t <= t0) break;
        const te = Math.min(t, t1), ve = v0 + ((v1 - v0) * (te - t0)) / (t1 - t0 || 1); w += ((v0 + ve) / 2) * (te - t0);
      }
      return clamp(w);
    };
  };
  (g.Morphs = g.Morphs || {}).paperRoll = paperRoll;
})(typeof window !== "undefined" ? window : globalThis);
