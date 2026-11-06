#!/usr/bin/env node
// Style & reference library: style recipes (built-in styles/recipes/*.md plus the user's own in
// <profile>/styles, CSS motif tiles only — no stored videos), the 40 named text effects, the 67 named camera moves, the HyperFrames
// registry, past references (add new ones from the page), reference sites, and a 關係圖 linking them.
// With --video it also shows that video's direction previews (<video>/direction/<style>/ from
// scripts/preview.mjs) as the 本片候選 board.
//   node scripts/gallery.mjs [--video videos/<影片>] [--port 4320]
// Picks are saved to <video>/selection.json (or <profile>/gallery-selection.json without --video);
// references added on the page go through lib/refs.mjs, the same as `refs.mjs add`.
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { GALLERY_SELECTION, INBOX, KITS, PERSONAL_DEMOS, STYLE_ROOTS, TOOL, WORKSPACE, filmId, paletteList, recipePath, styleCatalog } from "./lib/paths.mjs";
import { fileMeta, promptMotionLibrary, sourceMeta } from "./lib/sources.mjs";
import { addRef, checkLink, readRefs, setVerdict } from "./lib/refs.mjs";
import { cameraPresets, effectGroups, graph, isSite, previewDir, registry, sites, textEffects, videoNames } from "./lib/library.mjs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const video = opt("video") ? resolve(opt("video")) : null;
const port = +opt("port", 4320);
const TYPES = { ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4", ".webp": "image/webp", ".gif": "image/gif", ".jpeg": "image/jpeg", ".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".ttf": "font/ttf", ".mp4": "video/mp4", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };

// Recipe = YAML-ish frontmatter + "## 段落" sections. Status/tags come from the recipe (the source
// of truth); catalog.json only supplies the gallery tile tokens.
function recipe(id) {
  const f = recipePath(id);
  if (!f) return { sections: {}, tags: [] };
  const raw = readFileSync(f, "utf8");
  const [, fm = "", body = raw] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
  const meta = Object.fromEntries(fm.split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.trim()]));
  const sections = Object.fromEntries(body.split(/^## /m).slice(1).map((b) => { const i = b.indexOf("\n"); return [b.slice(0, i).trim(), b.slice(i + 1).trim()]; }));
  const tags = (meta.tags ?? "").replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean);
  return { status: meta.status, example: meta.example || null, updated: meta.updated, tags, sections, raw };
}

function candidates() {
  const dir = video && join(video, "direction");
  if (!dir || !existsSync(dir)) return [];
  const rel = (...p) => "/" + ["videos", filmId(video), "direction", ...p].join("/");
  return readdirSync(dir).filter((id) => existsSync(join(dir, id, "meta.json"))).map((id) => {
    const meta = JSON.parse(readFileSync(join(dir, id, "meta.json"), "utf8"));
    const sd = join(dir, id, "stills");
    const stills = existsSync(sd) ? readdirSync(sd).filter((f) => /^frame-.*\.png$/.test(f)).sort().map((f) => rel(id, "stills", f)) : [];
    return { id, source: meta.source, builtAt: meta.builtAt, stills, preview: existsSync(join(dir, id, "preview.mp4")) ? rel(id, "preview.mp4") : null };
  }).sort((a, b) => (b.preview ? 1 : 0) - (a.preview ? 1 : 0));
}

function styles() {
  const catalog = styleCatalog();
  catalog.styles = catalog.styles.map((s) => { const r = recipe(s.id); return { ...s, ...r, status: r.status ?? s.status }; });
  return catalog;
}

function data() {
  const catalog = styles(), all = readRefs(), siteList = sites(all);
  let refs = all.filter((r) => !isSite(r, siteList)).reverse();
  if (video) refs = refs.sort((a, b) => (b.video === filmId(video)) - (a.video === filmId(video)));
  return { catalog, palettes: paletteList(), refs, allRefs: [...all].reverse(), sites: siteList, effects: textEffects(), effectGroups: effectGroups(), cameras: cameraPresets(), videos: videoNames(), video: video ? filmId(video) : null, candidates: candidates() };
}

// Registry list with what will actually show: upstream previews that answer (checked by
// registry-previews.mjs), else the local frames it rendered. Read on every request, so frames
// appear while that script is still running.
async function registryData() {
  const r = await registry();
  if (!r.version) return r;
  const f = join(previewDir(r.version), "index.json");
  let idx = {}; try { idx = JSON.parse(readFileSync(f, "utf8")); } catch {}
  const items = r.items.map((i) => {
    const e = idx[i.name], up = e?.upstream;
    const preview = up ? { poster: up.poster === 200 ? i.preview?.poster : undefined, video: up.video === 200 ? i.preview?.video : undefined } : i.preview;
    const local = e?.frames?.length && !e.empty ? e.frames.map((x) => `/registry-preview/${encodeURIComponent(i.name)}/${x}`) : undefined;
    const previewNote = e?.empty ? "畫面是空的：要疊在影片或圖片上才看得到" : e?.error ? "預覽產生失敗" : undefined;
    return { ...i, preview: preview?.poster || preview?.video ? preview : undefined, local, previewNote };
  });
  return { ...r, items, checked: Object.keys(idx).length > 0 };
}

async function graphData() {
  const all = readRefs(), { items } = await registry();
  const cat = styles();
  return graph({ families: cat.families, styles: cat.styles, refs: all, effects: textEffects(), siteList: sites(all), registryItems: items });
}

const json = (res, code, body) => { res.writeHead(code, { "content-type": TYPES[".json"] }); res.end(JSON.stringify(body)); };
// Writes come only from this page: a JSON body (other sites cannot send one without a CORS preflight,
// which this server never answers) from a localhost origin.
const fromPage = (req) => /^application\/json/.test(req.headers["content-type"] ?? "") && (!req.headers.origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin));
const readBody = (req) => new Promise((done) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { done(JSON.parse(b)); } catch { done(null); } }); });

// URL → file, each prefix inside its own base folder (tool, personal styles, brand kits, this video).
function serve(p) {
  const inside = (base, rel) => { const f = normalize(join(base, rel)); return f.startsWith(base + sep) && existsSync(f) ? f : null; };
  if (p === "/") return inside(TOOL, "gallery/index.html");
  if (p.startsWith("/gallery/")) return inside(TOOL, p.slice(1));
  if (p.startsWith("/styles/")) { for (const r of STYLE_ROOTS) { const f = inside(r, p.slice("/styles/".length)); if (f) return f; } return null; }
  if (p.startsWith("/fonts/")) return inside(join(KITS, "_fonts"), basename(p));
  if (p.startsWith("/brand-kits/")) return inside(KITS, p.slice("/brand-kits/".length));
  if (p.startsWith("/inbox/")) return inside(INBOX, basename(p));
  if (p.startsWith("/registry-preview/") && regVersion) return inside(previewDir(regVersion), p.slice("/registry-preview/".length));
  const m = video && p.match(/^\/videos\/(.+?)\/(direction\/[^/]+\/(?:stills\/[^/]+\.(?:png|jpg)|preview\.mp4))$/);
  return m && m[1] === filmId(video) ? inside(video, m[2]) : null;
}

// A reference that is a file on this machine (e.g. a render of one of our films) is served only if it is
// logged: its exact path is the entry's link or media. Videos are sent in byte ranges so the page can seek.
function localMedia(p) {
  const known = readRefs().some((r) => [r.url, r.media?.video, r.media?.image].includes(p));
  return known && p.startsWith("/") && existsSync(p) && statSync(p).isFile() ? p : null;
}
function sendFile(req, res, file) {
  const size = statSync(file).size, type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const m = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]), z = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (a > z || a >= size) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { "content-type": type, "content-range": `bytes ${a}-${z}/${size}`, "accept-ranges": "bytes", "content-length": z - a + 1 });
    return createReadStream(file, { start: a, end: z }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
  createReadStream(file).pipe(res);
}

const srv = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && !fromPage(req)) { res.writeHead(403); return res.end(); }
  if (req.method === "POST" && url.pathname === "/refs") {
    readBody(req).then(async (f) => {
      if (!f) return json(res, 400, { error: "格式不符" });
      const names = videoNames(), dir = f.video && names.includes(f.video) ? join(WORKSPACE, "videos", f.video) : null;
      if (f.video && !dir) return json(res, 400, { error: `沒有這支影片：${f.video}` });
      // An uploaded image (see /upload) is the only file the page may log, and only from the inbox.
      const file = f.file && resolve(String(f.file)).startsWith(INBOX + sep) ? resolve(String(f.file)) : "";
      const c = file ? { status: "ok" } : await checkLink(String(f.url ?? ""));
      if (c.status === "dead" && !f.force) return json(res, 400, { error: `連結打不開（${c.note}）`, dead: true });
      const meta = file ? await fileMeta(file) : await sourceMeta(String(f.url));
      const r = addRef({ ...meta, ...f, title: f.title || meta.title || "", by: "user", file, checked: { date: new Date().toISOString().slice(0, 10), status: c.status, http: c.http } }, dir);
      if (r.error) return json(res, 400, { error: r.error });
      console.log(`reference logged → ${r.entry.title}`);
      json(res, 200, { entry: r.entry, warning: c.status === "blocked" ? c.note : undefined });
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/refs/verdict") { // 喜歡／不喜歡 on a reference, kept in its log entry
    readBody(req).then((f) => {
      const r = f?.key ? setVerdict(String(f.key), f.v ?? null, f.note) : { error: "格式不符" };
      if (r.error) return json(res, 400, { error: r.error });
      json(res, 200, { entry: r.entry });
    });
    return;
  }
  if (url.pathname === "/local") {
    const f = localMedia(url.searchParams.get("p") ?? "");
    if (!f) { res.writeHead(404); return res.end(); }
    return sendFile(req, res, f);
  }
  if (req.method === "POST" && url.pathname === "/upload") { // an image reference: saved to the inbox, never into a film (D7)
    readBody(req).then((f) => {
      const m = String(f?.data ?? "").match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
      if (!m) return json(res, 400, { error: "只接受 PNG、JPG、WebP、GIF 圖片" });
      const name = `${new Date().toISOString().slice(0, 10)}-${String(f.name ?? "image").replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 60)}`;
      mkdirSync(INBOX, { recursive: true }); const out = join(INBOX, name.includes(".") ? name : `${name}.${m[1]}`);
      writeFileSync(out, Buffer.from(m[2], "base64"));
      json(res, 200, { file: out });
    });
    return;
  }
  if (url.pathname === "/library.json") { // the big library: Prompt Motion, read live (lib/sources.mjs)
    promptMotionLibrary().then((lib) => { const mine = new Set(readRefs().flatMap((r) => [r.url, r.page, r.original].filter(Boolean))); json(res, 200, { ...lib, items: (lib.items ?? []).map((i) => ({ ...i, collected: mine.has(i.url) })) }); });
    return;
  }
  if (url.pathname === "/library/item") { sourceMeta(url.searchParams.get("url") ?? "").then((m) => json(res, 200, m)); return; }
  if (url.pathname === "/registry.json") { registryData().then((r) => json(res, 200, r)); return; }
  if (url.pathname === "/graph.json") { graphData().then((g) => json(res, 200, g)); return; }
  if (req.method === "POST" && url.pathname === "/select") {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      const out = video ? join(video, "selection.json") : GALLERY_SELECTION;
      writeFileSync(out, JSON.stringify(JSON.parse(body), null, 2) + "\n");
      console.log(`selection saved → ${out}`);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end("已送出。請回到 Claude 對話說「選好了」，我才會讀到");
    });
    return;
  }
  if (url.pathname === "/data.json") return json(res, 200, data());
  if (url.pathname === "/personal/effect-demos.js") { res.writeHead(200, { "content-type": TYPES[".js"] }); return res.end(existsSync(PERSONAL_DEMOS) ? readFileSync(PERSONAL_DEMOS) : "window.EFFECT_DEMOS = {};"); }
  const file = serve(decodeURIComponent(url.pathname));
  if (!file) { res.writeHead(404); return res.end(); }
  sendFile(req, res, file);
});
let regVersion = null;
// A second start on a busy port: say whether a gallery is already serving there instead of a stack trace.
srv.on("error", async (e) => {
  if (e.code !== "EADDRINUSE") throw e;
  const ours = await fetch(`http://localhost:${port}/data.json`).then((r) => r.ok).catch(() => false);
  console.error(ours
    ? `gallery 已經在跑：http://localhost:${port}　直接開這個網址就好。要另開一個，加 --port ${port + 1}。`
    : `port ${port} 被其他程式占用，改用 --port ${port + 1}。`);
  process.exit(ours ? 0 : 1);
});
srv.listen(port, "127.0.0.1", () => {
  registry().then((r) => (regVersion = r.version)); // start reading the registry list now, so the tab is ready when opened
  console.log(`gallery on http://localhost:${srv.address().port}${video ? ` (video: ${filmId(video)})` : ""}`); // --port 0 picks a free one
});
