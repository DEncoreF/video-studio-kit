// Check a script against video-direction references/script-craft.md and video-motion-craft references/reads-and-beat.md (the parts that can be counted).
//   node scripts/script-lint.mjs videos/<slug>/direction/script.json [--json findings.json]
// script.json: { "message": "一句話", "total": 61, "beats": [ { "id": "03", "t0": 14, "t1": 20, "verb": "標", "big": "標在原檔上。",
//   "sub": "…", "proof": "真實 Word 輸出" | "情境示意" | "", "hero": true,
//   "layer": "ui" | "material" | "real", "typed": "畫面上逐字打出的字（只放打的那段）",
//   "reads": [ { "t0": 14.2, "t1": 16.0, "what": "觀眾要看懂的事", "kind": "text" | "visual" | "motion", "size": "big" | "small",
//                "important": true, "lead": "眼睛怎麼被帶到那裡", "text": "畫面上的字（text 讀點；預設用 what）",
//                "act": 14.5, "crop": [x, y, w, h], "hit": true } ] } ],
//   "setups": [ { "what": "埋下的東西", "t": 9.0, "payoff": { "t": 46.0, "what": "怎麼收" } } ],
//   "seams": [ { "id": "S1", "t": 4.0, "kind": "open" | "seam" | "close", "device": "靠什麼帶過去", "bar": true } ] }
// layer（呈現層，video-direction visual-verbs.md）：ui＝介面互動（預設）、material＝材質變形（主角拍才用）、real＝實景（只在頭尾當錨點）。
// reads、setups、seams 都是選填（video-motion-craft reads-and-beat.md §1–5、§10）：
//   reads 是讀點表，時間是全片秒數；t0 找得到的那一刻，t1 看懂的那一刻（下一件事更早搶走眼睛就是那一刻）。
//   kind：text 字、visual 畫面、motion 動作（t0 起動、act 落定，預設 t0 + 0.33 秒）。size 預設 big。important 是這拍要成立非懂不可的事。
//   最短時間：text 大 max(1.2, 字數 ÷ 4.5 + 0.6)、小 max(1.2, 字數 ÷ 4.5 + 0.9)（中英夾雜時英文一個字算一字）；
//     英文（整行沒有中日韓字）照字數：大 max(1.0, 0.8 + 0.08 × 字數)、小 max(1.8, 0.9 + 0.15 × 字數)（使用者：「停個1.0-1.2就好」）；visual 大 0.6、小 1.0；
//   motion 落定後的停留 大 0.5、小 0.8，動作本身超過 1.0 秒（材質變形 2.8 秒）就提醒「動作要快」。
//   重要讀點不能重疊（容許 1 格，1/60 秒）；重要讀點要寫 lead；讀點可以比拍早 0.5 秒開始（接縫）；
//   一拍最後一個讀點結束到拍尾（或拍裡的下一個接縫）超過 1.2 秒是「停太久」
//   （最後一拍另加片尾的 1.0 秒）；最後一個讀點要在片尾前 1.0 秒以上結束；setups 都要有 payoff；seams 要有 open 與 close。
//   crop 給 review-pack 用：這個讀點要用全解析度裁切看的地方（1920×1080 的像素）；hit 給 beat-check 用：這個讀點的開始要在拍上。
//   total 是片長（預設最後一拍的 t1）。
// Exit 0 = all pass, 2 = warnings only, 1 = failures.
import { readFileSync, writeFileSync } from "node:fs";
import { MOTION, textNeed as sharedTextNeed } from "./lib/rules.mjs";
import { bindings, findRef } from "./lib/refcards.mjs";
import { readRefs } from "./lib/refs.mjs";
const RD = MOTION.read, ACT = MOTION.action;   // library/rules/motion.json
const file = process.argv[2]; if (!file) { console.error("usage: node scripts/script-lint.mjs <script.json>"); process.exit(1); }
const S = JSON.parse(readFileSync(file, "utf8")), B = S.beats ?? [];
const chars = (s = "") => [...s.replace(/<[^>]+>/g, "").replace(/[\s，。、；：「」！？,.;:!?（）()]/g, "")].length;
// English (Latin-script) lines read by the word, not the letter (user 2026-10-29:「停個1.0-1.2就好」for a big English line; taste.md:
// small English subtitles about 1.8 s). A line with any CJK counts CJK characters plus Latin words, each as one character.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const strip = (s = "") => String(s).replace(/<[^>]+>/g, "");
const HAS_CJK = new RegExp(CJK.source);
const latin = (s = "") => !HAS_CJK.test(strip(s)) && /[A-Za-z]/.test(strip(s));
const words = (s = "") => (strip(s).replace(CJK, " ").match(/[A-Za-z0-9][A-Za-z0-9'’%.,:$€£\-]*/g) ?? []).length;
const units = (s = "") => (latin(s) ? words(s) : chars(strip(s).replace(/[A-Za-z0-9][A-Za-z0-9'’%.,:$€£\-]*/g, "")) + words(s));
/** Seconds a text read needs (t0 → t1), library/rules/motion.json read.*: CJK max(textMin, n ÷ textRate + textBig / textSmall); English by the word. */
const textNeed = sharedTextNeed;   // lib/rules.mjs (review-pack judges holds with the same numbers)
const unitName = (s) => (latin(s) ? "英文字" : "字");
const out = []; const fail = (m, meta = {}) => out.push(["FAIL", m, meta]), warn = (m, meta = {}) => out.push(["WARN", m, meta]);
// 1. one sentence, one claim
const msg = S.message ?? ""; if (!msg) fail("message: 沒有一句話（30 秒測試）");
else { if (chars(msg) > 25) warn(`message: ${chars(msg)} 字，超過 25 字：「${msg}」`); const clauses = msg.split(/[，、；,;]/).filter((x) => x.trim()).length; if (clauses > 2) fail(`message: ${clauses} 個子句，不只一個主張：「${msg}」`); }
// 3. heroes
const heroes = B.filter((b) => b.hero), rest = B.filter((b) => !b.hero), len = (b) => b.t1 - b.t0;
if (!heroes.length) warn("hero: 沒有標主角拍"); if (heroes.length > 3) fail(`hero: ${heroes.length} 個主角拍（最多 3）`);
const med = rest.length ? rest.map(len).sort((a, b) => a - b)[Math.floor(rest.length / 2)] : 0;
heroes.forEach((h) => { if (med && len(h) < 1.5 * med) warn(`${h.id}: 主角拍 ${len(h).toFixed(1)} 秒，不到一般拍（${med.toFixed(1)} 秒）的 1.5 倍`); });
// 4–6. per beat: verb, proof, one idea, text budget
const verbs = {};
for (const b of B) {
  const id = b.id ?? `${b.t0}s`;
  if (!b.verb) fail(`${id}: 沒有動詞`); else verbs[b.verb] = (verbs[b.verb] ?? 0) + 1;
  if (!b.proof) fail(`${id}: 沒有證據畫面（真實輸出，或標「情境示意」）`);
  const both = [b.big, b.sub].filter(Boolean).join(" "), c = units(both), need = textNeed(both, true);
  if (b.big && len(b) < need - 0.05) fail(`${id}: ${unitName(both)} ${c} 個要 ${need.toFixed(1)} 秒，只有 ${len(b).toFixed(1)} 秒`);
  if (units(b.big) > 8) warn(`${id}: 大字 ${units(b.big)} ${unitName(b.big)}（> 8，先刪字再考慮兩行）：「${b.big}」`);
  const ideas = (b.big ?? "").split(/[，、；,;]/).filter((x) => x.trim()).length; if (ideas > 2) warn(`${id}: 大字裡有 ${ideas} 個概念`);
}
// 7. presentation layer: interaction by default, real scenes only as bookends, material morphs only on hero beats
const LAYER = { ui: "ui", 介面: "ui", 介面互動: "ui", material: "material", 材質: "material", 材質變形: "material", real: "real", 實景: "real" };
const layers = B.map((b) => (b.layer ? LAYER[b.layer] ?? "?" : null));
B.forEach((b, i) => { if (layers[i] === "?") fail(`${b.id}: 呈現層「${b.layer}」不認得（ui／material／real）`); });
if (B.length && layers.every((l) => !l)) warn("layer: 沒有標呈現層（ui／material／real），預設全部當介面互動");
let head = 0; while (head < B.length && layers[head] === "real") head++;
let tail = B.length; while (tail > head && layers[tail - 1] === "real") tail--;
for (let i = head; i < tail; i++) if (layers[i] === "real") warn(`${B[i].id}: 實景放在中間（只在頭尾當錨點，中間用介面互動或材質變形）`);
const mats = B.filter((b, i) => layers[i] === "material");
if (mats.length > 3) warn(`layer: ${mats.length} 個材質變形（最多 3 個，放在主角拍）`);
mats.filter((b) => !b.hero).forEach((b) => warn(`${b.id}: 材質變形不是主角拍（一般拍用介面互動或鏡頭帶過）`));
B.filter((b) => chars(b.typed) > ACT.typedMax).forEach((b) => warn(`${b.id}: 逐字打 ${chars(b.typed)} 字（只打前幾個字，接著整句出現或像訊息一樣送出）`));
Object.entries(verbs).forEach(([v, n]) => { if (n > 2) warn(`動詞「${v}」用了 ${n} 次，這幾拍可能在重複同一件事`); });
for (let i = 1; i < B.length; i++) if (B[i].t0 < B[i - 1].t1 - 0.01) warn(`${B[i].id}: 和前一拍重疊`);
// 8. reads, setups, seams (reads-and-beat.md §1–5, §10): only when the script has them
const total = S.total ?? (B.length ? Math.max(...B.map((b) => b.t1)) : 0), FRAME = 1 / 60;
const READ = { text: "text", 字: "text", visual: "visual", 畫面: "visual", motion: "motion", 動作: "motion" };
const reads = B.flatMap((b) => (b.reads ?? []).map((r, i) => ({ ...r, beat: b, idx: i + 1, label: `${b.id ?? `${b.t0}s`} 讀點 ${i + 1}「${r.what ?? "?"}」` })));
const f2 = (x) => x.toFixed(2);
for (const r of reads) {
  const kind = READ[r.kind ?? "visual"], big = (r.size ?? "big") !== "small", d = r.t1 - r.t0, meta = { code: "read-short", beat: r.beat.id, read: r.idx, important: !!r.important };
  const report = (m) => (r.important ? fail : warn)(m, meta);
  if (!(r.t1 > r.t0)) { fail(`${r.label}: t1 要大於 t0（${r.t0}–${r.t1}）`); continue; }
  if (!kind) { fail(`${r.label}: kind「${r.kind}」不認得（text／visual／motion）`); continue; }
  if (!r.what) warn(`${r.label}: 沒寫 what（觀眾要看懂什麼）`);
  if (r.t0 < r.beat.t0 - 0.5 || r.t0 > r.beat.t1 + 0.01) warn(`${r.label}: 開始在 ${f2(r.t0)} 秒，不在這一拍（${r.beat.t0}–${r.beat.t1}）裡`);
  if (kind === "text") {
    const tx = r.text ?? r.what, c = units(tx), need = textNeed(tx, big);
    if (d < need - 0.05) report(`${r.label}: ${big ? "大" : "小"}${unitName(tx)} ${c} 個要 ${need.toFixed(1)} 秒，只有 ${d.toFixed(1)} 秒`);
  } else if (kind === "visual") {
    const need = big ? RD.visualBig : RD.visualSmall;
    if (d < need - 0.02) report(`${r.label}: ${big ? "大" : "小"}的畫面要 ${need.toFixed(1)} 秒才找得到、看得懂，只有 ${d.toFixed(2)} 秒`);
  } else {
    const act = r.act ?? r.t0 + RD.actDefault, held = r.t1 - act, need = big ? RD.settleBig : RD.settleSmall, slow = r.beat.layer && LAYER[r.beat.layer] === "material" ? ACT.materialMax : ACT.max;
    if (act < r.t0) fail(`${r.label}: act（${act}）比 t0 早`);
    else if (act > r.t1) report(`${r.label}: 動作 ${f2(act)} 秒才落定，讀點在 ${f2(r.t1)} 秒就被下一件事蓋掉（還沒落定，意思沒有時間停）`);
    else if (held < need - 0.02) report(`${r.label}: 動作落定後只停 ${held.toFixed(2)} 秒（意思要停 ${need.toFixed(1)} 秒以上：快的動作、慢的意思）`);
    if (act - r.t0 > slow + 0.02) warn(`${r.label}: 動作本身 ${(act - r.t0).toFixed(2)} 秒（超過 ${slow} 秒）：動作要快，要停的是意思`);
  }
  if (r.important && !r.lead) warn(`${r.label}: 重要讀點沒寫 lead（眼睛怎麼先被帶到那裡）`);
}
const imp = reads.filter((r) => r.important && r.t1 > r.t0).sort((a, b) => a.t0 - b.t0);
for (let i = 0; i < imp.length; i++) for (let j = i + 1; j < imp.length && imp[j].t0 < imp[i].t1 - RD.overlapFrames * FRAME; j++)
  fail(`${imp[i].label} 和 ${imp[j].label} 重疊 ${(Math.min(imp[i].t1, imp[j].t1) - imp[j].t0).toFixed(2)} 秒（${f2(imp[j].t0)}–${f2(Math.min(imp[i].t1, imp[j].t1))}）：同時要看懂兩件事，只會看到一件`, { code: "read-overlap", beat: imp[j].beat.id, read: imp[j].idx, important: true });
if (reads.length) {
  const withReads = B.filter((b) => b.reads?.length);
  B.filter((b) => !b.reads?.length).forEach((b) => warn(`${b.id}: 沒寫 reads（觀眾在這一拍要看懂什麼）`));
  withReads.forEach((b) => {
    const last = Math.max(...b.reads.map((r) => r.t1)), isLast = b === B[B.length - 1], limit = isLast ? MOTION.hold.limitLast : MOTION.hold.limit;
    const next = (S.seams ?? []).map((m) => m.t).filter((t) => t > last && t < b.t1).sort((x, y) => x - y)[0], end = next ?? b.t1, gap = end - last;   // a seam inside the beat ends the wait
    if (gap > limit + 0.01) warn(`${b.id}: 最後一個讀點在 ${f2(last)} 秒看完，到${next ? `接縫 ${next}` : `拍尾 ${b.t1}`} 還有 ${gap.toFixed(1)} 秒：停太久（超過 ${limit} 秒）`, { code: "hold-long", beat: b.id, gap: +gap.toFixed(2), limit });
  });
  const lastRead = Math.max(...reads.map((r) => r.t1));
  if (total - lastRead < MOTION.end.lastReadGap - 0.01) fail(`最後一個讀點 ${f2(lastRead)} 秒才結束，離片尾 ${total} 只有 ${(total - lastRead).toFixed(2)} 秒（要 ${MOTION.end.lastReadGap.toFixed(1)} 秒以上讓它落地）`, { code: "last-read-late", important: true });
}
const tOf = (p) => (typeof p === "number" ? p : p && typeof p === "object" ? p.t : undefined);
(S.setups ?? []).forEach((s, i) => {
  const name = `setup ${i + 1}「${s.what ?? "?"}」`, pt = tOf(s.payoff);
  if (s.payoff === undefined || s.payoff === null || s.payoff === "") fail(`${name}: 埋了沒收（沒有 payoff）`);
  else if (typeof pt !== "number") fail(`${name}: payoff 要寫時間（{ "t": 秒, "what": "怎麼收" }）`);
  else if (pt < (s.t ?? 0)) fail(`${name}: payoff 在 ${pt} 秒，比埋下的 ${s.t} 秒還早`);
  else if (pt > total + 0.01) fail(`${name}: payoff 在 ${pt} 秒，片子 ${total} 秒就結束了`);
});
const SEAM = { open: "open", 開場: "open", seam: "seam", 接縫: "seam", close: "close", 結尾: "close" };
if (S.seams || reads.length) {
  const seams = S.seams ?? [];
  if (!S.seams) warn("seams: 沒有接縫表（開場、每個接縫、結尾都要寫 device）");
  seams.forEach((m, i) => { if (!SEAM[m.kind ?? "seam"]) fail(`seam ${m.id ?? i + 1}: kind「${m.kind}」不認得（open／seam／close）`); if (!m.device) warn(`seam ${m.id ?? i + 1}: 沒寫 device（靠什麼帶過去）`); });
  if (S.seams && !seams.some((m) => SEAM[m.kind] === "open")) warn("seams: 沒有 open（開場也是接縫：不要從一張硬的畫面開始）");
  if (S.seams && !seams.some((m) => SEAM[m.kind] === "close")) warn("seams: 沒有 close（結尾也是接縫：不要直接停）");
}
// 9. references are part of the plan (refs.mjs card / board): a hero beat and a major or bar seam bind at least one card;
//    a bound id must be a logged reference with its facets tagged
{
  const nodes = bindings(S), log = readRefs(), name = (n) => `${n.node === "beat" ? "" : "接縫 "}${n.id}`;
  for (const n of nodes) {
    if (n.experimental === true || (n.experimental != null && !String(n.experimental).trim())) fail(`${name(n)}: experimental 要寫使用者同意首創的原話（不是 true）`, { code: "experimental-unapproved", beat: n.id });
    else if (n.experimental) warn(`${name(n)}: 實驗（沒有參考，使用者同意首創：「${n.experimental}」）：量測照跑，回報標成實驗`, { code: "experimental", beat: n.id });
    else if (n.required && !n.refs.length) fail(`${name(n)}: ${n.why}沒有綁參考（refs）：先找（refs.mjs hunt）、用 refs.mjs card 標「借什麼」，再寫進 refs；找不到就出參考不足報告給使用者決定`, { code: "no-ref", beat: n.id });
    for (const k of n.refs) { const e = findRef(k, log); if (!e) fail(`${name(n)}: 參考 ${k} 不在參考紀錄裡（refs.mjs cards 列出 id）`, { code: "ref-unknown", beat: n.id }); else if (!e.card?.facets?.length) warn(`${name(n)}: 參考 ${k}（${e.title}）沒標面向與借什麼（refs.mjs card ${k} --take 面向=…）`, { code: "ref-untagged", beat: n.id }); }
  }
  if (B.length && !nodes.some((n) => n.refs.length)) warn("refs: 整支沒有綁任何參考：每一拍做之前要看得到它的參考（refs.mjs board）", { code: "no-refs" });
}
if (!out.length) console.log(`script-lint: ${B.length} 拍全部通過`);
if (reads.length) console.log(`reads: ${reads.length} 個（重要 ${imp.length}）、setups ${(S.setups ?? []).length}、seams ${(S.seams ?? []).length}`);
for (const [k, m] of out) console.log(`${k === "FAIL" ? "✗" : "△"} ${m}`);
// --json <file>: the same findings for the review gate (review-pack.mjs): { level, msg, code?, beat?, read?, important? }
const ji = process.argv.indexOf("--json");
if (ji > 0 && process.argv[ji + 1]) writeFileSync(process.argv[ji + 1], JSON.stringify({ beats: B.length, reads: reads.length, important: imp.length, findings: out.map(([level, msg, meta]) => ({ level, msg, ...meta })) }, null, 1));
process.exit(out.some(([k]) => k === "FAIL") ? 1 : out.length ? 2 : 0);
