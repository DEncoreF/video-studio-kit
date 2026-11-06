// node seek.mjs <dir> <out-prefix> <t,t,…> [scale] — loads <dir>/index.html (WebGL on), waits for the film's timeline,
// seeks to each time and saves <out-prefix>-<t>.png; prints console errors
import { resolve } from "node:path"; import { openFilm, seek } from "../lib/film-page.mjs";
const [dir, out, list, scale = "1"] = process.argv.slice(2), root = resolve(dir);
const film = await openFilm(root);
const p = await film.open({ scale: +scale, setup: (p) => { p.on("pageerror", (e) => console.log("pageerror:", e.message, e.stack?.split("\n")[1])); p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300))); } });
for (const t of list.split(",").map(Number)) {
  await seek(p, t);
  await p.waitForTimeout(60);
  await p.screenshot({ path: `${out}-${t.toFixed(2)}.png` });
}
await film.close();
