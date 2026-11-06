// A spotting sheet for a film's sound effects (video-motion-craft references/sound.md §1): one row per effect with the frame,
// the film's own sound around it, the raw effect and the action it belongs to; then the actions that have no sound; then
// the things worth a second look (§7). The user listens and marks each row (keep / drop / swap / move) and copies the
// notes back; nothing here decides for them — the flags are hints with thresholds you can change on the command line.
//
//   node scripts/sound-sheet.mjs <film dir> --spec <edit.py spec json> --video <render with sound>
//        [--events build/events.json] [--out review/sound-sheet] [--sfx-dir <folder of alternatives>]
//        [--density 6] [--same 0.12] [--near 0.25] [--tail -30]
// --tail: a sound of 0.3 s or more that is still above this many dB under its own peak where it stops reads as cut off.
//
// The spec is edit.py's: { sfx: [{ t, file, tier?, ev?, key?, of?, align?, from?, dur? }] } with files relative to the
// spec. Writes <out>/index.html with thumbs/, clips/ and sfx/ next to it, so the folder opens on its own.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith("--") || !opt("--spec") || !opt("--video")) {
  console.error("usage: sound-sheet.mjs <film dir> --spec <spec.json> --video <render.mp4> [--events build/events.json] [--out review/sound-sheet] [--sfx-dir dir] [--density 6] [--same 0.12] [--near 0.25] [--tail -30]");
  process.exit(1);
}
const TOOL = resolve(fileURLToPath(import.meta.url), "../..");
const FF = createRequire(join(TOOL, "package.json"))("ffmpeg-static");
const film = resolve(args[0]), specPath = resolve(film, opt("--spec")), video = resolve(film, opt("--video"));
const out = resolve(film, opt("--out", "review/sound-sheet")), eventsPath = resolve(film, opt("--events", "build/events.json"));
const DENSITY = +opt("--density", 6), SAME = +opt("--same", 0.12), NEAR = +opt("--near", 0.25), TAIL = +opt("--tail", -30);
for (const d of ["thumbs", "clips", "sfx"]) mkdirSync(join(out, d), { recursive: true });

// ---- the effects and what each file looks like (peak position, length, how it ends)
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const wav = (p) => {
  const b = readFileSync(p); let o = 12, fmt, data;
  while (o + 8 <= b.length) { const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4); if (id === "fmt ") fmt = b.subarray(o + 8, o + 8 + n); if (id === "data") data = b.subarray(o + 8, o + 8 + n); o += 8 + n + (n & 1); }
  const ch = fmt.readUInt16LE(2), sr = fmt.readUInt32LE(4), bits = fmt.readUInt16LE(14);
  if (bits !== 16) throw new Error(`${p}: 16-bit WAV only`);
  const n = data.length / 2 / ch, x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch / 32768; }
  return { x, sr };
};
const db = (v) => 20 * Math.log10(Math.max(1e-9, v));
const info = {};
const fileInfo = (f) => {
  if (info[f]) return info[f];
  const { x, sr } = wav(f); let pk = 0, pi = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); pi = i; }
  // how loud it still is where it stops: the 50 ms before the last 30 ms (past any short fade-out), against its own peak
  const at = (stop) => { let m = 0; for (let i = Math.max(0, Math.round((stop - 0.08) * sr)); i < Math.min(x.length, Math.round((stop - 0.03) * sr)); i++) m = Math.max(m, Math.abs(x[i])); return db(m) - db(pk); };
  return (info[f] = { len: x.length / sr, peakAt: pi / sr, at });
};
const cues = (spec.sfx ?? []).map((c, i) => {
  const file = resolve(dirname(specPath), c.file), fi = existsSync(file) ? fileInfo(file) : null;
  const from = c.from ?? 0, len = fi ? Math.min(fi.len - from, c.dur ?? Infinity) : 0;
  // tailDb only for sounds of 0.3 s or more: short ticks and clicks end on their own
  const lead = fi && c.align === "peak" ? Math.max(0, fi.peakAt - from) : 0;   // peak-aligned: the sound starts before t
  return { i, t: c.t, file, name: basename(file), tier: c.tier ?? "", ev: c.ev ?? "", of: c.of ?? null, start: c.t - lead, end: c.t - lead + len,
    lead, len, tailDb: fi && len >= 0.3 ? fi.at(from + len) : null, missing: !fi, flags: [] };
}).sort((a, b) => a.t - b.t);

// ---- the picture's actions (timeline-events): contacts and state changes are short tweens of scale, position, rotation, clip
const ev = existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, "utf8")).events.filter((e) => e.kind === "tween" && e.dur > 0) : [];
if (!ev.length) console.warn(`sound-sheet: no events at ${relative(film, eventsPath)} — run timeline-events.mjs first; rows will have no action names`);
const tgt = (e) => e.targets.map((g) => (g.id ? "#" + g.id : g.classes.length ? "." + g.classes[0] : g.tag)).slice(0, 2).join(" ");
const label = (e) => `${tgt(e)} ${e.props.filter((p) => p !== "ease").slice(0, 3).join("/")}`;
const ACT = ["scale", "scaleX", "scaleY", "x", "y", "xPercent", "yPercent", "rotation", "rotateX", "rotateY", "clipPath"];
const actions = ev.filter((e) => e.dur <= 0.8 && e.props.some((p) => ACT.includes(p)));
for (const c of cues) {
  const near = ev.map((e) => ({ e, d: Math.min(Math.abs(e.t - c.t), Math.abs(e.end - c.t)) })).filter((x) => x.d <= 0.15).sort((a, b) => a.d - b.d)[0];
  c.action = near ? label(near.e) : "";
}
const silent = [];
for (const e of actions) {
  if (cues.some((c) => Math.abs(c.t - e.t) <= NEAR || Math.abs(c.t - e.end) <= NEAR)) continue;
  const last = silent.at(-1);
  if (last && e.t - last.t < 0.15) { last.n++; continue; }   // one row per moment, not per tween
  silent.push({ t: e.t, end: e.end, action: label(e), n: 1 });
}

// ---- hints (§7): two sounds on one action, too dense, a cut-off ending, a swell running under other cues
const main = cues.filter((c) => !c.of);
for (let k = 1; k < main.length; k++) {
  const a = main[k - 1], b = main[k];
  if (b.t - a.t < SAME && (a.tier !== "texture" || b.tier !== "texture") && a.ev !== b.ev) { a.flags.push(`同一格兩個聲音（和 ${b.t.toFixed(2)} 的 ${b.ev || b.name}）`); b.flags.push(`同一格兩個聲音（和 ${a.t.toFixed(2)} 的 ${a.ev || a.name}）`); }
}
for (const c of cues) {
  if (c.tailDb != null && c.tailDb > TAIL) c.flags.push(`結尾被剪斷（停下時只比峰值低 ${(-c.tailDb).toFixed(0)} dB）`);
  if (c.lead > 0.4) { const under = main.filter((o) => o !== c && o.t > c.start && o.t < c.t - 0.05); if (under.length) c.flags.push(`漸強 ${c.lead.toFixed(1)} 秒壓在 ${under.map((o) => `${o.ev || o.name}@${o.t.toFixed(2)}`).join("、")} 上`); }
}
const dur = spec.duration ?? Math.max(0, ...cues.map((c) => c.end)), windows = [];
for (let w = 0; w < dur; w += 10) { const n = main.filter((c) => c.t >= w && c.t < w + 10 && c.tier !== "texture").length; windows.push({ w, n, over: n > DENSITY }); }

// ---- media: a frame and the film's own sound around each moment, the raw files beside them
const ff = (...a) => execFileSync(FF, ["-nostdin", "-loglevel", "error", "-y", ...a]);
const grab = (t, name) => {
  ff("-ss", Math.max(0, t).toFixed(3), "-i", video, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", join(out, "thumbs", name + ".jpg"));
  ff("-ss", Math.max(0, t - 1.2).toFixed(3), "-t", "2.8", "-i", video, "-vn", "-c:a", "aac", "-b:a", "128k", join(out, "clips", name + ".m4a"));
};
cues.forEach((c, k) => grab(c.t, "c" + k));
silent.forEach((s, k) => grab(s.t, "s" + k));
const alt = resolve(film, opt("--sfx-dir", cues[0] ? dirname(cues[0].file) : "."));
const pool = existsSync(alt) ? readdirSync(alt).filter((f) => f.endsWith(".wav")).sort() : [];
for (const f of new Set([...cues.filter((c) => !c.missing).map((c) => c.file), ...pool.map((f) => join(alt, f))])) copyFileSync(f, join(out, "sfx", basename(f)));

// ---- the page
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);
const opts = (sel) => pool.map((f) => `<option${f === sel ? " selected" : ""}>${esc(f)}</option>`).join("");
const flagged = cues.filter((c) => c.flags.length).length + windows.filter((w) => w.over).length;
const row = (c, k) => `<tr id="c${k}" data-id="c${k}" data-t="${c.t.toFixed(2)}" data-what="${esc(c.ev || c.name)}"${c.of ? ' class="layer"' : ""}>
  <td class="n">${k + 1}</td><td class="t">${c.t.toFixed(2)}</td><td><img src="thumbs/c${k}.jpg" alt="" loading="lazy"></td>
  <td><b>${esc(c.ev || "—")}</b>${c.of ? ` <span class="tag">墊在 ${esc(c.of)} 下</span>` : ""}<br><span class="dim">${esc(c.action || "找不到對應的動作")}</span></td>
  <td>${esc(c.tier)}</td>
  <td><span class="mono">${esc(c.name)}</span><span class="dim"> ${c.len.toFixed(2)} s${c.lead ? `，峰值前 ${c.lead.toFixed(2)} s` : ""}</span><br><audio controls preload="none" src="sfx/${esc(c.name)}"></audio></td>
  <td><audio controls preload="none" src="clips/c${k}.m4a"></audio></td>
  <td class="flag">${c.missing ? "找不到檔案<br>" : ""}${c.flags.map(esc).join("<br>")}</td>
  <td><select class="do"><option value="">—</option><option>保留</option><option>拿掉</option><option>換聲音</option><option>改時間</option><option>改大小</option></select>
    <select class="swap"><option value="">換成…</option>${opts("")}</select><button class="play" type="button">試聽</button><textarea rows="2" placeholder="備註"></textarea></td></tr>`;
const srow = (s, k) => `<tr id="s${k}" data-id="s${k}" data-t="${s.t.toFixed(2)}" data-what="${esc(s.action)}">
  <td class="n">${k + 1}</td><td class="t">${s.t.toFixed(2)}</td><td><img src="thumbs/s${k}.jpg" alt="" loading="lazy"></td>
  <td>${esc(s.action)}${s.n > 1 ? ` <span class="dim">（同時 ${s.n} 個）</span>` : ""}</td><td><audio controls preload="none" src="clips/s${k}.m4a"></audio></td>
  <td><select class="do"><option value="">—</option><option>保持安靜</option><option>加聲音</option></select>
    <select class="swap"><option value="">用…</option>${opts("")}</select><button class="play" type="button">試聽</button><textarea rows="2" placeholder="備註"></textarea></td></tr>`;
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>音效審片頁</title><style>
:root{--bg:#f7f7f5;--fg:#1d1d1f;--dim:#6e6e73;--line:#d9d9de;--card:#fff;--warn:#b3261e;--accent:#5b47e0}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141416;--fg:#ececf0;--dim:#9a9aa2;--line:#2e2e34;--card:#1c1c20;--warn:#ff8a80;--accent:#a99bff}}
:root[data-theme=dark]{--bg:#141416;--fg:#ececf0;--dim:#9a9aa2;--line:#2e2e34;--card:#1c1c20;--warn:#ff8a80;--accent:#a99bff}
body{margin:0;padding:24px 16px 80px;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"PingFang TC",sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}.dim{color:var(--dim)}.mono{font-family:ui-monospace,monospace;font-size:12px}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:1100px}td,th{padding:8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-weight:600;color:var(--dim);font-size:12px;position:sticky;top:0;background:var(--card)}
img{width:160px;border-radius:6px;display:block}audio{width:190px;height:32px}.n,.t{font-variant-numeric:tabular-nums;white-space:nowrap}
.flag{color:var(--warn);font-size:12px;max-width:220px}tr.layer{opacity:.65}.tag{font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:0 4px}
select,textarea,button{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 6px;margin:2px 0}textarea{width:200px;display:block}
.bars{display:flex;gap:4px;align-items:flex-end;height:70px;margin:8px 0}.bars div{flex:1;background:var(--accent);border-radius:3px 3px 0 0;position:relative;min-width:12px}
.bars div.over{background:var(--warn)}.bars span{position:absolute;bottom:-18px;left:0;font-size:10px;color:var(--dim)}
.bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:var(--card);border-top:1px solid var(--line);display:flex;gap:12px;align-items:center}
.bar button{background:var(--accent);color:#fff;border:0;padding:6px 14px}</style></head><body>
<h1>音效審片頁</h1><p class="dim">${esc(film.split("/videos/").pop())} · ${cues.length} 個音效 · ${silent.length} 個沒有聲音的動作 · ${flagged} 個疑點 · 每列：那一格的畫面、片中前後 2.8 秒的聲音、音效原檔。標好之後按下面的「複製標記」，貼回對話。</p>
<p class="dim">每 10 秒的重音數（不含質感層；紅色是超過 ${DENSITY} 個）</p>
<div class="bars">${windows.map((w) => `<div class="${w.over ? "over" : ""}" style="height:${Math.max(4, w.n * 8)}px" title="${w.w}–${w.w + 10} 秒：${w.n} 個"><span>${w.w}</span></div>`).join("")}</div>
<h2>有聲音的動作</h2><div class="wrap"><table><thead><tr><th>#</th><th>秒</th><th>畫面</th><th>動作</th><th>層</th><th>音效原檔</th><th>片中的聲音</th><th>疑點</th><th>你的標記</th></tr></thead><tbody>
${cues.map(row).join("\n")}</tbody></table></div>
<h2>沒有聲音的動作</h2><p class="dim">畫面上有接觸或狀態改變（縮放、位移、剪裁的短動作），前後 ${NEAR} 秒內沒有音效。大部分應該保持安靜（鏡頭、文字出現、跟拍）；只標需要聲音的。</p>
<div class="wrap"><table><thead><tr><th>#</th><th>秒</th><th>畫面</th><th>動作</th><th>片中的聲音</th><th>你的標記</th></tr></thead><tbody>
${silent.map(srow).join("\n")}</tbody></table></div>
<div class="bar"><button type="button" id="copy">複製標記</button><span class="dim" id="msg">標記存在這個瀏覽器裡，重開頁面還在。</span></div>
<script>
const KEY = "sound-sheet:" + ${JSON.stringify(specPath)};
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
const rows = [...document.querySelectorAll("tr[data-id]")];
for (const r of rows) {
  const s = saved[r.dataset.id] || {}, [d, w] = r.querySelectorAll("select"), n = r.querySelector("textarea");
  d.value = s.do || ""; w.value = s.swap || ""; n.value = s.note || "";
  const keep = () => { saved[r.dataset.id] = { do: d.value, swap: w.value, note: n.value }; try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
  d.onchange = w.onchange = n.oninput = keep;
  r.querySelector(".play").onclick = () => { if (w.value) new Audio("sfx/" + w.value).play(); };
}
document.getElementById("copy").onclick = async () => {
  const lines = rows.map((r) => { const [d, w] = r.querySelectorAll("select"), n = r.querySelector("textarea").value.trim();
    if (!d.value && !w.value && !n) return null;
    return (r.dataset.id[0] === "s" ? "無聲 " : "音效 ") + r.querySelector(".n").textContent + "｜" + r.dataset.t + " 秒｜" + r.dataset.what + "｜" + [d.value, w.value && "→ " + w.value, n].filter(Boolean).join("，"); }).filter(Boolean);
  const text = lines.length ? lines.join("\\n") : "（沒有標記）";
  try { await navigator.clipboard.writeText(text); document.getElementById("msg").textContent = "已複製 " + lines.length + " 條，貼回對話。"; }
  catch { prompt("複製這段：", text); }
};
</script></body></html>`;
writeFileSync(join(out, "index.html"), html);
console.log(`sound-sheet: ${relative(process.cwd(), join(out, "index.html"))} — ${cues.length} effects, ${silent.length} silent actions, ${flagged} hints`);
for (const c of cues) for (const f of c.flags) console.log(`  ${c.t.toFixed(2).padStart(7)} ${(c.ev || c.name).padEnd(12)} ${f}`);
for (const w of windows) if (w.over) console.log(`  ${String(w.w).padStart(4)}–${w.w + 10} s  ${w.n} accents (> ${DENSITY})`);
