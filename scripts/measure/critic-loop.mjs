// The critic loop for a 3D shot drawn in the browser against its Cycles reference frames (video-direction references/3d-bake.md):
// screenshot the composition at given times, measure regions against the reference (luminance ±tol, hue ±15°), and build a
// side-by-side sheet (each row: reference | ours) for the realism and the bug-hunting look.
//   node scripts/measure/critic-loop.mjs <filmDir> --ref <frames/f%04d.png> --at 1,4,8.8 [--fps 30] [--first 1]
//        [--regions regions.json] [--crop x,y,w,h] [--query "key=value&…"] [--out dir] [--tol 0.1]
// regions.json: { "pool": [x0, y0, x1, y1], … } for every time, or { "1": { … }, "4": { … } } per time (full-frame px).
// --query is passed to index.html (calibration knobs the composition reads, e.g. "lamp=1.2&n=16").
// Writes <out>/ours-<t>.png, <out>/sheet.jpg, <out>/report.json; prints one line per region and exits 1 if any fails.
import { mkdir, writeFile } from "node:fs/promises"; import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module";
import { compareRegion } from "../lib/critic.mjs"; import { openFilm, seek } from "../lib/film-page.mjs";
const TOOL = resolve(new URL("../..", import.meta.url).pathname), require = createRequire(join(TOOL, "package.json")), FF = require("ffmpeg-static");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const film = resolve(args[0] ?? "."), ref = opt("ref"), times = String(opt("at", "1")).split(",").map(Number), fps = +opt("fps", 30), first = +opt("first", 1);
const out = resolve(opt("out", join(film, ".critic"))), tol = +opt("tol", 0.1), query = opt("query", ""), crop = opt("crop");
if (!ref) { console.error("usage: critic-loop.mjs <filmDir> --ref <frames/f%04d.png> --at 1,4 [--regions r.json] [--crop x,y,w,h] [--query …]"); process.exit(1); }
const regionsAll = opt("regions") ? JSON.parse(readFileSync(resolve(opt("regions")), "utf8")) : {};
const regionsAt = (t) => (Object.keys(regionsAll).every((k) => !isNaN(+k)) ? regionsAll[String(t)] ?? {} : regionsAll);
const refFrame = (t) => ref.replace(/%0(\d)d/, (_, n) => String(Math.round(t * fps) + first).padStart(+n, "0"));
await mkdir(out, { recursive: true });

// screenshots: load the film (WebGL on) and seek its timeline
const session = await openFilm(film);
const page = await session.open({ query, timeout: 120000, setup: (page) => { page.on("pageerror", (e) => console.error("pageerror:", e.message)); page.on("console", (m) => m.type() === "error" && console.error("console:", m.text().split("\n").slice(0, 3).join(" | "))); } });
for (const t of times) { await seek(page, t); await page.waitForTimeout(60); await page.screenshot({ path: join(out, `ours-${t}.png`) }); }
await session.close();

// regions: area-averaged colour via ffmpeg
const mean = (f, [x0, y0, x1, y1]) => [...execFileSync(FF, ["-v", "error", "-i", f, "-vf", `scale=1920:1080,crop=${x1 - x0}:${y1 - y0}:${x0}:${y0},scale=1:1:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])];
const report = []; let fails = 0;
for (const t of times) {
  const rf = refFrame(t); if (!existsSync(rf)) { console.error(`no reference frame for ${t}s: ${rf}`); continue; }
  for (const [name, box] of Object.entries(regionsAt(t))) {
    const r = mean(rf, box), o = mean(join(out, `ours-${t}.png`), box), c = compareRegion(r, o, { tol });
    report.push({ t, name, ref: r, ours: o, ...c }); if (!c.pass) fails++;
    console.log(`${c.pass ? "✓" : "✗"} ${String(t).padStart(5)}s ${name.padEnd(14)} ref ${r.join(",").padEnd(11)} ours ${o.join(",").padEnd(11)} ΔL ${(c.dL * 100).toFixed(0).padStart(4)}%  Δhue ${c.dHue === null ? "  –" : c.dHue.toFixed(0).padStart(3) + "°"}`);
  }
}
// the sheet: one row per time, reference | ours (cropped when --crop is given)
const cr = crop ? `crop=${crop.split(",").slice(2).join(":")}:${crop.split(",").slice(0, 2).join(":")},` : "", w = crop ? 560 : 800;
const inputs = times.flatMap((t) => ["-i", refFrame(t), "-i", join(out, `ours-${t}.png`)]);
const fc = times.map((_, i) => `[${2 * i}]scale=1920:1080,${cr}scale=${w}:-2[a${i}];[${2 * i + 1}]scale=1920:1080,${cr}scale=${w}:-2[b${i}];[a${i}][b${i}]hstack[r${i}]`).join(";") +
  ";" + times.map((_, i) => `[r${i}]`).join("") + (times.length > 1 ? `vstack=${times.length}` : "null");
execFileSync(FF, ["-v", "error", "-y", ...inputs, "-filter_complex", fc, "-frames:v", "1", join(out, "sheet.jpg")]);
await writeFile(join(out, "report.json"), JSON.stringify({ film, ref, times, tol, query, report }, null, 1) + "\n");
console.log(`${report.length - fails}/${report.length} regions within ±${tol * 100}% · sheet ${join(out, "sheet.jpg")}`);
process.exit(fails ? 1 : 0);
