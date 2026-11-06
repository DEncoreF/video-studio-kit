// The film's own timeline as a list of events, so sound cues come from the picture instead of being typed by hand
// (hand-typed sync points measured 8–11 frames off in Cinetic's pipeline; research/ai-animation-cases-B.md).
//
//   node scripts/timeline-events.mjs <film dir> [--out <film>/build/events.json] [--html index.html] [--timeout 60000]
//
// Loads the film headless (the HyperFrames browser, like ae-export.mjs), waits for window.__timelines, and walks every
// registered GSAP timeline down to its tweens and sets. Each one becomes an event in film time (nested timelines' offsets
// and time scales applied; a sub-composition's timeline is shifted by its host's data-start):
//   { t, dur, end, kind: "tween" | "set" | "call", timeline, label?, props: ["x", "opacity", …], ease?, easeUnknown? (GSAP cannot read it and silently uses its default), repeat?,
//     targets: [{ id, classes, tag, sfx }], sfx: ["whoosh", …] }
// sfx is every data-sfx attribute on the targets (or the tween's own vars.data.sfx / vars.sfx). Writes
// { film, generated, duration, timelines, labels: [{ name, t }], events: [...] } sorted by t, and prints how many have sfx.
// A cue sheet is then a filter: events.filter((e) => e.sfx.length).map((e) => ({ t: e.t, sfx: e.sfx[0] })).
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { openFilm } from "./lib/film-page.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith("--")) { console.error("usage: timeline-events.mjs <film dir> [--out build/events.json] [--html index.html] [--timeout 60000]"); process.exit(1); }
const dir = resolve(args[0]), html = opt("--html", "index.html"), out = resolve(dir, opt("--out", "build/events.json"));
if (!existsSync(join(dir, html))) { console.error(`timeline-events: no ${join(dir, html)}`); process.exit(1); }
const film = await openFilm(dir, { webgl: false });
try {
  const page = await film.open({ html, timeout: +opt("--timeout", 60000), setup: (page) => page.on("pageerror", (e) => console.log("pageerror:", e.message)) });
  const R = await page.evaluate(() => {
    const r3 = (x) => Math.round(x * 1000) / 1000, SKIP = new Set(["duration", "delay", "ease", "repeat", "yoyo", "repeatDelay", "stagger", "overwrite", "immediateRender", "lazy",
      "onStart", "onUpdate", "onComplete", "onRepeat", "onReverseComplete", "callbackScope", "paused", "data", "id", "sfx", "runBackwards", "startAt", "parent", "keyframes", "inherit", "onInterrupt"]);
    const root = document.querySelector("[data-composition-id]")?.getAttribute("data-composition-id");
    const describe = (x) => {
      if (!(x instanceof Element)) return { id: null, classes: [], tag: typeof x, sfx: null };
      const cls = typeof x.className === "string" ? x.className : x.className?.baseVal ?? "";
      return { id: x.id || null, classes: cls.split(/\s+/).filter(Boolean), tag: x.tagName.toLowerCase(), sfx: x.getAttribute("data-sfx") };
    };
    const events = [], labels = [];
    const walk = (tl, name, offset, factor) => {
      for (const [l, t] of Object.entries(tl.labels ?? {})) labels.push({ name: l, timeline: name, t: r3(offset + t * factor) });
      for (const c of tl.getChildren(false, true, true)) {
        const t = offset + c.startTime() * factor, f = factor / (c.timeScale() || 1);
        if (typeof c.getChildren === "function") { walk(c, name, t, f); continue; }
        const vars = c.vars ?? {}, dur = c.totalDuration() * f, targets = typeof c.targets === "function" ? c.targets().map(describe) : [];
        const kind = c.duration() > 0 ? "tween" : vars.onComplete && targets.every((x) => x.tag === "function") ? "call" : "set";
        const own = [vars.data?.sfx, vars.sfx].filter((s) => typeof s === "string");
        const sfx = [...new Set([...own, ...targets.map((x) => x.sfx).filter(Boolean)])];
        events.push({ t: r3(t), dur: r3(dur), end: r3(t + dur), kind, timeline: name, props: Object.keys(vars).filter((k) => !SKIP.has(k)),
          ...(typeof vars.ease === "string" ? { ease: vars.ease, ...(/cubic-bezier/.test(vars.ease) || (window.gsap && !gsap.parseEase(vars.ease, null)) ? { easeUnknown: true } : {}) } : {}), ...(c.repeat?.() ? { repeat: c.repeat() } : {}), targets, sfx });
      }
    };
    const names = Object.keys(window.__timelines);
    for (const n of names) {
      const host = n === root ? null : document.querySelector(`[data-composition-id="${CSS.escape(n)}"]`);
      walk(window.__timelines[n], n, host ? +(host.getAttribute("data-start") ?? 0) || 0 : 0, 1);
    }
    const main = window.__timelines[root] ?? window.__timelines[names[0]];
    return { timelines: names, duration: r3(main.duration()), labels: labels.sort((a, b) => a.t - b.t), events: events.sort((a, b) => a.t - b.t) };
  });
  // attach the nearest label before each event (where it sits in the film's own vocabulary)
  for (const e of R.events) { const l = R.labels.filter((x) => x.timeline === e.timeline && x.t <= e.t + 1e-6).at(-1); if (l) e.label = l.name; }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ film: dir, generated: new Date().toISOString(), ...R }, null, 1) + "\n");
  const withSfx = R.events.filter((e) => e.sfx.length);
  console.log(`timeline-events: ${R.timelines.join(", ")} · ${R.duration} s · ${R.events.length} events (${R.events.filter((e) => e.kind === "set").length} sets), ${withSfx.length} with data-sfx, ${R.labels.length} labels → ${relative(process.cwd(), out) || out}`);
  for (const e of withSfx.slice(0, 20)) console.log(`  ${e.t.toFixed(3).padStart(8)} s  ${e.sfx.join("+").padEnd(14)} ${e.targets.map((x) => (x.id ? `#${x.id}` : x.classes[0] ? `.${x.classes[0]}` : x.tag)).join(" ")}`);
} finally {
  await film.close();
}
