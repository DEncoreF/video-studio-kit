#!/usr/bin/env node
// Local previews for HyperFrames registry items whose catalog preview is missing or broken (about
// two thirds of them: most components have no preview, and some links answer 403). Each item is
// installed into a throwaway project and snapshotted at 4 moments; the gallery shows the middle
// frame and flips through all 4 on hover. Blocks are full compositions; a component is pasted into
// a host composition and driven by the "Timeline integration" lines from its own file, unless it is
// a sub-composition of its own (data-composition-id), which is mounted like a block. The stage is
// near-black like a HyperFrames blank project; an item with nothing bright on it is shot again on light.
// Results are rebuildable, so they live in the cache (lib/paths.mjs CACHE), keyed by CLI version.
//   node scripts/registry-previews.mjs [name…] [--all] [--force] [--jobs 3]
// With no names: every item without a working upstream preview. --all: every item.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { TOOL } from "./lib/paths.mjs";
import { previewDir, registry } from "./lib/library.mjs";

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const names = args.filter((a, i) => !a.startsWith("--") && !["--jobs"].includes(args[i - 1]));
const JOBS = +opt("jobs", 3);
// The throwaway _work projects keep their HyperFrames history in _work too, so it goes when _work does.
const hf = (a, timeout = 120000) => run(process.execPath, [join(TOOL, "scripts/hf.mjs"), ...a], { timeout, maxBuffer: 32 << 20, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_HISTORY_ROOT: join(PREVIEWS, "_work", "_hf-history") } });

const { version, items } = await registry();
if (!items.length) { console.error("registry list is empty"); process.exit(1); }
const PREVIEWS = previewDir(version);
const INDEX = join(PREVIEWS, "index.json");
mkdirSync(PREVIEWS, { recursive: true });
const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};
const save = () => writeFileSync(INDEX, JSON.stringify(index, null, 1));

// Which upstream previews actually load (checked once per item, kept in the index).
const status = async (u) => { if (!u) return null; try { return (await fetch(u, { method: "HEAD" })).status; } catch { return 0; } };
await Promise.all(items.map(async (i) => {
  const e = (index[i.name] ??= {});
  if (e.upstream) return;
  e.upstream = { poster: await status(i.preview?.poster), video: await status(i.preview?.video) };
}));
save();
const upstreamOk = (i) => index[i.name].upstream.poster === 200 || index[i.name].upstream.video === 200;

const host = (w, h, dur, body, script, bg = "#f4f2ec") => `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=${w}, height=${h}">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
#root{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Inter,ui-sans-serif,system-ui,sans-serif;--brand:#725ff7}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${w}" data-height="${h}">
${body}
</div>
<script>window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); const startTime = 0.3;
try { ${script} } catch (e) { console.error("timeline recipe failed", e); }
tl.set({}, {}, ${dur}); window.__timelines["main"] = tl; tl.seek(0);</script>
</body></html>`;

/** The tl.… statements in a component's comments (its "Timeline integration" recipe; may span lines). */
function recipe(html) {
  const out = [];
  for (const [, c] of html.matchAll(/<!--([\s\S]*?)-->/g)) {
    let cur = "";
    for (const line of c.split("\n")) {
      const t = line.trim();
      if (!cur && !/^tl\./.test(t)) continue;
      cur += (cur ? "\n" : "") + t;
      if (/\)\s*;\s*$/.test(t)) { out.push(cur); cur = ""; }
    }
  }
  return out.join("\n");
}

// Darkest / brightest luma in a frame (0–255), to tell whether anything shows on the stage colour.
async function luma(file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file, "-vf", "signalstats,metadata=print", "-f", "null", "-"]);
  const v = (k) => +(stderr.match(new RegExp(`lavfi\\.signalstats\\.${k}=(\\d+)`))?.[1] ?? 0);
  return { min: v("YMIN"), max: v("YMAX") };
}

async function build(item) {
  const work = join(PREVIEWS, "_work", item.name), dir = join(PREVIEWS, item.name);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }));
  writeFileSync(join(work, "index.html"), host(1920, 1080, 1, "", ""));
  const { stdout } = await hf(["add", item.name, "--dir", work, "--json", "--no-clipboard"]);
  const added = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const w = item.dimensions?.width ?? 1920, h = item.dimensions?.height ?? 1080;
  let dur = item.duration ?? 4, body, script = "", mode = "block";
  const mount = (id, src) => `<div data-composition-id="${id}" data-composition-src="${src}" data-start="0" data-duration="${dur}" data-width="${w}" data-height="${h}" data-track-index="0"></div>`;
  if (item.type === "block") body = added.snippet.replace("<div ", '<div data-start="0" data-track-index="0" ');
  else {
    const file = added.written.find((f) => f.endsWith(".html"));
    const html = readFileSync(file, "utf8"), id = html.match(/data-composition-id="([^"]+)"/)?.[1];
    if (id) { // a sub-composition with its own timeline
      mode = "mounted"; dur = +(html.match(/data-composition-duration="([\d.]+)"/)?.[1] ?? 4);
      body = mount(id, file.slice(work.length + 1));
    } else {
      mode = "pasted"; script = recipe(html);
      const durs = [...script.matchAll(/duration:\s*([\d.]+)/g)].map((m) => +m[1]);
      dur = Math.min(8, Math.max(3, 0.6 + (durs.length ? Math.max(...durs) : 3)));
      body = `<div style="width:100%;height:100%;position:relative;display:flex;align-items:center;justify-content:center">${html.replace(/<!--[\s\S]*?-->/g, "")}</div>`;
    }
  }
  const at = [0.2, 0.45, 0.7, 0.92].map((f) => +(f * dur).toFixed(2));
  const shoot = async (bg) => {
    writeFileSync(join(work, "index.html"), host(w, h, dur, body, script, bg));
    rmSync(join(work, "shots"), { recursive: true, force: true });
    await hf(["snapshot", work, "--at", at.join(","), "--no-end", "--keep", "-o", join(work, "shots"), "--describe", "false"], 180000);
    const shots = readdirSync(join(work, "shots")).filter((f) => f.endsWith(".png")).sort((a, b) => parseFloat(a.slice(3)) - parseFloat(b.slice(3)));
    if (!shots.length) throw new Error("no frames");
    return { shots, l: await Promise.all(shots.map((f) => luma(join(work, "shots", f)))) };
  };
  let bg = "dark", r = await shoot("#141518");
  if (r.l.every((x) => x.max < 110)) { bg = "light"; r = await shoot("#f4f2ec"); } // nothing bright on the dark stage
  const empty = bg === "light" && r.l.every((x) => x.min > 200);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const frames = [];
  for (const [k, f] of r.shots.entries()) {
    const out = `frame-${k}.jpg`;
    await run(ffmpeg, ["-y", "-loglevel", "error", "-i", join(work, "shots", f), "-vf", "scale=640:-2", "-q:v", "4", join(dir, out)]);
    frames.push(out);
  }
  rmSync(work, { recursive: true, force: true });
  return { frames, mode, bg, empty, recipe: mode === "pasted" ? Boolean(script) : undefined };
}

const todo = items.filter((i) => (names.length ? names.includes(i.name) : args.includes("--all") || !upstreamOk(i)))
  .filter((i) => args.includes("--force") || names.length || !index[i.name].frames);
console.log(`${todo.length} item(s) to preview → ${PREVIEWS}`);
let done = 0, failed = 0;
const queue = [...todo];
await Promise.all(Array.from({ length: JOBS }, async () => {
  for (let item; (item = queue.shift());) {
    try { Object.assign(index[item.name], await build(item), { error: undefined, at: new Date().toISOString() }); done++; }
    catch (e) { index[item.name].error = String(e.message).split("\n")[0].slice(0, 300); failed++; }
    save();
    process.stdout.write(`\r${done + failed}/${todo.length} (${failed} failed) ${item.name.padEnd(40)}`);
  }
}));
rmSync(join(PREVIEWS, "_work"), { recursive: true, force: true });
console.log(`\ndone: ${done} previewed, ${failed} failed`);
