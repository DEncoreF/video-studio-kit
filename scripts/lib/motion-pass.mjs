// The motion pass, part of the draft gate (2026-11-05). In one film's session the user asked eight times 「有跑 motion skill 嗎」:
// video-motion-craft had been loaded once and then done from memory, the gate only measured the render, and each run the user
// asked for found real defects. So every version gets it: the pack checks what a program can (motionFindings) and writes MOTION.md
// (motionTemplate), which puts the user's exemplars and the warnings in front of the maker again, whatever has happened to the
// conversation since; --check verifies the answers (readMotion). A campaign's candidates skip it (--candidate): they are being chosen.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { EXEMPLARS, TOOL } from "./paths.mjs";

/** Warnings that say nothing about motion: not asked about in MOTION.md. */
const NOT_MOTION = new Set(["safe-title", "head-zone", "no-audio", "loud-jump"]);
/** Normal in an excerpt (video-draft-review 試片), so a test clip is not asked about them: answering them every version would teach boilerplate. */
const EXCERPT = new Set(["hard-open", "hard-close", "frozen-tail", "last-read-late", "no-grid", "no-reads"]);
const SOFT = /^(sine|power[12]|quad|cubic)\.inOut$/, SOFT_DUR = [0.6, 0.8];

/** The film's own script text (index.html and assets/js, not what it vendors). */
function sources(dir) {
  const js = join(dir, "assets/js"), files = [join(dir, "index.html"), ...(existsSync(js) ? readdirSync(js).filter((f) => f.endsWith(".js")).map((f) => join(js, f)) : [])];
  return files.filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
}
const hasParams = (dir) => ["", "assets", "assets/js"].some((d) => existsSync(join(dir, d)) && readdirSync(join(dir, d)).some((f) => /^params\.(m?js|json)$/.test(f)));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** Adds the motion findings to a measure() run. Only with a composition to read; a bare render has nothing to check here. */
export function motionFindings({ dir, out, S, v, fps, add, warn }) {
  const facts = [];
  if (existsSync(join(dir, "index.html"))) {
    // read twice before giving up (one back-test run failed once for no reason it could show), and never pass on a read that failed:
    // an old events.json must not answer for this version, and an unchecked ease must not look like a checked one
    const ej = join(out, "events.json"), read = () => { rmSync(ej, { force: true }); return spawnSync(process.execPath, [join(TOOL, "scripts/timeline-events.mjs"), dir, "--out", ej, "--timeout", "20000"], { encoding: "utf8", timeout: 60000 }); };
    let r = read(); if (r.status !== 0 || !existsSync(ej)) r = read();
    const ev = r.status === 0 && existsSync(ej) ? JSON.parse(readFileSync(ej, "utf8")).events : null;
    if (!ev) { add("motion-unread", "timeline", `讀不到時間軸，緩動沒有檢查：${(r.stderr || r.stdout || r.signal || "").trim().slice(0, 200)}`); facts.push("✗ 讀不到時間軸，緩動沒有檢查"); }
    else {
      const bad = [...new Set(ev.filter((e) => e.easeUnknown).map((e) => e.ease))];
      for (const e of bad) add("ease-unknown", e, `GSAP 讀不懂緩動「${e}」，會悄悄改用預設的 power1.out，這個設定從沒生效（${ev.filter((x) => x.ease === e).length} 個 tween）：改成函式，例如 RulerEase.bez(.16,1,.3,1)`);
      const soft = ev.filter((e) => e.kind === "tween" && SOFT.test(e.ease ?? "") && e.dur >= SOFT_DUR[0] && e.dur <= SOFT_DUR[1]);
      if (soft.length) warn("ease-soft", soft[0].t, `${soft.length} 個對稱的軟緩動 ${SOFT_DUR.join("–")} 秒（第一個在 ${soft[0].t} 秒，${soft[0].ease}）：這是讓片子想睡的預設，改成有快慢對比的`);
      facts.push(`${bad.length ? "✗" : "✓"} 緩動：${ev.filter((e) => e.kind === "tween").length} 個 tween，GSAP 讀不懂的 ${bad.length} 種，對稱軟緩動 ${soft.length} 個`);
    }
    const src = sources(dir), lib = [[hasParams(dir), "no-params", "參數檔", "沒有參數檔（assets/js/params.js）：時間、緩動、停留要集中，意見才對得到一個值"],
      [/\bBeat\.make\b/.test(src), "no-beat", "Beat 對拍", "沒有用 Beat：接縫與打點要掛在同一個脈搏"],
      [/\bRulerEase\./.test(src), "no-ruler-ease", "RulerEase", "沒有用 RulerEase：動作的快慢是從尺量來的，不要手寫對稱曲線"]];
    for (const [ok, code, name, msg] of lib) { if (!ok) warn(code, "source", msg); facts.push(`${ok ? "✓" : "△"} ${name}`); }
  }
  // the hero moment: its strongest motion against the rest of the film (film 07's power-on was the weakest thing in its own clip)
  const beats = S?.beats ?? [], heroes = [...beats.filter((b) => b.hero), ...beats.flatMap((b) => b.reads ?? []).filter((r) => r.hero)];
  if (!S) return facts;
  if (!heroes.length) { facts.push("△ 沒有標主角時刻（拍或讀點加 hero: true）：標了才量得到它有沒有比周圍弱"); return facts; }
  const peak = (a, b) => { let m = 0; for (let i = Math.max(0, Math.round(a * fps)); i < Math.min(v.length, Math.round(b * fps)); i++) if (v[i] > m) m = v[i]; return m; };
  const inHero = (t) => heroes.some((h) => t >= h.t0 && t < h.t1), others = [];
  for (let t = 0; t < v.length / fps; t++) if (!inHero(t) && !inHero(t + 0.5)) others.push(peak(t, t + 1));
  const typical = median(others);
  for (const h of heroes) {
    const p = peak(h.t0, h.t1), id = h.id ?? `${h.t0}–${h.t1}`;
    if (others.length && p < typical) warn("hero-weak", id, `主角時刻 ${h.t0}–${h.t1} 秒的動態峰值 ${p.toFixed(1)}，比片子其他地方的中位數 ${typical.toFixed(1)} 還弱`);
    facts.push(`${others.length && p < typical ? "△" : "✓"} 主角時刻 ${id}：動態峰值 ${p.toFixed(1)}，其他地方中位數 ${typical.toFixed(1)}`);
  }
  return facts;
}

const exemplars = () => { const f = join(EXEMPLARS, "index.jsonl"); return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; };
const warned = (F, test) => { const by = new Map(); for (const f of F) if (f.level === "WARN" && !NOT_MOTION.has(f.code) && !(test && EXCERPT.has(f.code))) by.set(f.code, [...(by.get(f.code) ?? []), f]); return by; };

export function motionTemplate({ render, facts, F, test, command }) {
  const by = warned(F, test), ex = exemplars();
  return [`# 動態檢查：${render}`, "",
    "給使用者看之前都要填，每一版一份（video-motion-craft）。這一版的東西都在這裡，不要憑記憶：上一版的答案在 MOTION.prev.md（如果有）。", `填完跑 \`${command}\`，它會核對範例和元件的名稱。`, "",
    "## 1. 程式查過的", "", ...(facts.length ? facts.map((x) => `- ${x}`) : ["- （這裡沒有合成可以讀）"]), "",
    "## 2. 還沒處理的提醒（一種一條）", "", "修得掉就修掉、重新 render；留著就在「留：」寫理由。", "",
    ...(by.size ? [...by].flatMap(([code, fs]) => [`- \`${code}\`（${fs.length} 處，${fs.slice(0, 4).map((f) => f.id).join("、")}）：${(code === "lint" ? fs.map((f) => f.msg) : [fs[0].msg]).join("；")} <!-- warn:${code} -->`, "  留："]) : ["- 沒有"]), "",
    "## 3. 你的範例", "", "打開跟這一版相關的（`node <tool>/scripts/exemplar.mjs show <id>`）。✓ 是使用者核可的，✗ 是退回的。", "",
    ...ex.map((e) => `- ${e.verdict === "keep" ? "✓" : "✗"} \`${e.id}\` ${String(e.why ?? "").slice(0, 44)}`), ...(ex.length ? [] : ["- （還沒有範例）"]), "",
    "## 4. 回答", "",
    "- 範例：用了或參考哪個 id；沒有就寫「無：」加查過哪一類、為什麼不適用。",
    "- 元件：用了登錄庫哪個元件（`npx hyperframes catalog --query \"<動作，英文>\" --json`）或 `library/` 的哪個檔；沒有就寫「無：」加查了什麼。",
    "- 最弱處：這一版動態最弱的地方，要有秒數。",
    "- 另一種表達：和這版不同的做法一句話，不是微調。回報時一起告訴使用者。", "",
    "範例：", "元件：", "最弱處：", "另一種表達：", ""].join("\n");
}

function registry() {
  const r = spawnSync(join(TOOL, "node_modules/.bin/hyperframes"), ["catalog", "--json"], { encoding: "utf8", timeout: 60000, maxBuffer: 64 << 20 });
  try { const items = JSON.parse(r.stdout); return new Set((Array.isArray(items) ? items : items.items).map((i) => i.name)); } catch { return null; }
}

/** → { problems, answers }: every warning answered, names that exist, a weakest spot with its time, a real alternative. */
export function readMotion(md, F, test) {
  const problems = [], line = (k) => (new RegExp(`^${k}：[ \\t]*(.*)$`, "m").exec(md)?.[1] ?? "").trim();
  const none = (s) => /^無[：:]/.test(s) && s.length >= 8;
  const kept = [...warned(F, test).keys()].map((code) => {
    const m = new RegExp(`<!-- warn:${code} -->\\s*\\n\\s*留：[ \\t]*(.*)`).exec(md), reason = (m?.[1] ?? "").trim();
    if (reason.length < 4) problems.push(`MOTION.md：提醒 \`${code}\` 還在，修掉或在「留：」寫理由`);
    return { code, reason };
  });
  const exemplar = line("範例"), block = line("元件"), weakest = line("最弱處"), alternative = line("另一種表達");
  const ids = new Set(exemplars().map((e) => e.id)), named = exemplar.match(/\b[a-z]+-[0-9a-f]{8}\b/g) ?? [];
  if (!none(exemplar) && !named.length) problems.push("MOTION.md：「範例：」要寫範例的 id，或「無：」加查過什麼");
  for (const id of named) if (!ids.has(id)) problems.push(`MOTION.md：沒有這個範例 ${id}`);
  if (!none(block)) {
    const names = registry(), words = block.split(/[\s,、，（）()：:「」`]+/).filter(Boolean), libs = words.filter((w) => /^library\//.test(w));
    for (const l of libs) if (!existsSync(join(TOOL, l))) problems.push(`MOTION.md：沒有這個檔 ${l}`);
    if (!block) problems.push("MOTION.md：「元件：」要寫登錄庫的名稱或 library/ 的檔，或「無：」加查了什麼");
    else if (names && !libs.length && !words.some((w) => names.has(w))) problems.push(`MOTION.md：登錄庫沒有「${block}」：寫元件的名稱，或「無：」加查了什麼`);
  }
  if (weakest.length < 8 || !/\d(\.\d+)?\s*(秒|s\b)/.test(weakest)) problems.push("MOTION.md：「最弱處：」要說出是哪裡、幾秒");
  if (alternative.length < 8 || /^(無|沒有|同上|n\/a)/i.test(alternative)) problems.push("MOTION.md：「另一種表達：」要寫一種不同的做法");
  return { problems, answers: { exemplar, block, weakest, alternative, kept } };
}
