// script-lint's reads / setups / seams checks (video-motion-craft references/reads-and-beat.md): each must catch the mistake
// it exists for and leave an honest script alone; a script without the new fields behaves as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, join, node, readFileSync, writeFileSync } from "./helpers.mjs";

const LINT = "scripts/script-lint.mjs";
const beat = (over = {}) => ({ id: "01", t0: 0, t1: 4, verb: "交", big: "一句話就夠。", proof: "真實提問", layer: "ui", hero: true, ...over });
const ok = () => ({
  message: "今晚就能放心回。", total: 8,
  beats: [
    beat({ reads: [{ t0: 0.3, t1: 2.2, what: "一句話就夠", kind: "text", important: true, lead: "畫面中間只有這行字" },
                   { t0: 2.2, t1: 3.2, what: "送出", kind: "motion", act: 2.5, important: true, lead: "游標停在送出鍵上" }] }),
    beat({ id: "02", t0: 4, t1: 8, verb: "拆", big: "先讀懂。", hero: false,
           reads: [{ t0: 4.1, t1: 6.9, what: "拆成六類", kind: "visual", important: true, lead: "鏡頭推到第一欄" }] }),
  ],
  setups: [{ what: "紫色摺角", t: 1, payoff: { t: 6, what: "摺角變成標籤" } }],
  seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 4, kind: "seam", device: "附檔長成文件" }, { id: "close", t: 8, kind: "close", device: "淡出" }],
});
const lint = (name, S) => { const d = fresh(`lint-${name}`), f = join(d, "script.json"); writeFileSync(f, JSON.stringify(S)); return node(LINT, [f]); };

test("an honest timing sheet passes the read checks", () => {
  const r = lint("ok", ok());
  assert.doesNotMatch(r.out, /[✗△] .*(讀點|重疊|停太久|setup|seams|片尾)/, r.out);
  assert.match(r.out, /reads: 3 個（重要 3）、setups 1、seams 3/);
});

test("a script without reads, setups or seams keeps its old result", () => {
  const S = ok(); S.beats.forEach((b) => delete b.reads); delete S.setups; delete S.seams;
  const r = lint("old", S);
  assert.doesNotMatch(r.out, /讀點|seams|reads/, r.out);
  // the old hero warning, and since references became part of the plan: the hero beat has to bind one (no-ref)
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(r.out.split("\n").filter((l) => l.startsWith("✗")).map((l) => l.includes("沒有綁參考")), [true], r.out);
});

test("reads too short: text by the character budget, a small visual 1.0 s, a motion's held meaning 0.5 s", () => {
  const S = ok();
  S.beats[0].reads = [{ t0: 0.3, t1: 1.0, what: "一句話就夠", kind: "text", important: true, lead: "x" },
                      { t0: 1.0, t1: 2.0, what: "送出", kind: "motion", act: 1.7, important: true, lead: "x" }];
  S.beats[1].reads = [{ t0: 4.1, t1: 4.8, what: "拆成六類", kind: "visual", size: "small", important: true, lead: "x" }];
  const r = lint("short", S);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /✗ 01 讀點 1「一句話就夠」: 大字 5 個要 1.4 秒，只有 0.7 秒/);
  assert.match(r.out, /✗ 01 讀點 2「送出」: 動作落定後只停 0.30 秒/);
  assert.match(r.out, /✗ 02 讀點 1「拆成六類」: 小的畫面要 1.0 秒/);
});

test("important reads that overlap fail; a missing lead warns", () => {
  const S = ok();
  S.beats[0].reads[1] = { t0: 1.5, t1: 3.2, what: "送出", kind: "motion", act: 1.8, important: true };
  const r = lint("overlap", S);
  assert.equal(r.code, 1);
  assert.match(r.out, /✗ 01 讀點 1「一句話就夠」 和 01 讀點 2「送出」 重疊 0.70 秒/);
  assert.match(r.out, /△ 01 讀點 2「送出」: 重要讀點沒寫 lead/);
});

test("padding: the last read done more than 1.2 s before the beat ends warns 停太久; a slow action warns", () => {
  const S = ok();
  S.beats[1].reads = [{ t0: 4.1, t1: 5.0, what: "拆成六類", kind: "motion", act: 4.4, important: true, lead: "x" },
                      { t0: 5.0, t1: 6.0, what: "再拆一次", kind: "motion", act: 5.0 + 0.1, lead: "x" }];
  S.beats[0].reads[1] = { t0: 2.2, t1: 4.0, what: "送出", kind: "motion", act: 3.4, important: true, lead: "x" };
  S.total = 9; S.beats[1].t1 = 9; S.seams[2].t = 9;
  const r = lint("pad", S);
  assert.match(r.out, /△ 02: 最後一個讀點在 6.00 秒看完，到拍尾 9 還有 3.0 秒：停太久/);
  assert.match(r.out, /△ 01 讀點 2「送出」: 動作本身 1.20 秒（超過 1 秒）/);
});

test("the final read needs 1.0 s before the end; a setup needs a payoff with a time after it", () => {
  const S = ok();
  S.beats[1].reads[0].t1 = 7.5;
  S.setups = [{ what: "紫色摺角", t: 1 }, { what: "?", t: 5, payoff: { t: 2 } }, { what: "QR", t: 1, payoff: "結尾掃碼" }];
  const r = lint("end", S);
  assert.equal(r.code, 1);
  assert.match(r.out, /✗ 最後一個讀點 7.50 秒才結束，離片尾 8 只有 0.50 秒/);
  assert.match(r.out, /✗ setup 1「紫色摺角」: 埋了沒收/);
  assert.match(r.out, /✗ setup 2「\?」: payoff 在 2 秒，比埋下的 5 秒還早/);
  assert.match(r.out, /✗ setup 3「QR」: payoff 要寫時間/);
});

test("seams without an open or a close warn; reads without a seam table warn", () => {
  const S = ok(); S.seams = S.seams.filter((m) => m.kind === "seam");
  const r = lint("seams", S);
  assert.match(r.out, /△ seams: 沒有 open/); assert.match(r.out, /△ seams: 沒有 close/);
  const S2 = ok(); delete S2.seams;
  assert.match(lint("noseams", S2).out, /△ seams: 沒有接縫表/);
});

test("--json: the findings carry the codes the review gate reads (read-short, read-overlap, hold-long, last-read-late)", () => {
  const S = ok();
  S.beats[0].reads = [{ t0: 0.3, t1: 0.9, what: "一句話就夠", kind: "text", important: true, lead: "x" }, { t0: 0.5, t1: 1.6, what: "送出", kind: "motion", act: 0.8, important: true, lead: "y" }];
  S.beats[1].reads = [{ t0: 4.1, t1: 7.6, what: "拆成六類", kind: "visual", important: true, lead: "z" }];
  const d = fresh("lint-json"), f = join(d, "script.json"), j = join(d, "out.json"); writeFileSync(f, JSON.stringify(S));
  node(LINT, [f, "--json", j]);
  const F = JSON.parse(readFileSync(j, "utf8")).findings, has = (code, beat) => F.some((x) => x.code === code && (!beat || x.beat === beat));
  assert.ok(has("read-short", "01") && F.find((x) => x.code === "read-short").important === true, JSON.stringify(F));
  assert.ok(has("read-overlap", "01"));
  assert.ok(has("hold-long", "01"), "01: last read 1.6, beat ends 4.0");
  assert.ok(has("last-read-late"), "7.6 is 0.4 s before the end");
});

// User 2026-10-29:「停個1.0-1.2就好」— a big English line needs about 1.0–1.2 s, not a CJK budget per letter (film D needed a
// read-short waiver for every verb); small English subtitles about 1.8 s (taste.md). Mixed lines count CJK plus English words.
test("English lines read by the word: a big line 1.0–1.2 s, a small one about 1.8 s; CJK keeps its budget", () => {
  const S = ok(), en = (t0, t1, text, size = "big") => ({ t0, t1, what: text, text, kind: "text", size, important: true, lead: "x" });
  S.beats[0].reads = [en(0.3, 1.3, "Say it."), en(1.4, 2.6, "It never leaves this machine.")];
  S.beats[1].reads = [en(4.1, 5.9, "Contract review, on your own machine.", "small")];
  let r = lint("en-ok", S);
  assert.doesNotMatch(r.out, /讀點.*要 .* 秒，只有/, r.out);
  S.beats[0].reads = [en(0.3, 1.1, "Say it."), en(1.4, 2.4, "It never leaves this machine.")];
  S.beats[1].reads = [en(4.1, 5.5, "Contract review, on your own machine.", "small")];
  r = lint("en-short", S);
  assert.match(r.out, /✗ 01 讀點 1「Say it.」: 大英文字 2 個要 1.0 秒，只有 0.8 秒/);
  assert.match(r.out, /✗ 01 讀點 2「It never leaves this machine.」: 大英文字 5 個要 1.2 秒，只有 1.0 秒/);
  assert.match(r.out, /✗ 02 讀點 1「Contract review, on your own machine.」: 小英文字 6 個要 1.8 秒，只有 1.4 秒/);
  S.beats[0].reads = [en(0.3, 1.3, "AI 審約，今晚交")];   // mixed: 5 CJK + 1 word = 6 → big max(1.2, 6/6+0.6) = 1.6 (user 2026-10-31: 「改短」)
  r = lint("mixed", S);
  assert.match(r.out, /✗ 01 讀點 1「AI 審約，今晚交」: 大字 6 個要 1.6 秒，只有 1.0 秒/);
  const B = ok(); B.beats[0] = beat({ big: "It never leaves this machine.", t1: 1.1 }); B.beats[1].t0 = 1.1;
  assert.doesNotMatch(lint("en-beat", B).out, /大字 .* 字（> 8/, "a five-word English line is not 26 letters");
});
