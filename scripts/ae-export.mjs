// HyperFrames → After Effects: rebuilds a film as an After Effects project script (.jsx) with one layer per animated element.
//
//   node scripts/ae-export.mjs <film dir> [--out <dir>] [--pad 160] [--check 0.5,8.4,…]
//
// It plays the film's own GSAP timeline in Chrome frame by frame and, for every element the timeline moves (and every
// scene host), records its full 2D matrix (the CSS transforms of its whole ancestor chain, on a transform-free layout), its
// effective opacity, Gaussian blur, clip shapes and look (text, colours). Each element becomes a picture (a transparent PNG
// of the element at rest, its animated children cut out to their own layers) placed by parented After Effects layers whose
// Anchor / Position / Scale / Rotation / Opacity keys, masks and Gaussian Blur effects reproduce the frames. What can't be a
// moving picture becomes an image sequence: animated SVG drawings (stroke draws, path morphs) and CSS mask-image. Text is
// pictures, not text layers; a change of look (a colour tween, new text) is two pictures crossfading.
//
// Writes <out>/<comp>.jsx (run it in After Effects: File > Scripts > Run Script File…), <out>/layers/*.png, <out>/seq/*/,
// <out>/layers.json, and <out>/preview.html, which rebuilds the frames from the same data with After Effects' rules (parent
// chains, anchors, masks; Gaussian blur approximated) so the export is checked against the film without After Effects:
// --check compares those frames with the film's own (PSNR) and writes <out>/check/.
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "./lib/serve.mjs";
import { openFilm } from "./lib/film-page.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dir = resolve(args[0] ?? "."), out = resolve(opt("--out", join(dir, "ae"))), PAD = +opt("--pad", 160), OFF = 1200;
const TOOL = resolve(fileURLToPath(import.meta.url), "../..");
const film = await openFilm(dir), { browser } = film;
const page = await film.open({ setup: (page) => page.on("pageerror", (e) => console.log("pageerror:", e.message)) });
await page.evaluate(() => document.fonts.ready.then(() => 1));
await page.addScriptTag({ path: join(TOOL, "scripts/ae/page.js") });
const info = await page.evaluate(() => window.__ae.info);
await page.setViewportSize({ width: info.W, height: info.H });
const t0 = Date.now();
console.log(`${info.name}: ${info.W}×${info.H}, ${info.FPS} fps, ${info.DUR} s (${info.NF} frames)`);
console.log("discover:", await page.evaluate(() => window.__ae.discover()));
await page.evaluate(() => window.__ae.alloc());
for (let f = 0; f < info.NF; f += 60) {
  await page.evaluate(([a, b]) => window.__ae.sample(a, b), [f, Math.min(info.NF, f + 60)]);
  if (f % 600 === 0) console.log(`  sampled ${f}/${info.NF} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const plan = await page.evaluate(() => window.__ae.plan());
await page.evaluate(() => window.__ae.tagNodes());
console.log(`plan: ${plan.length} layers (${plan.filter((l) => l.kind === "footage").length} pictures, ${plan.filter((l) => l.kind === "null").length} nulls, ${plan.filter((l) => l.kind === "seq").length} sequences)`);

// ---- pictures ----
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "layers"), { recursive: true }); await mkdir(join(out, "seq"), { recursive: true });
const safe = (s) => s.replace(/[^\w\-.·]+/g, "_").replace(/_+/g, "_").slice(0, 48);
await page.addStyleTag({ content: `
  html.ae-cap, html.ae-cap body { background: transparent !important; overflow: visible !important; width: auto !important; height: auto !important; }
  html.ae-cap body { padding: ${OFF}px !important; margin: 0 !important; }
  html.ae-cap [data-composition-id] { background: transparent !important; overflow: visible !important; }
  html.ae-cap *, html.ae-cap *::before, html.ae-cap *::after { visibility: hidden !important; }
  html.ae-cap .ae-show, html.ae-cap .ae-show::before, html.ae-cap .ae-show::after { visibility: visible !important; }
  html.ae-cap .ae-anc { transform: none !important; opacity: 1 !important; clip-path: none !important; filter: none !important; overflow: visible !important; -webkit-mask-image: none !important; mask-image: none !important; }
  html.ae-cap .ae-tgt { opacity: 1 !important; clip-path: none !important; }
  html.ae-seq, html.ae-seq body, html.ae-seq [data-composition-id] { background: transparent !important; }
  html.ae-seq *, html.ae-seq *::before, html.ae-seq *::after { visibility: hidden !important; }
  html.ae-seq .ae-show, html.ae-seq .ae-show::before, html.ae-seq .ae-show::after { visibility: visible !important; }
  html.ae-bg *, html.ae-bg *::before, html.ae-bg *::after { visibility: hidden !important; }
  html.ae-bg [data-composition-id] { visibility: visible !important; }` });
// image sequences, in screen space, over the frames where they show (before the pictures: the page is still at film size)
await page.addStyleTag({ content: `
  html.ae-seq, html.ae-seq body, html.ae-seq [data-composition-id] { background: transparent !important; }
  html.ae-seq *, html.ae-seq *::before, html.ae-seq *::after { visibility: hidden !important; }
  html.ae-seq .ae-show, html.ae-seq .ae-show::before, html.ae-seq .ae-show::after { visibility: visible !important; }` });
const seqDirs = new Map();
for (const L of plan.filter((l) => l.kind === "seq")) {
  const d = `${String(L.id).padStart(3, "0")}-${safe(L.name)}`; await mkdir(join(out, "seq", d), { recursive: true }); seqDirs.set(L.id, d);
  await page.evaluate((sel) => { document.documentElement.classList.add("ae-seq"); const el = document.querySelector(sel);
    const walk = (x) => { x.classList.add("ae-show"); for (const c of x.children) walk(c); }; walk(el); }, L.sel);
  const race = (p, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), 20000))]);
  for (let f = L.f0; f <= L.f1; f++) {
    await race(page.evaluate(([f, fps]) => { Object.values(window.__timelines)[0].seek(f / fps, false); return 1; }, [f, info.FPS]), "seek");
    await page.screenshot({ path: join(out, "seq", d, `${d}_${String(f - L.f0).padStart(5, "0")}.png`), clip: { x: 0, y: 0, width: info.W, height: info.H }, omitBackground: true, timeout: 30000 });
  }
  await page.evaluate(() => { document.documentElement.classList.remove("ae-seq"); document.querySelectorAll(".ae-show").forEach((x) => x.classList.remove("ae-show")); });
  console.log(`  sequence ${d}: frames ${L.f0}–${L.f1} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// the composition root's own background (gradient) as the bottom layer
await page.evaluate(() => document.documentElement.classList.add("ae-bg"));
await page.screenshot({ path: join(out, "layers/000-background.png"), clip: { x: 0, y: 0, width: info.W, height: info.H } });
await page.evaluate(() => document.documentElement.classList.remove("ae-bg"));
// one picture per footage layer: seek to its capture frame, neutralize its ancestors (no transform, opacity, clip, filter,
// overflow), keep only it and its static content visible, bake its skew if any, and grab its box plus a margin
await page.setViewportSize({ width: OFF * 2 + info.W * 2 + 400, height: OFF * 2 + info.H * 3 + 400 });
const caps = {};
const pngName = new Map();
const grab = (L, f) => page.evaluate(({ sel, cap, shear, fps }) => {
    const tl = Object.values(window.__timelines)[0]; tl.seek(cap / fps, false);
    const el = document.querySelector(sel), root = document.querySelector("[data-composition-id]");
    document.documentElement.classList.add("ae-cap");
    const saved = el.getAttribute("style");
    const anc = []; for (let x = el.parentElement; x && x !== root; x = x.parentElement) { x.classList.add("ae-anc"); anc.push(x); }
    const show = []; const walk = (x) => { x.classList.add("ae-show"); show.push(x); for (const c of x.children) if (!c.hasAttribute("data-ae-node")) walk(c); }; walk(el);
    el.classList.add("ae-tgt");
    const cs = getComputedStyle(el);
    const o = cs.transformOrigin.split(" ").map(parseFloat);
    el.style.setProperty("transform", shear ? `translate(${o[0]}px,${o[1]}px) matrix(1,0,${shear},1,0,0) translate(${-o[0]}px,${-o[1]}px)` : "none", "important");
    el.style.setProperty("transform-origin", "0 0", "important");
    const keep = cs.filter && cs.filter !== "none" ? cs.filter.replace(/url\([^)]*\)/g, "").trim() : "";
    el.style.setProperty("filter", keep || "none", "important");
    const b = el.getBoundingClientRect();
    window.__aeUndo = () => { if (saved === null) el.removeAttribute("style"); else el.setAttribute("style", saved);
      anc.forEach((x) => x.classList.remove("ae-anc")); show.forEach((x) => x.classList.remove("ae-show")); el.classList.remove("ae-tgt"); document.documentElement.classList.remove("ae-cap"); return 1; };
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, { sel: L.sel, cap: f, shear: L.shear, fps: info.FPS });
for (const L of plan.filter((l) => l.kind === "footage")) {
  const r = await grab(L, L.cap);
  const cx = Math.floor(r.x - PAD), cy = Math.floor(r.y - PAD), cw = Math.ceil(r.x + r.w + PAD) - cx, ch = Math.ceil(r.y + r.h + PAD) - cy;
  const name = `${String(L.id).padStart(3, "0")}-${safe(L.name)}.png`;
  await page.screenshot({ path: join(out, "layers", name), clip: { x: cx, y: cy, width: cw, height: ch }, omitBackground: true, timeout: 30000 });
  await page.evaluate(() => window.__aeUndo());
  caps[L.id] = { ox: r.x - cx, oy: r.y - cy, w: cw, h: ch }; pngName.set(L.id, name);
}
for (const L of plan.filter((l) => l.kind === "tseq")) {
  const d = `${String(L.id).padStart(3, "0")}-${safe(L.name)}`; await mkdir(join(out, "seq", d), { recursive: true }); seqDirs.set(L.id, d);
  const cw = Math.ceil(L.maxW + Math.abs(L.shear || 0) * L.maxH) + 2 * PAD + 2, ch = Math.ceil(L.maxH) + 2 * PAD + 2;
  for (let f = L.f0; f <= L.f1; f++) {
    const r = await grab(L, f);
    const cx = Math.floor(r.x - PAD), cy = Math.floor(r.y - PAD);
    await page.screenshot({ path: join(out, "seq", d, `${d}_${String(f - L.f0).padStart(5, "0")}.png`), clip: { x: cx, y: cy, width: cw, height: ch }, omitBackground: true, timeout: 30000 });
    await page.evaluate(() => window.__aeUndo());
    if (f === L.f0) caps[L.id] = { ox: r.x - cx, oy: r.y - cy, w: cw, h: ch };
  }
}
console.log(`  ${Object.keys(caps).length} pictures (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---- the layer values ----
const layers = await page.evaluate((caps) => window.__ae.finalize(caps), caps);
layers.forEach((L) => { if (L.kind === "footage") L.file = `layers/${pngName.get(L.id)}`; if (L.kind === "seq" || L.kind === "tseq") L.dir = `seq/${seqDirs.get(L.id)}`; });
const data = { comp: info.name, W: info.W, H: info.H, FPS: info.FPS, DUR: info.DUR, background: "layers/000-background.png", layers };
await writeFile(join(out, "layers.json"), JSON.stringify(data));

// ---- the After Effects script (ExtendScript, ES3) ----
const r3 = (x) => Math.round(x * 1000) / 1000;
const arr = (a) => "[" + a.map((x) => (Array.isArray(x) ? arr(x) : r3(x))).join(",") + "]";
const q = (s) => JSON.stringify(s);
let jsx = `// ${data.comp} — rebuilt from HyperFrames by video-studio-toolkit/scripts/ae-export.mjs (${new Date().toISOString().slice(0, 10)}).
// Run in After Effects: File > Scripts > Run Script File… (keep this file next to its layers/ and seq/ folders).
// One layer per animated element: pictures (PNG) placed by parented layers with linear keys on Anchor, Position, Scale,
// Rotation and Opacity; clips are masks (intersected); motion blur is Gaussian Blur effects; animated SVG drawings and
// masked elements are image sequences. Times are frames / ${data.FPS}.
(function () {
  var FPS = ${data.FPS}, DUR = ${data.DUR}, W = ${data.W}, H = ${data.H};
  var base = (new File($.fileName)).parent.fsName;
  app.beginUndoGroup("Import ${data.comp} from HyperFrames");
  var comp = app.project.items.addComp(${q(data.comp + " (HyperFrames)")}, W, H, 1, DUR, FPS);
  var folder = app.project.items.addFolder(${q(data.comp + " layers")});
  function imp(rel, seq) {
    var io = new ImportOptions(new File(base + "/" + rel));
    if (seq) { io.sequence = true; io.forceAlphabetical = true; }
    var it = app.project.importFile(io); it.parentFolder = folder;
    if (seq) { it.mainSource.conformFrameRate = FPS; }
    return it;
  }
  function tp(L) { return L.property("ADBE Transform Group"); }
  function keys(prop, k, dim) { // k: [[frame, v…], …]
    if (k.length === 1) { prop.setValue(dim === 1 ? k[0][1] : [k[0][1], k[0][2]]); return; }
    var ts = [], vs = [];
    for (var i = 0; i < k.length; i++) { ts.push(k[i][0] / FPS); vs.push(dim === 1 ? k[i][1] : [k[i][1], k[i][2]]); }
    prop.setValuesAtTimes(ts, vs);
  }
  function shape(a, n) {
    var s = new Shape(), v = [], it = [], ot = [];
    for (var i = 0; i < n; i++) { v.push([a[2 * i], a[2 * i + 1]]); it.push([a[2 * n + 2 * i], a[2 * n + 2 * i + 1]]); ot.push([a[4 * n + 2 * i], a[4 * n + 2 * i + 1]]); }
    s.vertices = v; s.inTangents = it; s.outTangents = ot; s.closed = true; return s;
  }
  function masks(L, ms) {
    for (var j = 0; j < ms.length; j++) {
      var m = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
      m.maskMode = j === 0 ? MaskMode.ADD : MaskMode.INTERSECT;
      var p = m.property("ADBE Mask Shape"), k = ms[j].k, n = ms[j].n;
      if (k.length === 1) { p.setValue(shape(k[0].slice(1), n)); continue; }
      var ts = [], vs = [];
      for (var i = 0; i < k.length; i++) { ts.push(k[i][0] / FPS); vs.push(shape(k[i].slice(1), n)); }
      p.setValuesAtTimes(ts, vs);
    }
  }
  function blur(L, k) { // k: [[frame, σx, σy], …]; Blurriness ≈ 2.4 σ
    var dims = [[1, 2], [2, 3]];
    for (var d = 0; d < 2; d++) {
      var any = false; for (var i = 0; i < k.length; i++) if (k[i][1 + d] > 0.05) any = true;
      if (!any) continue;
      var fx = L.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
      fx.property("ADBE Gaussian Blur 2-0002").setValue(dims[d][1]);
      fx.property("ADBE Gaussian Blur 2-0003").setValue(0);
      var kk = []; for (var j = 0; j < k.length; j++) kk.push([k[j][0], k[j][1 + d] * 2.4]);
      keys(fx.property("ADBE Gaussian Blur 2-0001"), kk, 1);
    }
  }
  var Ls = {};
  var bg = comp.layers.add(imp(${q(data.background)})); bg.name = "background"; tp(bg).property("ADBE Anchor Point").setValue([0, 0]); tp(bg).property("ADBE Position").setValue([0, 0]);
  function make(d) {
    var L;
    if (d.kind === "null") { L = comp.layers.addNull(DUR); L.name = d.name; }
    else if (d.kind === "seq" || d.kind === "tseq") { L = comp.layers.add(imp(d.file, true)); L.name = d.name; L.startTime = d.f0 / FPS; }
    else { L = comp.layers.add(imp(d.file)); L.name = d.name; }
    Ls[d.id] = L; return L;
  }
  function place(d) {
    var L = Ls[d.id];
    if (d.parent >= 0) L.parent = Ls[d.parent];
    if (d.kind === "seq") { tp(L).property("ADBE Anchor Point").setValue([0, 0]); tp(L).property("ADBE Position").setValue([0, 0]); return; }
    tp(L).property("ADBE Anchor Point").setValue(d.a);
    keys(tp(L).property("ADBE Position"), d.p, 2);
    keys(tp(L).property("ADBE Scale"), d.s, 2);
    keys(tp(L).property("ADBE Rotate Z"), d.r, 1);
    keys(tp(L).property("ADBE Opacity"), d.o, 1);
    if (d.m) masks(L, d.m);
    if (d.b) blur(L, d.b);
    if (d.kind === "footage" || d.kind === "tseq") { L.inPoint = d.f0 / FPS; L.outPoint = Math.min(DUR, (d.f1 + 1) / FPS); }
  }
  var D = [
`;
const rows = [];
for (const L of layers) {
  const d = { id: L.id, kind: L.kind, name: L.name, parent: L.parent, f0: L.f0, f1: L.f1 };
  let s = `{id:${d.id},kind:${q(d.kind)},name:${q(d.name)},parent:${d.parent},f0:${d.f0},f1:${d.f1}`;
  if (L.kind === "footage") s += `,file:${q(L.file)}`;
  if (L.kind === "seq" || L.kind === "tseq") s += `,file:${q(`${L.dir}/${basename(L.dir)}_00000.png`)}`;
  if (L.kind !== "seq") {
    s += `,a:${arr(L.anchor)},p:${arr(L.pos)},s:${arr(L.scale)},r:${arr(L.rot)},o:${arr(L.op)}`;
    if (L.masks) s += `,m:[${L.masks.map((m) => `{n:${m.n},k:${arr(m.keys)}}`).join(",")}]`;
    if (L.blur) s += `,b:${arr(L.blur)}`;
  }
  rows.push(s + "}");
}
jsx += "    " + rows.join(",\n    ") + `
  ];
  for (var i = 0; i < D.length; i++) make(D[i]);   // back to front: each new layer goes on top
  for (var j = 0; j < D.length; j++) place(D[j]);
  comp.openInViewer();
  app.endUndoGroup();
})();
`;
// ExtendScript reads a script in the system encoding: keep the file ASCII (non-ASCII as \u escapes; in comments they stay readable enough)
jsx = jsx.replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const jsxName = `${data.comp}.jsx`;
await writeFile(join(out, jsxName), jsx);

// ---- preview.html: the same data under After Effects' rules, in the browser ----
const preview = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}#c{position:relative;width:${data.W}px;height:${data.H}px;overflow:hidden}
#c div,#c img{position:absolute;left:0;top:0;transform-origin:0 0}</style></head><body><div id="c"></div><script>
const D=${JSON.stringify(data)};
const c=document.getElementById("c"), el={};
const bg=document.createElement("img"); bg.src=D.background; c.appendChild(bg);
const val=(k,f)=>{ if(!k) return null; if(f<=k[0][0]) return k[0].slice(1); for(let i=1;i<k.length;i++){ if(f<=k[i][0]){ const a=k[i-1],b=k[i],u=(f-a[0])/(b[0]-a[0]); return a.slice(1).map((x,j)=>x+(b[j+1]-x)*u);} } return k[k.length-1].slice(1); };
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
for(const L of D.layers){ const w=document.createElement("div"); let inner=w;
  (L.masks||[]).forEach(()=>{ const d=document.createElement("div"); inner.appendChild(d); inner=d; });
  if(L.kind!=="null"){ const im=document.createElement("img"); inner.appendChild(im); w._img=im; }
  w._inner=w; c.appendChild(w); el[L.id]=w; }
const local=(L,f)=>{ const p=val(L.pos,f),s=val(L.scale,f),r=val(L.rot,f)[0]*Math.PI/180,a=L.anchor; const cs=Math.cos(r),sn=Math.sin(r);
  return mul(mul([1,0,0,1,p[0],p[1]],[cs,sn,-sn,cs,0,0]),mul([s[0]/100,0,0,s[1]/100,0,0],[1,0,0,1,-a[0],-a[1]])); };
const world=(L,f)=>L.parent>=0?mul(world(D.layers.find(x=>x.id===L.parent),f),local(L,f)):local(L,f);
window.seekPreview=(f)=>{ for(const L of D.layers){ const w=el[L.id];
  if(L.kind==="seq"){ const on=f>=L.f0&&f<=L.f1; w.style.display=on?"":"none"; if(on){ w._img.src=L.dir+"/"+L.dir.split("/").pop()+"_"+String(f-L.f0).padStart(5,"0")+".png"; } continue; }
  if(L.kind==="null"){ w.style.display="none"; continue; }
  const on=f>=L.f0&&f<=L.f1; w.style.display=on?"":"none"; if(!on) continue;
  w._img.src=L.kind==="tseq"?L.dir+"/"+L.dir.split("/").pop()+"_"+String(f-L.f0).padStart(5,"0")+".png":L.file; const m=world(L,f); w.style.transform="matrix("+m.join(",")+")"; w.style.opacity=val(L.op,f)[0]/100;
  const b=L.blur?val(L.blur,f):[0,0]; w._img.style.filter=(b[0]+b[1])>0.1?"blur("+((b[0]+b[1])/2)+"px)":"";
  let d=w; (L.masks||[]).forEach((M)=>{ d=d.firstChild; const v=val(M.keys,f), n=M.n, pts=[]; for(let i=0;i<n;i++) pts.push(v[2*i]+"px "+v[2*i+1]+"px");
    d.style.width=L.png.w+"px"; d.style.height=L.png.h+"px"; d.style.clipPath="polygon("+pts.join(",")+")"; }); }
  return Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;})));
};
</script></body></html>`;
await writeFile(join(out, "preview.html"), preview);
console.log(`wrote ${join(out, jsxName)} (${(jsx.length / 1e6).toFixed(1)} MB), layers.json, preview.html (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---- check: preview frames against the film's frames ----
const checkAt = opt("--check", null);
if (checkAt) {
  await mkdir(join(out, "check"), { recursive: true });
  const srv2 = serve(out);
  const pv = await browser.newPage({ viewport: { width: info.W, height: info.H } });
  await pv.goto(`http://127.0.0.1:${srv2.address().port}/preview.html`);
  const FF = execFileSync(process.execPath, ["-e", "console.log(require('ffmpeg-static'))"], { cwd: TOOL, encoding: "utf8" }).trim();
  const fresh = await film.open({ viewport: { width: info.W, height: info.H } });
  await fresh.evaluate(() => { Object.values(window.__timelines)[0].seek(0.02, false); return document.fonts.ready.then(() => 1); });
  const lines = [];
  for (const t of checkAt.split(",").map(Number)) {
    const f = Math.round(t * info.FPS);
    await fresh.evaluate(([f, fps]) => { Object.values(window.__timelines)[0].seek(f / fps, false); return 1; }, [f, info.FPS]);   // return a value: the timeline object would not serialize
    await fresh.waitForTimeout(50);
    const a = join(out, "check", `film-${t}.png`), b = join(out, "check", `ae-${t}.png`);
    await fresh.screenshot({ path: a });
    await pv.evaluate((f) => window.seekPreview(f).then(() => 1), f); await pv.waitForTimeout(80);
    await pv.screenshot({ path: b });
    const ps = spawnSync(FF, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
    const m = ps.match(/average:([\d.]+|inf)/);
    lines.push(`${t.toFixed(2)} s  PSNR ${m ? m[1] : "?"} dB`);
    execFileSync(FF, ["-y", "-loglevel", "error", "-i", a, "-i", b, "-filter_complex", "[0][1]hstack,scale=1920:-1", join(out, "check", `pair-${t}.jpg`)]);
  }
  await writeFile(join(out, "check/psnr.txt"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  srv2.close();
}
await film.close();
