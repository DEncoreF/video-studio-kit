// What the gallery shows besides styles: the 40 named text effects, the named camera moves, the HyperFrames registry, the
// reference sites, and the links between all of them (the 關係圖 tab). Links come only from fields
// someone wrote down (a reference's direction / effects / source_site, a text effect's registry
// component, a recipe naming an effect), never from guessing, so the graph is the same every time.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, PERSONAL_EFFECTS, REF_SITES, TOOL, VIDEOS } from "./paths.mjs";

const readEffects = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
/**
 * The built-in named text effects plus the user's own list (<profile>/text-effects.json), merged by
 * id: the user's names and notes win, and a field they leave out keeps the built-in value.
 */
export function textEffects() {
  const base = readEffects(join(TOOL, "library/text-effects.json"))?.effects ?? [], mine = readEffects(PERSONAL_EFFECTS);
  const out = base.map((e) => ({ ...e, from: ["built-in"] }));
  for (const e of mine?.effects ?? []) {
    const old = out.find((x) => x.id === e.id);
    const own = /^\(/.test(e.hyperframes ?? "") && old ? { ...e, hyperframes: old.hyperframes } : e; // keep a real component over "(GSAP 自製)"
    if (old) Object.assign(old, own, { from: ["built-in", "mine"], also: { zh: old.zh, en: old.en } });
    else out.push({ ...e, from: ["mine"] });
  }
  return out;
}
export const effectGroups = () => readEffects(PERSONAL_EFFECTS)?.groups ?? {};
/** The named camera moves (library/motion/camera-presets.json): names, look, GSAP recipe, measured path. */
export const cameraPresets = () => readEffects(join(TOOL, "library/motion/camera-presets.json"))?.presets ?? [];
/** Registry component names a text effect points at ("(blueprint dataviz-countup)" → none). */
export const effectComponents = (fx) => (/^\(/.test(fx.hyperframes) ? [] : String(fx.hyperframes).split(/[,、/\s]+/).filter(Boolean));

const subdirs = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith(".")).map((x) => x.name) : []);
/** Film ids: bare folders in videos/, and a project's films/* and tests/* as "<project>/films/<film>". */
export const videoNames = () => subdirs(VIDEOS).flatMap((n) => (existsSync(join(VIDEOS, n, "PROJECT.md"))
  ? ["films", "tests"].flatMap((k) => subdirs(join(VIDEOS, n, k)).map((f) => `${n}/${k}/${f}`)) : [n])).sort();

/** Where scripts/registry-previews.mjs keeps local previews for one CLI version. */
export const previewDir = (version) => join(CACHE, `registry-previews-${version}`);

/**
 * The registry list, from `hyperframes catalog --json` (bundled with the installed CLI, no network).
 * Cached per CLI version, because the first call takes a few seconds.
 */
let pending = null;
export function registry() {
  if (pending) return pending;
  const bin = join(TOOL, "node_modules/hyperframes/bin/hyperframes.mjs");
  if (!existsSync(bin)) return (pending = Promise.resolve({ items: [], error: "HyperFrames 沒有安裝（npm install）" }));
  const version = JSON.parse(readFileSync(join(TOOL, "node_modules/hyperframes/package.json"), "utf8")).version;
  const file = join(CACHE, `registry-${version}.json`);
  if (existsSync(file)) return (pending = Promise.resolve({ version, items: JSON.parse(readFileSync(file, "utf8")) }));
  pending = new Promise((done) => execFile(process.execPath, [bin, "catalog", "--json"], { maxBuffer: 64 << 20, env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" } }, (err, out) => {
    try {
      const items = JSON.parse(out);
      mkdirSync(CACHE, { recursive: true }); writeFileSync(file, JSON.stringify(items));
      done({ version, items });
    } catch { pending = null; done({ version, items: [], error: `讀不到 registry：${err?.message ?? "格式不符"}` }); }
  }));
  return pending;
}

/**
 * reference-sites.md → [{ category, name, url, note }]. A site is a markdown link that starts a
 * paragraph or the first cell of a table row; the nearest "## " heading is its category.
 */
export function parseSites(md) {
  const out = []; let category = "";
  for (const line of md.split("\n")) {
    const hd = line.match(/^##\s+(.*)$/); if (hd) { category = hd[1].trim(); continue; }
    const m = line.match(/^\|\s*\[([^\]]+)\]\((https?:[^)]+)\)\s*\|\s*(.*?)\s*\|\s*$/) ?? line.match(/^\[([^\]]+)\]\((https?:[^)]+)\)[：:]\s*(.*)$/);
    if (m) out.push({ category, name: m[1].trim(), url: m[2].trim(), note: m[3].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim() });
  }
  return out;
}

/** Curated sites plus sites added from the gallery or CLI (refs with kind "site"), one per URL; a site listed under two headings keeps both. */
export function sites(refs) {
  const list = [];
  const put = (s) => { const old = list.find((x) => x.url === s.url); if (old) { if (!old.categories.includes(s.category)) old.categories.push(s.category); } else list.push({ ...s, categories: [s.category] }); };
  if (existsSync(REF_SITES)) for (const s of parseSites(readFileSync(REF_SITES, "utf8"))) put({ ...s, from: "list" });
  for (const r of refs) if (r.kind === "site") put({ category: r.category || "其他", name: r.title, url: r.url, note: r.why, from: "added", date: r.date });
  return list.map(({ category, ...s }) => s);
}
/** A reference that is really a site (curated or added as one) belongs on the 參考網站 tab, not 參考. */
export const isSite = (r, siteList) => r.kind === "site" || siteList.some((s) => s.url === r.url);

/** Nodes and edges for the 關係圖 tab. Registry items join only when something links to them. */
export function graph({ families = {}, styles, refs, effects, siteList, registryItems }) {
  const nodes = new Map(), edges = [];
  const node = (id, type, label, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, ...extra }); return id; };
  const edge = (a, b, why) => { if (a && b && a !== b && !edges.some((e) => e.a === a && e.b === b)) edges.push({ a, b, why }); };
  const reg = new Map(registryItems.map((i) => [i.name, i]));
  const regNode = (name) => (reg.has(name) ? node(`registry:${name}`, "registry", reg.get(name).title || name, { key: name }) : null);
  for (const [id, f] of Object.entries(families)) node(`family:${id}`, "family", f.zh, { key: id });
  for (const s of styles) { node(`style:${s.id}`, "style", s.zh, { key: s.id }); if (families[s.family]) edge(`style:${s.id}`, `family:${s.family}`, "呈現效果"); }
  for (const f of effects) { node(`effect:${f.id}`, "effect", f.zh, { key: f.id }); for (const c of effectComponents(f)) edge(`effect:${f.id}`, regNode(c), "對應元件"); }
  for (const s of siteList) node(`site:${s.url}`, "site", s.name, { key: s.url });
  const effectBy = (x) => effects.find((f) => f.id === x || f.zh === x || f.en.toLowerCase() === String(x).toLowerCase());
  for (const r of refs) {
    if (isSite(r, siteList)) continue;
    const id = node(`ref:${r.url}`, "ref", r.title, { key: r.url });
    if (r.direction) edge(id, nodes.has(`style:${r.direction}`) ? `style:${r.direction}` : node(`tag:方向：${r.direction}`, "tag", `方向：${r.direction}`, { key: r.direction }), "參考方向");
    if (r.source_site) { const s = siteList.find((x) => r.source_site.startsWith(x.url) || x.url.startsWith(r.source_site)); if (s) edge(id, `site:${s.url}`, "出處"); }
    for (const x of r.effects ?? []) { const f = effectBy(x); edge(id, f ? `effect:${f.id}` : regNode(x), "用到的效果"); }
    for (const t of r.tags ?? []) edge(id, node(`tag:${t}`, "tag", t, { key: t }), "標籤");
  }
  for (const [id, f] of Object.entries(families)) for (const x of f.textEffects ?? []) if (nodes.has(`effect:${x}`)) edge(`family:${id}`, `effect:${x}`, "建議文字效果");
  for (const s of styles) {
    const text = s.raw ?? "";
    for (const f of effects) if (text.includes(f.zh) && f.zh.length > 1) edge(`style:${s.id}`, `effect:${f.id}`, "配方提到");
    for (const [name] of reg) if (name.length > 6 && text.includes(name)) edge(`style:${s.id}`, regNode(name), "配方提到");
  }
  return { nodes: [...nodes.values()], edges };
}
