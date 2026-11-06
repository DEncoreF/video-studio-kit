#!/usr/bin/env node
// Writes HyperFrames audio clips into a video's index.html between
// <!-- hf-audio:start --> and <!-- hf-audio:end -->: one <audio> per narration line (from
// assets/vo/manifest.json) and the music bed with a ducking lane under the narration.
//   node pipelines/audio/clips.mjs videos/<video> [--music assets/music/score.wav] [--duck 0.2] [--bed 0.9]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const video = resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const music = opt("music", "assets/music/score.wav"), duck = +opt("duck", 0.2), bed = +opt("bed", 0.9);
const html = join(video, "index.html");
const page = readFileSync(html, "utf8");
const dur = +(page.match(/data-composition-id="[^"]+"[^>]*data-duration="([\d.]+)"/)?.[1] ?? 60);
const manPath = join(video, "assets/vo/manifest.json");
const vo = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : [];

const lines = vo.map((s) => `<audio id="vo-${s.key}" src="assets/vo/${s.key}.mp3" data-start="${(s.start + s.offset).toFixed(2)}" data-duration="${(s.spoken + 0.2).toFixed(2)}" data-track-index="2" data-volume="1"></audio>`);
if (existsSync(join(video, music))) {
  const pts = [{ t: 0, v: bed }];
  for (const s of vo) {
    const a = s.start + s.offset, b = a + s.captions.at(-1).end;
    pts.push({ t: +(a - 0.15).toFixed(2), v: bed }, { t: +a.toFixed(2), v: duck }, { t: +b.toFixed(2), v: duck }, { t: +(b + 0.3).toFixed(2), v: bed });
  }
  pts.push({ t: dur, v: bed });
  lines.push(`<audio id="music" src="${music}" data-start="0" data-duration="${dur}" data-track-index="3" data-volume="1" data-automation='${JSON.stringify({ version: 1, lanes: [{ target: "volume", points: pts }] })}'></audio>`);
}
const block = `<!-- hf-audio:start -->\n      ${lines.join("\n      ")}\n      <!-- hf-audio:end -->`;
const re = /<!-- hf-audio:start -->[\s\S]*?<!-- hf-audio:end -->/;
if (!re.test(page)) { console.error("index.html needs <!-- hf-audio:start --><!-- hf-audio:end --> inside the root composition"); process.exit(1); }
writeFileSync(html, page.replace(re, block));
console.log(`wrote ${vo.length} narration clips${existsSync(join(video, music)) ? " + music bed with ducking" : ""} into ${html}`);
