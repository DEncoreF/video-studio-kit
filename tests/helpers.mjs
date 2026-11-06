// Shared helpers for the regression tests (node --test tests/). Each test works on its own
// copy under tests/.tmp/ so the real videos and libraries are never touched.
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

export const root = decodeURIComponent(new URL("..", import.meta.url).pathname);
export const TMP = join(root, "tests/.tmp");
export const fixture = (...p) => join(root, "tests/fixtures", ...p);

// Every script run gets a throwaway personal layer, so tests never read or write the real one.
export const PROFILE = join(TMP, "_profile");
// HyperFrames keeps a per-project history (~29 MB of CJK fonts per test project, a new entry per
// fresh() run, kept 14 days) in ~/.cache/hyperframes/history; keep the tests' history in tests/.tmp
// (npm test clears it first).
export const HF_HISTORY = join(TMP, "_hf-history");
export function node(script, args, env = {}) {
  const r = spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, VSO_PROFILE: PROFILE, HYPERFRAMES_HISTORY_ROOT: HF_HISTORY, ...env }, maxBuffer: 64 << 20 });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

export function fresh(name) {
  const d = join(TMP, name);
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  return d;
}

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
/** Hash of every file in a folder except QA's own outputs. */
export function fingerprint(dir, skip = /^(QA\.md|qa\/|approval\.json)/) {
  return Object.fromEntries(walk(dir).map((f) => relative(dir, f)).filter((f) => !skip.test(f)).sort()
    .map((f) => [f, createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")]));
}

/**
 * A tiny 4-second HyperFrames film: one caption line and one full-frame image, with the
 * brand kit applied and an asset library that records the image (licence etc. from `entry`).
 */
export function qaVideo(name, { kit = "kestrel", image = "filter-bar-medical.png", caption = "部門的 AI，部門自己管", narration = null, entry = {} } = {}) {
  const v = fresh(name);
  mkdirSync(join(v, "assets/screens"), { recursive: true });
  mkdirSync(join(v, "vendor"), { recursive: true });
  copyFileSync(fixture("images", image), join(v, "assets/screens", image));
  copyFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), join(v, "vendor/gsap.min.js"));
  writeFileSync(join(v, "index.html"), `<!doctype html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
<style>@font-face { font-family: 'Noto Sans TC'; src: url('fonts/NotoSansTC-VF.ttf'); font-weight: 100 900; }
html, body { margin: 0; } #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #fff; font-family: 'Noto Sans TC', sans-serif; }
#shot { position: absolute; left: 160px; top: 200px; width: 1600px; } #cap { position: absolute; left: 160px; top: 760px; font-size: 64px; font-weight: 700; }</style></head>
<body><div id="root" data-composition-id="qa" data-start="0" data-width="1920" data-height="1080" data-duration="4">
<img id="shot" src="assets/screens/${image}" alt=""><div id="cap">${caption}</div></div>
<script src="vendor/gsap.min.js"></script>
<script>const tl = gsap.timeline({ paused: true }); tl.from("#cap", { opacity: 0, duration: 0.4 }, 0.2); tl.set({}, {}, 4);
window.__timelines = window.__timelines || {}; window.__timelines["qa"] = tl;</script></body></html>
`);
  if (narration) writeFileSync(join(v, "narration.json"), JSON.stringify({ voice: "zh-TW-YunJheNeural", lines: narration }, null, 1));
  let r = node("scripts/brand-kit.mjs", ["apply", kit, v]); if (r.code) throw new Error(r.out);
  r = node("scripts/assets.mjs", ["init", v, "--brand", kit, "--name", name]); if (r.code) throw new Error(r.out);
  const plan = join(v, "plan.tmp.json");
  writeFileSync(plan, JSON.stringify([{ file: join(v, "assets/screens", image), type: "screenshot", captured: new Date().toISOString().slice(0, 10), source: "test fixture", license: "company-owned", ...entry }]));
  r = node("scripts/assets.mjs", ["add-plan", v, plan]); if (r.code) throw new Error(r.out);
  rmSync(plan);
  return v;
}

export const report = (v) => JSON.parse(readFileSync(join(v, "qa/report.json"), "utf8"));
export const findingsOf = (rep, check) => rep.findings.filter((f) => f.check === check);
export { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, join };
