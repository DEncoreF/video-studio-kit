// Load a film headless in the HyperFrames browser and wait for its GSAP timeline: one copy of what ae-export,
// timeline-events and measure/* each carried and drifted on (seek and camtrack hardcoded the tool path; timeouts and
// WebGL flags differ per caller, so they stay options here).
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { serve } from "./serve.mjs";

const TOOL = resolve(new URL("../..", import.meta.url).pathname);
const WEBGL = ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"];

/** Serve `dir` and launch the browser (WebGL on unless `webgl: false`); `film.open()` loads a page, `film.close()` ends both. */
export async function openFilm(dir, { webgl = true } = {}) {
  const { chromium } = await import(join(TOOL, "node_modules/playwright-core/index.mjs"));
  const server = serve(dir);
  const exe = execFileSync(process.execPath, [join(TOOL, "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
  const browser = await chromium.launch({ executablePath: exe, ...(webgl && { args: WEBGL }) });
  // setup(page) runs before load (listeners). With `optional`, a film with no window.__timelines gives null instead of throwing.
  const open = async ({ viewport = { width: 1920, height: 1080 }, scale, html = "index.html", query = "", timeout = 60000, optional = false, setup } = {}) => {
    const page = await browser.newPage({ viewport, ...(scale && { deviceScaleFactor: scale }) });
    setup?.(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/${html}${query ? "?" + query : ""}`);
    const ok = await page.waitForFunction(() => !!(window.__timelines && Object.values(window.__timelines)[0]), null, { timeout })
      .then(() => true, (e) => { if (!optional) throw e; return false; });
    return ok ? page : null;
  };
  return { browser, server, open, close: async () => { await browser.close(); server.close(); } };
}

/** Seek the film's first timeline to `t` s (the evaluate returns 1: a timeline does not serialise). */
export const seek = (page, t) => page.evaluate((t) => { Object.values(window.__timelines)[0].seek(t, false); return 1; }, t);
