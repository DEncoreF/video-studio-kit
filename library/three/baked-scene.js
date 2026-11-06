// A Blender scene drawn by three.js from its bake (scripts/blender/bake.py): Blender lights it once, the browser draws every
// frame in a HyperFrames composition — about 0.09 s a frame against Cycles' 17–22 s (an earlier film's opening, 2026-10-24).
// Copy this file into the film's assets/js (films are self-contained) and pass in the film's own three.js:
//
//   import * as THREE from "../../vendor/three/three.module.min.js";
//   import { EXRLoader } from "../../vendor/three/EXRLoader.js";                       (three/examples/jsm, same version)
//   import { RectAreaLightUniformsLib } from "../../vendor/three/RectAreaLightUniformsLib.js";
//   import { bakedScene } from "./baked-scene.js";
//   const film = await bakedScene({ THREE, EXRLoader, RectAreaLightUniformsLib, canvas, base: "assets/bake/",
//     screens: { screen: { canvas: myCanvas, emission: [0.95, 0.9, 0.82], reflect: 3 } } });
//   film.render(t, { glow: 0.75, screens: { screen: 1 } });   // t in seconds; glow and screen levels are the film's (0..1)
//
// What it does: diffuse = baked colour × baked light (blended between the two poses of a hinged part by the frame's pose
// weight, plus an emitter's glow); reflections and highlights are real time (the same HDRI, the scene's lights, each screen
// as an area light); view-baked heroes are drawn unlit from the nearest two camera-view bakes; depth of field and motion
// blur are accumulated like a film camera (N jittered renders a frame over the aperture and the shutter, averaged in linear
// light), then AgX and Blender's "Medium High Contrast" look as a power curve. render(t) depends on t only.
//
// Pitfalls hit on the first film (each cost a round):
//   1. renderer.autoClear wipes the accumulation target on every add: only the last sample survives, at 1/N brightness.
//      Clear by hand (done here).
//   2. EXRLoader returns half floats (Uint16 bits) by default: tinting the data corrupts it (the metal turned copper).
//      setDataType(THREE.FloatType) (done here). The HDRI's turn is mirrored: three.js y = 360° − Blender's rotation.
//   3. An environment map cannot hold an emissive object: metal near a screen misses its reflection. Add the screen as a
//      RectAreaLight that only reflects (done here for every screen with `reflect`).
//   4. Materials that share onBeforeCompile source share one compiled program: give each variant its own
//      customProgramCacheKey (done here), or one material runs another's shader.
// And before calibrating anything: check that the Cycles reference frames were rendered with the CURRENT scene settings.
// C's reference had started before a look-dev pass (flat world, no bevels); the bake looked "wrong" until that was found.
//
// Gains: three.js and Cycles differ in units and tone curve; these defaults are C's calibrated values (five critic rounds,
// scripts/measure/critic-loop.mjs). Recalibrate per film against its Cycles frames; ±10% per region (linear luminance) is the
// target. gains.views = { <name>: k } trims one view-baked object (C: the machine ×1.08, its desk ×1).
export const DEFAULT_GAINS = { lamp: 1.5, rim: 2, env: 0.8, bake: 0.7, spec: 1, exposure: 1, contrast: 1.3, view: 1.1, glow: 1 };
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** Two nearest baked moments for time t: { a, b, w } (held at the ends). */
export function nearestViews(times, t) {
  if (!times.length) return { a: 0, b: 0, w: 0 };
  const k = times.findIndex((v) => t < v);
  if (k === -1) return { a: times.length - 1, b: times.length - 1, w: 0 };
  if (k === 0) return { a: 0, b: 0, w: 0 };
  return { a: k - 1, b: k, w: (t - times[k - 1]) / (times[k] - times[k - 1]) };
}

export async function bakedScene({ THREE, EXRLoader, RectAreaLightUniformsLib, canvas, base = "assets/bake/", width = 1920, height = 1080,
  samples = 32, shutter = 0.5, gains = {}, screens = {}, viewFade = 0.5 }) {
  const GAIN = { ...DEFAULT_GAINS, ...gains }, B = base, W = width, H = height, N = samples;
  const [S, A, K] = await Promise.all(["scene.json", "anim.json", "scales.json"].map((f) => fetch(B + f).then((r) => r.json())));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;   // pitfall 1
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = GAIN.exposure; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0, 0, 0);

  // the world: the same HDRI as Blender, tinted and turned like it (reflections only — its diffuse light is baked)
  if (S.world?.file) {
    const env = await new EXRLoader().setDataType(THREE.FloatType).loadAsync(B + S.world.file); env.mapping = THREE.EquirectangularReflectionMapping;   // pitfall 2
    const tint = S.world.tint ?? [1, 1, 1], d = env.image.data; for (let i = 0; i < d.length; i += 4) { d[i] *= tint[0]; d[i + 1] *= tint[1]; d[i + 2] *= tint[2]; }
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(env).texture; env.dispose();
    scene.environmentIntensity = (S.world.strength ?? 1) * GAIN.env * GAIN.spec; scene.environmentRotation.y = THREE.MathUtils.degToRad(360 - (S.world.rotation ?? 0));
  }
  const tl = new THREE.TextureLoader(), tex = (f) => tl.loadAsync(B + f).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const U = { uK: { value: 1 }, uG: { value: 0 }, uB: { value: GAIN.bake }, uVmix: { value: 0 } };   // pose weight, glow, bake gain, view mix
  async function geometry(name, count) {
    const buf = new Float32Array(await (await fetch(B + name + ".bin")).arrayBuffer()), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buf.subarray(0, count * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(buf.subarray(count * 3, count * 6), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(buf.subarray(count * 6, count * 8), 2));
    return g;
  }

  // view bakes: the nearest two of N camera-view bakes, chosen per frame
  const V = S.view, VT = V?.times ?? [], viewSets = {};
  async function viewUni(name) {
    const vt = await Promise.all(VT.map((_, i) => tex(`${name}-view${i}.png`)));
    const u = { tA: { value: vt[0] }, tB: { value: vt[0] }, sA: { value: 1 }, sB: { value: 1 }, uW: { value: 0 } }; viewSets[name] = { u, vt }; return u;
  }
  async function viewMesh(name, geo, alphaMap) {
    const u = await viewUni(name);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !!alphaMap, alphaMap: alphaMap ?? null, depthWrite: !alphaMap });
    mat.customProgramCacheKey = () => (alphaMap ? "view+alpha" : "view");   // pitfall 4
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = "varying vec2 vBake;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvBake = uv;");
      sh.fragmentShader = "varying vec2 vBake;\nuniform sampler2D tA, tB;\nuniform float sA, sB, uW;\n" + sh.fragmentShader.replace("#include <map_fragment>",
        "diffuseColor.rgb = mix(texture2D(tA, vBake).rgb * sA, texture2D(tB, vBake).rgb * sB, uW);");
      if (alphaMap) sh.fragmentShader = sh.fragmentShader.replace("#include <alphamap_fragment>", "diffuseColor.a *= texture2D(alphaMap, vBake).a;");
    };
    const m = new THREE.Mesh(geo, mat); m.castShadow = !alphaMap; return m;
  }

  // baked groups: diffuse colour black (its light is the bake), metal keeps its colour for real-time reflections
  async function bakedMesh(name, info) {
    const g = await geometry(name, info.count), has = (k) => K[`${name}-${k}`] !== undefined, poses = has("b");
    const maps = { alb: await tex(`${name}-albedo.png`), lb: await tex(poses ? `${name}-b.png` : `${name}-light.png`), la: has("a") ? await tex(`${name}-a.png`) : null, gl: has("glow") ? await tex(`${name}-glow.png`) : null };
    const sb = K[poses ? `${name}-b` : `${name}-light`], dv = V?.groups?.includes(name) ? await viewUni(name) : null;
    const mats = info.materials.map((m, i) => {
      g.addGroup(m.start, m.count, i);
      const mat = new THREE.MeshPhysicalMaterial({ color: m.metal > 0.5 ? new THREE.Color(...m.color) : new THREE.Color(0, 0, 0), metalness: m.metal, roughness: m.rough,
        clearcoat: m.coat, clearcoatRoughness: m.coatRough, emissive: 0xffffff });
      mat.customProgramCacheKey = () => (dv ? "baked+view" : "baked");   // pitfall 4
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, { tAlb: { value: maps.alb }, tLb: { value: maps.lb }, tLa: { value: maps.la ?? maps.lb }, tGl: { value: maps.gl ?? black },
          sLb: { value: sb }, sLa: { value: K[`${name}-a`] ?? sb }, sGl: { value: K[`${name}-glow`] ?? 0 } }, dv ?? {});
        sh.vertexShader = "varying vec2 vBake;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\nvBake = uv;");
        sh.fragmentShader = "varying vec2 vBake;\nuniform sampler2D tAlb, tLb, tLa, tGl;\nuniform float sLb, sLa, sGl, uK, uG, uB;\n" + (dv ? "uniform sampler2D tA, tB;\nuniform float sA, sB, uW, uVmix;\n" : "") +
          sh.fragmentShader.replace("#include <emissivemap_fragment>",
            "vec3 bakedL = mix(texture2D(tLa, vBake).rgb * sLa, texture2D(tLb, vBake).rgb * sLb, uK) + texture2D(tGl, vBake).rgb * sGl * uG;\ntotalEmissiveRadiance = texture2D(tAlb, vBake).rgb * bakedL * uB;" +
            // the view bake is 2048; the 4096 colour carries its grain through as a detail ratio
            (dv ? "\nvec3 viewC = mix(texture2D(tA, vBake).rgb * sA, texture2D(tB, vBake).rgb * sB, uW) * texture2D(tAlb, vBake).rgb / max(texture2D(tAlb, vBake, 1.0).rgb, vec3(1e-3));" : ""));
        if (dv) sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, viewC, uVmix);\n#include <opaque_fragment>");
      };
      return mat;
    });
    const mesh = new THREE.Mesh(g, mats); mesh.castShadow = mesh.receiveShadow = true; return mesh;
  }

  // moving objects (a hinge): a group each, placed per frame from anim.json
  const movers = {};
  const holder = (space) => { if (space === "world") return scene; if (!movers[space]) { const gr = new THREE.Group(); gr.matrixAutoUpdate = false; scene.add(gr); movers[space] = gr; } return movers[space]; };
  for (const [name, info] of Object.entries(S.groups)) holder(info.space).add(await bakedMesh(name, info));
  if (V) {
    scene.add(await viewMesh(V.name, await geometry(V.name, V.count)));
    for (const [name, x] of Object.entries(V.extra ?? {})) scene.add(await viewMesh(name, await geometry(name, x.count), x.image ? await tl.loadAsync(B + x.image) : null));
  }
  // exported meshes (screens): unlit pictures from the film's canvases; with `reflect`, also an area light for reflections (pitfall 3)
  const screenParts = {};
  for (const [name, info] of Object.entries(S.export ?? {})) {
    const cfg = screens[name], geo = await geometry(name, info.count);
    if (!cfg) { holder(info.space).add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000 }))); continue; }
    const t = new THREE.CanvasTexture(cfg.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(...(cfg.emission ?? [1, 1, 1])) })); holder(info.space).add(mesh);
    let light = null;
    if (cfg.reflect) {
      geo.computeBoundingBox(); const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3()), e = bb.getSize(new THREE.Vector3());
      const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0).normalize(), dims = [e.x, e.y, e.z].sort((a, b) => b - a);
      light = new THREE.RectAreaLight(cfg.color ?? 0xfff4ea, 0, dims[0], dims[1]); light.position.copy(c).addScaledVector(n, 0.0005); light.lookAt(c.clone().add(n)); holder(info.space).add(light);
    }
    screenParts[name] = { tex: t, light, cfg };
  }
  // the scene's lights (highlights and reflections only: every diffuse colour is black, its light is the bake)
  for (const L of Object.values(S.lights ?? {})) {
    if (L.type === "SPOT") {
      const l = new THREE.SpotLight(new THREE.Color(...L.color), L.energy / (4 * Math.PI) * GAIN.lamp * GAIN.spec, 0, L.spot / 2, L.blend, 2);
      l.position.set(...L.pos); l.target.position.set(L.pos[0] + L.dir[0], L.pos[1] + L.dir[1], L.pos[2] + L.dir[2]);
      l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.0003; l.shadow.radius = 4; l.shadow.camera.near = 0.2; l.shadow.camera.far = 3; scene.add(l, l.target);
    } else if (L.type === "AREA") {
      const l = new THREE.RectAreaLight(new THREE.Color(...L.color), L.energy / (Math.PI * L.size * L.size) * GAIN.rim * GAIN.spec, L.size, L.size);
      l.position.set(...L.pos); l.lookAt(L.pos[0] + L.dir[0], L.pos[1] + L.dir[1], L.pos[2] + L.dir[2]); scene.add(l);
    } else if (L.type === "POINT") {
      const l = new THREE.PointLight(new THREE.Color(...L.color), L.energy / (4 * Math.PI) * GAIN.lamp * GAIN.spec, 0, 2); l.position.set(...L.pos); scene.add(l);
    }
  }

  // the camera: Blender's per-frame matrix; vertical fov from its sensor fitted to the width
  const cam = new THREE.PerspectiveCamera(); cam.matrixAutoUpdate = false;
  const vfov = 2 * Math.atan((A.sensor / 2 / A.lens) * H / W), near = 0.01, far = 50, aperture = (A.lens / 1000) / (2 * A.fstop);
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), Q1 = new THREE.Quaternion(), S0 = new THREE.Vector3(), S1 = new THREE.Vector3(), M = new THREE.Matrix4();
  const lerpM = (a, b, k) => { M.fromArray(a).decompose(P0, Q0, S0); M.fromArray(b).decompose(P1, Q1, S1); return new THREE.Matrix4().compose(P0.lerp(P1, k), Q0.slerp(Q1, k), S0.lerp(S1, k)); };
  const last = A.frames.length - 1;
  let override = null;   // a camera of the film's own (levels.camera): { position, target, fov (vertical °), focus (m), fstop }
  function place(t, jx, jy) {
    const f = Math.min(last, Math.max(0, t * A.fps)), i = Math.min(last - 1, Math.floor(f)), k = f - i, a = A.frames[i], b = A.frames[i + 1] ?? a;
    let m = lerpM(a.cam, b.cam, k), focus = a.focus + (b.focus - a.focus) * k, fov = vfov, ap = aperture;
    if (override) {
      const o = override, pos = new THREE.Vector3(...o.position), tgt = new THREE.Vector3(...o.target);
      m = new THREE.Matrix4().lookAt(pos, tgt, new THREE.Vector3(0, 1, 0)).setPosition(pos);
      focus = o.focus ?? pos.distanceTo(tgt); fov = THREE.MathUtils.degToRad(o.fov ?? THREE.MathUtils.radToDeg(vfov)); ap = (A.lens / 1000) / (2 * (o.fstop ?? A.fstop));
    }
    const ox = jx * ap, oy = jy * ap;
    cam.matrixWorld.copy(m).multiply(new THREE.Matrix4().makeTranslation(ox, oy, 0)); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const top = near * Math.tan(fov / 2), right = top * W / H, sx = -ox * near / focus, sy = -oy * near / focus;   // the focus plane stays put
    cam.projectionMatrix.makePerspective(-right + sx, right + sx, top + sy, -top + sy, near, far); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    for (const [name, gr] of Object.entries(movers)) if (a.moving?.[name]) { gr.matrix.copy(lerpM(a.moving[name], b.moving[name], k)); gr.matrixWorldNeedsUpdate = true; }
    if (a.pose !== undefined) U.uK.value = a.pose + (b.pose - a.pose) * k;
  }

  // accumulation (N samples over aperture × shutter, summed in a float target), then AgX + the contrast look
  const one = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, samples: 4 });
  const acc = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.PlaneGeometry(2, 2);
  const addScene = new THREE.Scene(), outScene = new THREE.Scene();
  addScene.add(new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: one.texture, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, color: new THREE.Color(1 / N, 1 / N, 1 / N) })));
  outScene.add(new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { tAcc: { value: acc.texture }, uCon: { value: GAIN.contrast } }, depthTest: false, depthWrite: false, toneMapped: true,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform sampler2D tAcc; uniform float uCon; varying vec2 vUv;\nvoid main() { vec3 c = AgXToneMapping(texture2D(tAcc, vUv).rgb); c = sRGBTransferOETF(vec4(max(c, 0.0), 1.0)).rgb; gl_FragColor = vec4(pow(c, vec3(uCon)), 1.0); }" })));
  const tm = renderer.toneMapping, lastView = VT.length ? VT[VT.length - 1] : 0;

  /** Draw time t. levels: { glow (0..1, the emitter's light on the scene), screens: { name: 0..1 }, camera (optional: a camera of
   *  the film's own instead of the baked path — view-baked heroes still show their nearest baked view) } — the film decides them. */
  function render(t, levels = {}) {
    override = levels.camera ?? null;
    for (const [name, p] of Object.entries(screenParts)) { p.tex.needsUpdate = true; if (p.light) p.light.intensity = (levels.screens?.[name] ?? 1) * (p.cfg.lightLevel ?? 0.8) * p.cfg.reflect; }
    U.uG.value = (levels.glow ?? 0) * GAIN.glow;
    if (VT.length) {
      const { a, b, w } = nearestViews(VT, t);
      for (const [name, { u, vt }] of Object.entries(viewSets)) { u.tA.value = vt[a]; u.tB.value = vt[b]; const gv = GAIN.view * (GAIN.views?.[name] ?? 1); u.sA.value = K[`${name}-view${a}`] * gv; u.sB.value = K[`${name}-view${b}`] * gv; u.uW.value = w; }
      U.uVmix.value = 1 - seg(t, lastView - viewFade * 0.6, lastView + viewFade * 0.4);   // groups leave their view bake as the hero leaves the shot
    }
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(acc); renderer.setClearColor(0x000000, 1); renderer.clear();
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(halton(i + 1, 2)), th = 2 * Math.PI * halton(i + 1, 3), ts = t + (halton(i + 1, 5) - 0.5) * shutter / A.fps;
      place(ts, r * Math.cos(th), r * Math.sin(th));
      renderer.setRenderTarget(one); renderer.clear(); renderer.render(scene, cam);
      renderer.setRenderTarget(acc); renderer.render(addScene, quadCam);
    }
    renderer.toneMapping = tm; renderer.setRenderTarget(null); renderer.clear(); renderer.render(outScene, quadCam);
  }
  return { THREE, scene, renderer, camera: cam, render, gains: GAIN };
}
