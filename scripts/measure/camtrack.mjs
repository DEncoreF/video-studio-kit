// node camtrack.mjs <dir> <a> <b> [sel=.world] — seeks the film at 60 Hz over [a,b], reads the camera element's transform,
// prints the screen-space speed profile summary: stops between moves, peak acceleration
import { resolve } from "node:path"; import { openFilm } from "../lib/film-page.mjs";
const [dir, a, b, sel = ".world"] = process.argv.slice(2), root = resolve(dir);
const film = await openFilm(root), p = await film.open();
const out = await p.evaluate(([a, b, sel]) => { const tl = Object.values(window.__timelines)[0], el = document.querySelector(sel), r = [];
  for (let t = a; t <= b; t += 1 / 60) { tl.seek(t, false); const m = new DOMMatrix(getComputedStyle(el).transform); r.push([t, m.a, m.e, m.f]); } return r; }, [+a, +b, sel]);
await film.close();
// screen speed of the frame's centre content + zoom speed (px/s at the frame edge)
const sp = []; for (let i = 1; i < out.length; i++) { const [t, z, x, y] = out[i], [, z0, x0, y0] = out[i - 1]; const dz = Math.abs(Math.log(z / z0)) * 960, cx = (960 - x) / z, cx0 = (960 - x0) / z0, cy = (540 - y) / z, cy0 = (540 - y0) / z0;
  sp.push([t, (Math.hypot((cx - cx0) * z, (cy - cy0) * z) + dz) * 60]); }
let stops = 0, moving = false, still = 0; const acc = [];
for (let i = 1; i < sp.length; i++) { acc.push(Math.abs(sp[i][1] - sp[i - 1][1]) * 60); const m = sp[i][1] > 60; if (m && !moving && still > 0 && still < 30) stops++; if (m) still = 0; else still++; moving = m; }
acc.sort((p, q) => q - p);
console.log(JSON.stringify({ range: [a, b], stopsShorterThanHalfSecond: stops, peakAccel_p99: Math.round(acc[Math.floor(acc.length * .01)]), peakSpeed: Math.round(Math.max(...sp.map((s) => s[1]))) }));
