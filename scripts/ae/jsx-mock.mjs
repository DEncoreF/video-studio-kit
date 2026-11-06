// Runs an After Effects script exported by scripts/ae-export.mjs against a small mock of the After Effects object model,
// so the script is checked without After Effects: ExtendScript-only syntax (no let/const/arrow functions/template strings),
// every property it addresses by match name, every keyframe call (equal time/value counts, value shapes, increasing times,
// mask vertex counts fixed per mask), parenting to an existing layer, in/out points inside the comp, files that exist.
//   node scripts/ae/jsx-mock.mjs <export dir>/<comp>.jsx
import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import vm from "node:vm";

const file = process.argv[2];
const src = readFileSync(file, "utf8");
const errors = [];
const err = (m) => { if (errors.length < 40) errors.push(m); };
// ExtendScript is ES3: flag modern syntax outside comments and strings
const code = src.replace(/\/\/[^\n]*/g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
for (const [re, what] of [[/\b(let|const)\s/, "let/const"], [/=>/, "arrow function"], [/`/, "template string"], [/\.\.\./, "spread"], [/\bclass\s/, "class"]])
  if (re.test(code)) err(`ES3: ${what} in the script`);
if (/[^\x00-\x7f]/.test(src.replace(/^﻿/, ""))) err("non-ASCII characters (ExtendScript reads the file in the system encoding)");

const known = new Set(["ADBE Transform Group", "ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity", "ADBE Mask Parade",
  "ADBE Mask Shape", "ADBE Effect Parade", "ADBE Gaussian Blur 2-0001", "ADBE Gaussian Blur 2-0002", "ADBE Gaussian Blur 2-0003"]);
const addable = new Set(["ADBE Mask Atom", "ADBE Gaussian Blur 2"]);
let comp = null, nKeys = 0, nLayers = 0, nMasks = 0, nFx = 0;
class Shape { constructor() { this.vertices = []; this.inTangents = []; this.outTangents = []; this.closed = false; } }
const dimOf = (name) => ({ "ADBE Anchor Point": 2, "ADBE Position": 2, "ADBE Scale": 2, "ADBE Rotate Z": 1, "ADBE Opacity": 1, "ADBE Gaussian Blur 2-0001": 1,
  "ADBE Gaussian Blur 2-0002": 1, "ADBE Gaussian Blur 2-0003": 1, "ADBE Mask Shape": "shape" })[name];
const checkVal = (name, v, where) => { const d = dimOf(name);
  if (d === "shape") { if (!(v instanceof Shape)) return err(`${where}: mask value is not a Shape`);
    const n = v.vertices.length; if (n < 3 || v.inTangents.length !== n || v.outTangents.length !== n || !v.closed) err(`${where}: bad Shape (${n} vertices)`);
    if (v.vertices.flat().some((x) => !Number.isFinite(x))) err(`${where}: non-finite mask vertex`); return n; }
  if (d === 1) { if (typeof v !== "number" || !Number.isFinite(v)) err(`${where}: expected a number, got ${JSON.stringify(v)}`); return 1; }
  if (!Array.isArray(v) || v.length !== d || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) err(`${where}: expected [${d}] numbers, got ${JSON.stringify(v)}`); return d; };
const prop = (name, layer) => { const p = { name, matchName: name, layer, verts: null,
  property(n) { if (!known.has(n)) err(`unknown property "${n}" under "${name}" (layer ${layer.name})`); return prop(n, layer); },
  setValue(v) { const n = checkVal(name, v, `${layer.name}/${name}`); if (dimOf(name) === "shape") this.fixVerts(n); },
  setValuesAtTimes(ts, vs) { if (!Array.isArray(ts) || !Array.isArray(vs) || ts.length !== vs.length) return err(`${layer.name}/${name}: setValuesAtTimes length mismatch`);
    for (let i = 0; i < ts.length; i++) { if (!(ts[i] >= 0 && ts[i] <= comp.duration + 1e-6)) err(`${layer.name}/${name}: key time ${ts[i]} outside the comp`);
      if (i && ts[i] <= ts[i - 1]) err(`${layer.name}/${name}: key times not increasing at ${ts[i]}`);
      const n = checkVal(name, vs[i], `${layer.name}/${name}@${ts[i]}`); if (dimOf(name) === "shape") this.fixVerts(n); }
    nKeys += ts.length; },
  fixVerts(n) { if (this.verts === null) this.verts = n; else if (this.verts !== n) err(`${layer.name}: mask vertex count changes (${this.verts} → ${n})`); },
  addProperty(n) { if (!addable.has(n)) err(`cannot add "${n}" to "${name}"`); if (n === "ADBE Mask Atom") nMasks++; else nFx++;
    const sub = prop(n, layer); sub.maskMode = null; const shapeProp = prop("ADBE Mask Shape", layer); sub.property = (m) => { if (!known.has(m)) err(`unknown property "${m}" under "${n}"`); return m === "ADBE Mask Shape" ? shapeProp : prop(m, layer); }; return sub; } };
  return p; };
const mkLayer = (name) => { nLayers++; const L = { name, parent: null, inPoint: 0, outPoint: comp.duration, startTime: 0, property(n) { if (!known.has(n)) err(`unknown property "${n}" on layer`); return prop(n, L); } }; return L; };
const items = [];
const app = { project: { items: { addComp(name, w, h, par, dur, fps) { comp = { name, width: w, height: h, duration: dur, frameRate: fps, layers: { list: [],
  add(item) { const L = mkLayer(item.name); this.list.unshift(L); return L; }, addNull(d) { const L = mkLayer("Null"); this.list.unshift(L); return L; } }, openInViewer() {} }; return comp; },
  addFolder(name) { return { name }; } },
  importFile(io) { const p = io.file.fsName; if (!existsSync(p)) err(`missing file ${p}`); const it = { name: p.split("/").pop(), parentFolder: null, mainSource: { conformFrameRate: 0 } }; items.push(it); return it; } },
  beginUndoGroup() {}, endUndoGroup() {} };
function File(p) { this.fsName = p; this.parent = { fsName: dirname(p) }; }
function ImportOptions(f) { this.file = f; this.sequence = false; }
const ctx = { app, File, ImportOptions, Shape, MaskMode: { ADD: 1, INTERSECT: 3 }, $: { fileName: file }, Math };
try { vm.runInNewContext(src, ctx, { filename: file }); } catch (e) { err(`runtime: ${e.message}`); }
// parents and timing
if (comp) for (const L of comp.layers.list) {
  if (L.parent && !comp.layers.list.includes(L.parent)) err(`${L.name}: parent is not a layer of the comp`);
  if (L.outPoint < L.inPoint || L.inPoint < 0 || L.outPoint > comp.duration + 1e-6) err(`${L.name}: in/out ${L.inPoint}–${L.outPoint}`);
}
console.log(`${file.split("/").pop()}: ${nLayers} layers, ${items.length} imports, ${nKeys} keys, ${nMasks} masks, ${nFx} effects`);
if (errors.length) { console.log(`✗ ${errors.length} problem(s):\n  ` + errors.join("\n  ")); process.exit(1); } else console.log("✓ runs clean against the mock");
