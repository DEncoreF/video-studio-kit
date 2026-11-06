// scripts/review-pack.mjs, the draft gate (video-draft-review): synthetic 4-second clips at 60 fps, 120 BPM (a beat every 0.5 s).
// The pack labels every tile with its frame; --check re-measures the render, holds measured problems unless the user waived
// them, wants every answer to cite a frame of its own item, and writes PASS.json bound to the render's sha256; --verify and
// --attach keep that binding; a test clip (tests/_*) is measured only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname } from "node:path";
import { PROFILE as PROFILE_DIR, existsSync, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const req = createRequire(import.meta.url), FF = req(join(root, "node_modules/ffmpeg-static")), FP = req(join(root, "node_modules/@ffprobe-installer/ffprobe")).path;
const smooth = (a, b) => `(1/(1+exp(-(t-${(a + b) / 2})*${(10 / (b - a)).toFixed(3)})))`;   // a logistic step from a to b
const STUTTER = "if(lt(t,1),20+120*t,if(lt(t,1.08),140,if(lt(t,2),140+120*(t-1.08),250)))";   // moves, stops 5 frames, moves, then nothing

/** A white square on dark grey; x(t) is an ffmpeg expression. fade: fade in 0.3 s and out over the last 0.6 s. */
function clip(file, x, { dur = 4, fade = true } = {}) {
  const fades = fade ? `,fade=in:st=0:d=0.3,fade=out:st=${dur - 0.6}:d=0.6` : "";
  execFileSync(FF, ["-v", "error", "-y", "-filter_complex",
    `color=c=0x303030:s=320x180:r=60:d=${dur}[bg];color=c=white:s=80x80:r=60:d=${dur}[b];[bg][b]overlay=x='round(${x})':y=50:eval=frame:format=rgb,format=yuv420p${fades}[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", file]);
}
/** A white card with a faint grey edge on a near-white ground, drifting right half a pixel a frame; w(n) is its width
 *  (an ffmpeg expression of the frame number n). White on white: the luma difference barely sees it, the edges do. */
function paper(file, w, { dur = 4 } = {}) {
  execFileSync(FF, ["-v", "error", "-y", "-filter_complex",
    `color=c=0xF3F3F1:s=320x180:r=60:d=${dur}[bg];color=c=white:s=160x90:r=60:d=${dur},drawbox=x=0:y=0:w=iw:h=ih:color=0xD8D8D8:t=2,format=rgba[p0];` +
    `[p0]scale=w='2*trunc((${w})/2)':h=-2:eval=frame[p];[bg][p]overlay=x='40+n*0.5':y='(main_h-overlay_h)/2':eval=frame:format=rgb,format=yuv420p,fade=in:st=0:d=0.3,fade=out:st=${dur - 0.6}:d=0.6[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", file]);
}
const read = (t0, t1, what, extra = {}) => ({ t0, t1, what, kind: "visual", important: true, lead: "畫面中間唯一在動的方塊", ...extra });
function film(name, { script, x, fade, tests = false, make }) {
  const dir = fresh(tests ? `rp/videos/p/tests/_${name}` : `rp-${name}`);
  mkdirSync(join(dir, "direction")); mkdirSync(join(dir, "renders")); mkdirSync(join(dir, "build"));
  writeFileSync(join(dir, "build/sections.json"), JSON.stringify({ bpm: 120, offset: 0, beatsPerBar: 4 }));
  writeFileSync(join(dir, "direction/script.json"), JSON.stringify({ message: "測試。", total: 4, ...script }));
  const mp4 = join(dir, "renders/draft-1.mp4"); if (make) make(mp4); else clip(mp4, x, { fade });
  if (!tests) {   // films name their rulers (the side-by-side is required); a ruler is just another clip here
    const ruler = join(dir, "build/ruler.mp4"); clip(ruler, "40+60*t");
    writeFileSync(join(dir, "direction/rulers.json"), JSON.stringify({ rulers: [{ id: "r", title: "尺", file: "build/ruler.mp4", moments: [{ t: 1.0, what: "主角拍" }, { t: 2.5, what: "元件" }] }] }));
  }
  return { dir, mp4, out: join(dir, "review") };
}
// a clean film: a slow drift, one burst landing on the beat at 1.0 s, a fade in and a fade out
const CLEAN = {
  beats: [{ id: "01", t0: 0, t1: 1.0, verb: "看", big: "看", proof: "情境示意", reads: [read(0.3, 0.95, "方塊", { crop: [0, 0, 160, 90] })] },
          { id: "02", t0: 1.0, t1: 4.0, verb: "移", big: "移", proof: "情境示意", reads: [read(1.1, 1.9, "方塊到右邊")] }],
  seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 1.0, kind: "seam", device: "爆衝" }, { id: "close", t: 4.0, kind: "close", device: "淡出" }],
};
const cleanX = `20+5*t+150*${smooth(0.9, 1.1)}`;
const pack = (f, ...more) => node("scripts/review-pack.mjs", [f.dir, f.mp4, "--no-png", ...more]);
/** Answer MOTION.md (tests/motion-pass.test.mjs is the one that checks the answers). */
function fillMotion(f) {
  const m = join(f.out, "MOTION.md");
  if (!existsSync(m)) return;
  writeFileSync(m, readFileSync(m, "utf8").replace(/^(\s*)留：\s*$/gm, "$1留：測試留著").replace(/^範例：\s*$/m, "範例：無：測試沒有範例可用").replace(/^元件：\s*$/m, "元件：無：測試沒有查登錄庫").replace(/^最弱處：\s*$/m, "最弱處：第 1 秒的移動偏弱").replace(/^另一種表達：\s*$/m, "另一種表達：改成從右邊掃進來"));
}
const check = (f) => { fillMotion(f); return node("scripts/review-pack.mjs", ["--check", f.out]); };
const findings = (f) => JSON.parse(readFileSync(join(f.out, "pack.json"), "utf8")).findings;
const fails = (f) => findings(f).filter((q) => q.level === "FAIL");
/** Fill the checklist: tick every box, answer every item (by default with the first frame of its own window). */
function fill(f, answer = (frames) => `看過 f${String(frames[0]).padStart(4, "0")}，事件讀得出來`) {
  let frames = null;
  const done = readFileSync(join(f.out, "CHECKLIST.md"), "utf8").split("\n").map((l) => {
    if (/^\s*- \[ \]/.test(l)) { const m = [...l.matchAll(/f(\d{4})/g)].map((x) => +x[1]); frames = m.length ? m : frames; return l.replace("- [ ]", "- [x]"); }
    return /^\s*答：\s*$/.test(l) ? `  答：${answer(frames)}` : l;
  });
  writeFileSync(join(f.out, "CHECKLIST.md"), done.join("\n"));
  independent(f);
}
/** The independent reviewer's notes (by default: nothing found, citing the film's first frame in the pack). */
const FIRST = { 這支片在說什麼: "方塊從左邊移到右邊", 最記得的一刻: "1 秒的爆衝 f0060", 哪裡無聊: "後半段只剩方塊漂著", 對得上嗎: "對得上" };
const independent = (f, body = "- [ok] 看過全片與每個接縫 f0000", who = "fresh subagent", first = FIRST) =>
  writeFileSync(join(f.out, "INDEPENDENT.md"), Object.entries(first).reduce((md, [k, a]) => md.replace(new RegExp(`^${k}：.*$`, "m"), `${k}：${a}`), readFileSync(join(f.out, "INDEPENDENT.md"), "utf8"))
    .replace(/^審片者：.*$/m, `審片者：${who}`).replace(/## 發現[\s\S]*$/, `## 發現\n\n${body}\n`));

test("a clean draft: labelled windows, no measured FAIL; the checklist gates until every answer cites its own frames; PASS.json binds the render", () => {
  const f = film("clean", { script: CLEAN, x: cleanX });
  const r = pack(f); assert.equal(r.code, 0, r.out);
  for (const p of ["sheet.jpg", "beats/00-01.jpg", "beats/01-02.jpg", "seams/open.jpg", "seams/S1.jpg", "seams/close.jpg", "reads/00-01-1-start.jpg", "reads/00-01-1-end.jpg", "crops/00-01-1.jpg",
    "lint.txt", "beat-check.txt", "motion-profile.txt", "film-metrics.txt", "timing.txt", "timing.svg", "pack.json", "CHECKLIST.md", "ruler/side-by-side.jpg", "ruler/metrics.txt"]) assert.ok(existsSync(join(f.out, p)), p);
  assert.deepEqual(fails(f), [], "nothing measured fails on the clean clip");
  const md = readFileSync(join(f.out, "CHECKLIST.md"), "utf8");
  assert.match(md, /- \[ \] \*\*整支同一個速度\*\*/, "the failure list is in the checklist");
  assert.doesNotMatch(md, /- \[ \] \*\*(一閃就過|閃格|結尾凍住)\*\*/, "what the measures judge is not a box to tick");
  assert.match(md, /- \[ \] \*\*每一拍同一個版型\*\*/, "…with the template-every-beat item");
  assert.match(md, /## 3\. 和尺並排[\s\S]*\*\*和尺比\*\*.*構圖、主體、材質、數字.*<!-- ruler -->/, "the side-by-side is a required section, one summary item");
  assert.match(readFileSync(join(f.out, "ruler/metrics.txt"), "utf8"), /draft-1\.mp4[\s\S]*ruler\.mp4/, "the metrics table has the draft and the ruler");
  // trimmed 2026-10-29: no per-beat, per-seam or per-read questions (the measures and the independent review cover them)
  assert.doesNotMatch(md, /<!-- (beat|seam):/, "no per-beat or per-seam items");
  assert.equal([...md.matchAll(/<!-- read:/g)].length, 1, "one read item: the first event");
  assert.equal([...md.matchAll(/^\s*答：/gm)].length, 2, "two answers: the first event and the rulers");
  assert.equal(md.match(/這是片子的第一件事/g)?.length, 1, "only the earliest important read asks to read at first glance");
  assert.match(md, /<!-- read:00-01-1 -->\n.*這是片子的第一件事/, "…and it is the first beat's read");
  assert.match(md, /\*\*00-01-1\*\*|\*\*01「方塊」\*\*/, "the first read is named");
  assert.match(readFileSync(join(f.out, "timing.txt"), "utf8"), /## 02（1–4 秒）[\s\S]*停留/);
  assert.equal(check(f).code, 1, "an empty checklist fails");
  // answers without frames, frames that are not in the pack, frames of another item: none of them count
  fill(f, () => "看過了"); let c = check(f); assert.equal(c.code, 1); assert.match(c.out, /答案沒有引用影格/);
  pack(f, "--force"); fill(f, () => "看過 f9999"); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /不在審片包裡/);
  pack(f, "--force"); fill(f, () => "看過 f0000"); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /不在這一項的表或靜圖裡/);
  pack(f, "--force"); fill(f); c = check(f); assert.equal(c.code, 0, c.out);
  const P = JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8"));
  assert.equal(P.mode, "full"); assert.equal(P.sha256.length, 64); assert.equal(P.counts.fail, 0);
  assert.match(c.out, /PASS draft-1\.mp4 [0-9a-f]{12} · FAIL 0/);
  assert.equal(node("scripts/review-pack.mjs", ["--verify", f.out]).code, 0);
  // a re-encode of the same picture can be attached; a different picture cannot
  const small = join(f.dir, "renders/draft-1-small.mp4");
  execFileSync(FF, ["-v", "error", "-y", "-i", f.mp4, "-c:v", "libx264", "-crf", "30", small]);
  assert.equal(node("scripts/review-pack.mjs", ["--verify", f.out, small]).code, 1, "an unattached re-encode is not covered");
  const at = node("scripts/review-pack.mjs", ["--attach", f.out, small]); assert.equal(at.code, 0, at.out);
  assert.equal(node("scripts/review-pack.mjs", ["--verify", f.out, small]).code, 0);
  const other = join(f.dir, "renders/other.mp4"); clip(other, "20+100*t");
  assert.equal(node("scripts/review-pack.mjs", ["--attach", f.out, other]).code, 1, "a different picture is not a re-encode");
  // any change to the render invalidates the pass
  appendFileSync(f.mp4, Buffer.from([0]));
  const v = node("scripts/review-pack.mjs", ["--verify", f.out]); assert.equal(v.code, 1); assert.match(v.out, /改過了/);
  c = check(f); assert.equal(c.code, 1); assert.match(c.out, /render 在做審片包之後改過了/);
  assert.ok(!existsSync(join(f.out, "PASS.json")), "a failed check removes the old PASS.json");
});

test("films need an independent review: a named reviewer, findings citing frames in the pack, every [!] answered", () => {
  const f = film("indep", { script: CLEAN, x: cleanX });
  pack(f);
  assert.match(readFileSync(join(f.out, "INDEPENDENT.md"), "utf8"), /沒有參與製作/);
  fill(f); writeFileSync(join(f.out, "INDEPENDENT.md"), readFileSync(join(f.out, "INDEPENDENT.md"), "utf8").replace(/## 發現[\s\S]*$/, "## 發現\n"));
  let c = check(f); assert.equal(c.code, 1); assert.match(c.out, /獨立審片還沒做/);
  independent(f, "- [ok] 看過全片", ""); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /沒寫審片者/); assert.match(c.out, /獨立審片沒引用影格/);
  independent(f, "- [ok] 看過 f9999"); c = check(f); assert.match(c.out, /不在審片包裡/);
  independent(f, "- [!] S1 煞車太硬 f0000"); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /還沒回「處理：」/);
  independent(f, "- [!] S1 煞車太硬 f0000\n  處理：交給使用者判斷，回報裡問"); c = check(f); assert.equal(c.code, 0, c.out);
  assert.match(c.out, /· 獨立 1/);
  const P = JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8"));
  assert.equal(P.independent.reviewer, "fresh subagent"); assert.equal(P.independent.findings[0].response, "交給使用者判斷，回報裡問");
  assert.equal(pack(f).code, 3, "a filled independent review is not overwritten either");
  rmSync(join(f.out, "INDEPENDENT.md")); rmSync(join(f.out, "PASS.json")); c = check(f); assert.match(c.out, /沒有 .*INDEPENDENT\.md/);
});

test("measured problems fail outright (a stutter, a frozen tail, a hard open and close) unless the user waived them", () => {
  const f = film("bad", { script: CLEAN, x: STUTTER, fade: false });
  assert.equal(pack(f).code, 0);
  const codes = new Set(fails(f).map((q) => q.code));
  for (const c of ["stutter", "frozen-tail", "hard-close"]) assert.ok(codes.has(c), `${c} in ${[...codes]}`);
  assert.ok(!codes.has("hard-open"), "it moves from the first frame: allowed (「或第一格就在動」)");
  fill(f); let c = check(f); assert.equal(c.code, 1, "a ticked checklist does not release a measured FAIL"); assert.match(c.out, /量測 FAIL `stutter`/);
  const waive = (w) => writeFileSync(join(f.dir, "review-waivers.json"), JSON.stringify([...codes].map((check) => ({ check, reason: "測試片段", ...w }))));
  waive({ approved_by: "Claude", quote: "可以" }); assert.equal(check(f).code, 1, "a waiver the model approved does not count");
  waive({ approved_by: "使用者" }); assert.equal(check(f).code, 1, "no quote of the user's words, no waiver");
  waive({ approved_by: "使用者", quote: "這段先這樣沒關係", date: "2026-10-25" });
  c = check(f); assert.equal(c.code, 0, c.out);
  const P = JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8"));
  assert.ok(P.waived.length >= codes.size && P.waived.every((w) => w.quote === "這段先這樣沒關係"), "the waivers are carried into PASS.json");
});

test("a major seam off the beat by more than 0.1 s and a hold after the last read longer than 1.2 s fail; an ordinary seam off the beat warns", () => {
  const script = (S1) => ({
    beats: [{ id: "01", t0: 0, t1: 2.5, verb: "看", big: "看", proof: "情境示意", reads: [read(0.3, 0.95, "方塊")] },
            { id: "02", t0: 2.5, t1: 4.0, verb: "移", big: "移", proof: "情境示意", reads: [read(2.4, 3.0, "方塊到右邊")] }],
    seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 2.5, kind: "seam", device: "爆衝", ...S1 }, { id: "close", t: 4.0, kind: "close", device: "淡出" }],
  });
  const late = `20+150*${smooth(2.6, 2.8)}`;   // the burst peaks at 2.7 s: 0.2 s after the beat
  const g = film("late-minor", { script: script({}), x: late, tests: true });
  assert.equal(pack(g).code, 0);
  const minor = findings(g).filter((q) => q.code === "seam-beat");
  assert.ok(minor.length && minor.every((q) => q.level === "WARN" && /一般接縫只提醒/.test(q.msg)), JSON.stringify(findings(g)));
  const f = film("late", { script: script({ major: true }), x: late });
  assert.equal(pack(f).code, 0);
  const F = fails(f), by = (c) => F.find((q) => q.code === c);
  assert.equal(by("seam-beat")?.id, "S1", JSON.stringify(F));
  assert.equal(by("hold-long")?.id, "01", JSON.stringify(F));
  assert.match(by("hold-long").msg, /停太久/);
  assert.match(readFileSync(join(f.out, "timing.txt"), "utf8"), /停留 .*✗/);
});

test("reads shorter than needed and overlapping important reads fail (from the read table)", () => {
  const script = { ...CLEAN, beats: [{ ...CLEAN.beats[0], reads: [read(0.3, 0.6, "一閃就過"), read(0.4, 0.95, "同時兩件事")] }, CLEAN.beats[1]] };
  const f = film("short", { script, x: cleanX });
  assert.equal(pack(f).code, 0);
  const codes = fails(f).map((q) => q.code);
  assert.ok(codes.includes("read-short") && codes.includes("read-overlap"), codes.join());
});

test("a test clip (tests/_*) is measured only: no checklist; an excerpt's hard open and frozen tail warn, a stutter fails", () => {
  const script = { beats: [{ id: "01", t0: 0, t1: 4, verb: "看", big: "看", proof: "情境示意", reads: [read(0.2, 1.0, "方塊")] }] };
  const f = film("excerpt", { script, x: "if(lt(t,2),20+120*t,260)", fade: false, tests: true });   // moves for 2 s, then holds
  const r = pack(f); assert.equal(r.code, 0, r.out); assert.match(r.out, /試片：只量測/);
  assert.ok(!existsSync(join(f.out, "CHECKLIST.md")));
  assert.ok(findings(f).some((q) => q.code === "frozen-tail" && q.level === "WARN"), JSON.stringify(findings(f).map((q) => [q.code, q.level])));
  let c = check(f); assert.equal(c.code, 0, c.out);
  assert.equal(JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8")).mode, "measure");
  const g = film("stutter", { script, x: STUTTER, fade: false, tests: true });
  pack(g); c = check(g); assert.equal(c.code, 1); assert.match(c.out, /stutter/);
});

// 2026-10-29 (the user approved relaxing the gate:「一鏡到底，是個方法，但不應該是限制」): a stop of 1–2 frames only warns.
test("a stop of 1–2 frames warns, 3 frames or more fails (stutter)", () => {
  const stop = (d) => `if(lt(t,1),20+120*t,if(lt(t,1+${d + 1}/60-0.001),140,142+120*(t-1-${d + 1}/60)))`;   // d frames without change
  const script = { beats: [{ id: "01", t0: 0, t1: 4, verb: "看", big: "看", proof: "情境示意", reads: [read(0.2, 1.0, "方塊")] }] };
  const two = film("stop2", { script, x: stop(2), fade: false, tests: true }); pack(two);
  const s2 = findings(two).filter((q) => q.code === "stutter");
  assert.ok(s2.length && s2.every((q) => q.level === "WARN"), JSON.stringify(s2));
  assert.equal(check(two).code, 0);
  const three = film("stop3", { script, x: stop(3), fade: false, tests: true }); pack(three);
  assert.ok(fails(three).some((q) => q.code === "stutter"), JSON.stringify(findings(three)));
});

test("the JS motion profile agrees with motion-profile.py on stutters and the still tail", () => {
  const f = film("parity", { script: CLEAN, x: STUTTER, fade: false });
  const py = execFileSync("python3", [join(root, "scripts/measure/motion-profile.py"), f.mp4], { encoding: "utf8", env: { ...process.env, PATH: [dirname(FF), dirname(FP), process.env.PATH].join(delimiter) } });
  pack(f);
  const js = readFileSync(join(f.out, "motion-profile.txt"), "utf8"), num = (s, re) => s.match(re)?.[1];
  assert.equal(num(js, /stutters (\d+)/), num(py, /stutters (\d+)/));
  assert.equal(num(js, /still at the end ([\d.]+)/), num(py, /still at the end ([\d.]+)/));
});

// Film C draft 12c (2026-10-25, an independent reviewer): the white paper plane on the near-white ground jumped in one frame
// (f2761 → f2762) to a far-off dot and grew back over the next frames; the luma measures saw almost nothing and --check passed.
test("a one-frame snap of a white subject on a near-white ground fails (edges, not luma); a hard step warns, and not at a seam", () => {
  const SNAPW = "100*if(lt(n,120),1,min(1,0.1+0.9*(n-120)/30))";   // at 2.0 s the card is a tenth of its size for a frame, then grows back
  const f = film("snap", { script: CLEAN, make: (mp4) => paper(mp4, SNAPW) });
  assert.equal(pack(f).code, 0);
  const snap = fails(f).find((q) => q.code === "snap");
  assert.ok(snap, JSON.stringify(findings(f).map((q) => [q.level, q.code, q.id])));
  assert.equal(snap.t, 2); assert.match(snap.msg, /f0119 → f0120/);
  fill(f); const c = check(f); assert.equal(c.code, 1, "a ticked checklist does not release a snap"); assert.match(c.out, /量測 FAIL `snap`/);
  // the same card, no snap: nothing; a size step that stays (a swap): a warning off the seams, nothing on one
  const smooth = film("snap-none", { script: CLEAN, make: (mp4) => paper(mp4, "100") });
  pack(smooth); assert.ok(!findings(smooth).some((q) => ["snap", "snap-seam", "pop"].includes(q.code)), JSON.stringify(findings(smooth).map((q) => q.code)));
  const step = film("pop", { script: CLEAN, make: (mp4) => paper(mp4, "if(lt(n,120),100,40)") });
  pack(step); const F = findings(step);
  assert.ok(!F.some((q) => q.code === "snap") && F.some((q) => q.code === "pop" && q.level === "WARN" && q.t === 2), JSON.stringify(F.map((q) => [q.level, q.code, q.t])));
  const atSeam = film("pop-seam", { script: { ...CLEAN, seams: [...CLEAN.seams, { id: "S2", t: 2.0, kind: "seam", device: "硬切" }] }, make: (mp4) => paper(mp4, "if(lt(n,120),100,40)") });
  pack(atSeam); assert.ok(!findings(atSeam).some((q) => q.code === "pop"), "a hard step at a seam is the seam");
  // a test clip fails on it too, and motion-profile.py counts the same snaps
  const clipT = film("snap", { script: { beats: [{ id: "01", t0: 0, t1: 4, verb: "看", big: "看", proof: "情境示意", reads: [read(0.2, 1.0, "卡片")] }] }, tests: true, make: (mp4) => paper(mp4, SNAPW) });
  pack(clipT); assert.ok(fails(clipT).some((q) => q.code === "snap"));
  const py = execFileSync("python3", [join(root, "scripts/measure/motion-profile.py"), f.mp4], { encoding: "utf8", env: { ...process.env, PATH: [dirname(FF), dirname(FP), process.env.PATH].join(delimiter) } });
  assert.match(py, /snaps 1 \[\(2\.0, 120\)\]/);
  assert.match(readFileSync(join(f.out, "motion-profile.txt"), "utf8"), /snaps 1 \[\[2,120\]\]/);
});

// Film C (2026-10-26): a later pack written into the same default review/ wiped a filled checklist and a PASS, twice.
test("a new pack does not overwrite a review that still holds (a valid PASS.json, a filled checklist) unless --force", () => {
  const f = film("guard", { script: CLEAN, x: cleanX });
  assert.equal(pack(f).code, 0);
  assert.equal(pack(f).code, 0, "an untouched checklist may be replaced");
  fill(f); assert.equal(check(f).code, 0);
  const passed = readFileSync(join(f.out, "PASS.json"), "utf8"), md = readFileSync(join(f.out, "CHECKLIST.md"), "utf8");
  const other = join(f.dir, "renders/draft-2.mp4"); clip(other, cleanX);
  let r = node("scripts/review-pack.mjs", [f.dir, other, "--no-png"]);
  assert.equal(r.code, 3, r.out); assert.match(r.out, /PASS\.json/); assert.match(r.out, /--out .*review-draft-2/);
  assert.equal(readFileSync(join(f.out, "PASS.json"), "utf8"), passed, "the PASS is untouched");
  assert.equal(readFileSync(join(f.out, "CHECKLIST.md"), "utf8"), md, "so is the filled checklist");
  r = node("scripts/review-pack.mjs", [f.dir, other, "--no-png", "--out", join(f.dir, "review-draft-2")]); assert.equal(r.code, 0, r.out);
  assert.equal(node("scripts/review-pack.mjs", ["--verify", f.out]).code, 0, "draft 1's PASS still holds beside draft 2's pack");
  // a filled checklist without a PASS is kept too; a PASS that no longer holds (the render changed) is not worth keeping
  rmSync(join(f.out, "PASS.json")); assert.equal(pack(f).code, 3, "a filled checklist");
  r = pack(f, "--force"); assert.equal(r.code, 0, r.out); assert.doesNotMatch(readFileSync(join(f.out, "CHECKLIST.md"), "utf8"), /答：看過/);
  fill(f); assert.equal(check(f).code, 0); appendFileSync(f.mp4, Buffer.from([0]));
  writeFileSync(join(f.out, "CHECKLIST.md"), readFileSync(join(f.out, "CHECKLIST.md"), "utf8").replace(/- \[x\]/g, "- [ ]").replace(/答：.*/g, "答："));
  independent(f, "");
  assert.equal(pack(f).code, 0, "a stale PASS does not block");
});

// Film C dark-draft-6 (2026-10-26): headlines still up while the seam's content moved through them (S4, S8, S10).
/** A white headline bar bottom left from 0.5 s on a near-black ground; a square passes at y (through the bar, or well above it). */
function headline(file, y) {
  execFileSync(FF, ["-v", "error", "-y", "-filter_complex",
    `color=c=0x080808:s=320x180:r=60:d=4,drawbox=x=20:y=140:w=120:h=14:color=white:t=fill:enable='gte(t,0.5)'[bg];color=c=white:s=24x24:r=60:d=4[b];` +
    `[bg][b]overlay=x='340-370*min(1,max(0,t-1.5))':y=${y}:eval=frame:format=rgb,format=yuv420p,fade=in:st=0:d=0.3,fade=out:st=3.4:d=0.6[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", file]);
}
test("content moving through a headline's zone while the headline is up warns (head-cross); clear of it, or without a zone, it does not", () => {
  const head = { t0: 0.5, t1: 3.0, what: "標題", text: "標題", kind: "text", important: true, lead: "唯一的字" };
  const script = { headline_zone: [60, 780, 1200, 240], beats: [{ id: "01", t0: 0, t1: 4, verb: "看", big: "看", proof: "情境示意", reads: [head] }],
    seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "close", t: 4.0, kind: "close", device: "淡出" }] };
  const through = film("head-through", { script, make: (mp4) => headline(mp4, 136) });
  assert.equal(pack(through).code, 0);
  const w = findings(through).find((q) => q.code === "head-cross");
  assert.ok(w && w.level === "WARN" && w.id === "01#1", JSON.stringify(findings(through).map((q) => [q.level, q.code, q.id])));
  assert.ok(w.t >= 1.5 && w.t < 2.5, `crosses at ${w.t}`); assert.match(w.msg, /標題「標題」還在畫面上/);
  const clear = film("head-clear", { script, make: (mp4) => headline(mp4, 30) });
  pack(clear); assert.ok(!findings(clear).some((q) => q.code.startsWith("head-")), JSON.stringify(findings(clear).map((q) => q.code)));
  const { headline_zone, ...noZone } = script;
  const unset = film("head-unset", { script: noZone, make: (mp4) => headline(mp4, 136) });
  pack(unset); const F = findings(unset);
  assert.ok(F.some((q) => q.code === "head-zone" && q.level === "WARN") && !F.some((q) => q.code === "head-cross"), JSON.stringify(F.map((q) => q.code)));
});

test("films must compare against their rulers: no rulers.json, or a ruler file that is gone, fails; tests clips do not need one", () => {
  const f = film("noruler", { script: CLEAN, x: cleanX });
  rmSync(join(f.dir, "direction/rulers.json"));
  pack(f); assert.ok(fails(f).some((q) => q.code === "no-ruler"), "no rulers.json fails");
  fill(f); let c = check(f); assert.equal(c.code, 1); assert.match(c.out, /no-ruler/);
  writeFileSync(join(f.dir, "direction/rulers.json"), JSON.stringify({ rulers: [{ id: "gone", file: "build/nothere.mp4", moments: [{ t: 1 }] }] }));
  pack(f, "--force"); assert.ok(fails(f).some((q) => q.code === "ruler-file"), "a missing ruler file fails");
  const t = film("ruler-test", { script: CLEAN, x: cleanX, tests: true });
  pack(t); assert.ok(!fails(t).some((q) => q.code === "no-ruler" || q.code === "ruler-file"), "a test clip needs no rulers");
  assert.ok(!existsSync(join(t.out, "ruler")), "and gets no ruler folder");
});

// Film E draft 28 (2026-10-29, an independent reviewer): S5 and S7, written as「字爆成數字」「段落甩上去」, were dissolves (the old
// and new words semi-transparent together) and every measure passed. User: hard cuts, whips, bar wipes, colour floods on the beat
// are all fine; the one banned hand-over is a dissolve.
/** Two pictures (a white square left, a white bar right, on dark grey) handed over at 2.0 s by an xfade transition, or a cut. */
function handover(file, how) {
  const a = "color=c=0x303030:s=320x180:r=60:d=4,drawbox=x=30:y=40:w=90:h=90:color=white:t=fill,format=yuv420p";
  const b = "color=c=0x303030:s=320x180:r=60:d=4,drawbox=x=170:y=70:w=130:h=40:color=0xC0C0FF:t=fill,drawbox=x=170:y=125:w=90:h=12:color=white:t=fill,format=yuv420p";
  const join = how === "cut" ? "[a]trim=0:2,setpts=PTS-STARTPTS[a2];[b]trim=0:2,setpts=PTS-STARTPTS[b2];[a2][b2]concat=n=2:v=1" : `[a]trim=0:2.15,setpts=PTS-STARTPTS[a2];[b]trim=0:2.15,setpts=PTS-STARTPTS[b2];[a2][b2]xfade=transition=${how}:duration=0.3:offset=1.85`;
  execFileSync(FF, ["-v", "error", "-y", "-filter_complex", `${a}[a];${b}[b];${join},fade=in:st=0:d=0.3,fade=out:st=3.4:d=0.6[v]`, "-map", "[v]", "-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", file]);
}
test("a dissolve at a seam fails (seam-dissolve); a cut, a wipe or a slide does not", () => {
  const script = { ...CLEAN, beats: [{ ...CLEAN.beats[0], t1: 2.0, reads: [read(0.3, 1.5, "方塊")] }, { ...CLEAN.beats[1], t0: 2.0, reads: [read(2.2, 3.0, "長條")] }],
    seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 2.0, kind: "seam", device: "交棒" }, { id: "close", t: 4.0, kind: "close", device: "淡出" }] };
  const f = film("dissolve", { script, make: (mp4) => handover(mp4, "fade") });
  assert.equal(pack(f).code, 0);
  const d = fails(f).find((q) => q.code === "seam-dissolve");
  assert.ok(d && d.id === "S1", JSON.stringify(findings(f).map((q) => [q.level, q.code, q.id])));
  assert.match(d.msg, /溶接/); assert.match(readFileSync(join(f.out, "dissolve.txt"), "utf8"), /S1 .*← 溶接/);
  for (const how of ["cut", "wipeleft", "slideleft"]) {
    const g = film(`handover-${how}`, { script, make: (mp4) => handover(mp4, how) });
    pack(g); assert.ok(!findings(g).some((q) => q.code === "seam-dissolve"), `${how}: ${JSON.stringify(findings(g).map((q) => [q.code, q.id]))}`);
  }
  const t = film("dissolve", { script, tests: true, make: (mp4) => handover(mp4, "fade") });
  pack(t); assert.ok(fails(t).some((q) => q.code === "seam-dissolve"), "a test clip fails on it too");
});

// Film E draft 28 (2026-10-29, an independent reviewer): catch and compare were small type spread over an empty field (「重點太小、
// 空白太多」), measured nowhere; film D drafts 6 and 7, a big verb or object every beat, are the measure's other side.
test("a film whose key subject is tiny in an empty frame fails (subject-small); a big subject passes; a test clip is not measured", () => {
  const tiny = (mp4) => execFileSync(FF, ["-v", "error", "-y", "-filter_complex", "color=c=0x303030:s=320x180:r=60:d=4,drawbox=x='100+t*5':y=80:w=8:h=8:color=white:t=fill,fade=in:st=0:d=0.3,fade=out:st=3.4:d=0.6,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", mp4]);
  const f = film("small", { script: CLEAN, make: tiny });
  assert.equal(pack(f).code, 0);
  const s = fails(f).filter((q) => q.code === "subject-small");
  assert.ok(s.length >= 1 && s[0].id === "01#1", JSON.stringify(findings(f).map((q) => [q.level, q.code, q.id])));
  assert.match(s[0].msg, /主體太小/); assert.match(readFileSync(join(f.out, "subject.txt"), "utf8"), /← 太小/);
  const big = film("big", { script: CLEAN, x: cleanX });
  pack(big); assert.ok(!findings(big).some((q) => q.code === "subject-small"), "the 80 px square (480 px at 1080p) is big enough");
  const t = film("small", { script: CLEAN, tests: true, make: tiny });
  pack(t); assert.ok(!findings(t).some((q) => q.code === "subject-small"), "test clips are excerpts: not measured");
});

// User (2026-10-29):「不確定你想要表達什麼」「我覺得我沒有被驚艷到」— the independent reviewer says what the film is saying, the
// moment it remembers and what is boring before it reads the one sentence; a mismatch or no moment must be a [!].
test("the independent review starts with a first look: what it says, the moment remembered, what is boring, then whether it matches", () => {
  const f = film("first-look", { script: CLEAN, x: cleanX });
  pack(f);
  const md = readFileSync(join(f.out, "INDEPENDENT.md"), "utf8");
  assert.match(md, /這支片在說什麼：[\s\S]*最記得的一刻：[\s\S]*哪裡無聊：[\s\S]*之後才讀那一句話[\s\S]*對得上嗎：[\s\S]*## 發現/);
  fill(f);
  independent(f, undefined, undefined, { ...FIRST, 哪裡無聊: "" }); let c = check(f); assert.equal(c.code, 1); assert.match(c.out, /沒答「哪裡無聊」/);
  independent(f, undefined, undefined, { ...FIRST, 最記得的一刻: "沒有" }); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /說不出最記得的一刻/);
  independent(f, "- [!] 沒有驚艷的一刻 f0000\n  處理：交給使用者判斷，回報裡問", undefined, { ...FIRST, 最記得的一刻: "沒有" }); c = check(f); assert.equal(c.code, 0, c.out);
  independent(f, undefined, undefined, { ...FIRST, 對得上嗎: "對不上：看起來在講方塊漂移" }); c = check(f); assert.equal(c.code, 1); assert.match(c.out, /對不上那一句話/);
  independent(f); c = check(f); assert.equal(c.code, 0, c.out);
  assert.equal(JSON.parse(readFileSync(join(f.out, "PASS.json"), "utf8")).independent.first_look.moment, "1 秒的爆衝 f0060");
});

test("references are part of the gate: a hero beat with no reference fails no-ref; a bound card puts this render next to its frames (refs/)", () => {
  const unbound = film("ref-none", { script: { ...CLEAN, beats: CLEAN.beats.map((b, i) => (i ? b : { ...b, hero: true })) }, x: cleanX });
  pack(unbound); assert.ok(fails(unbound).some((q) => q.code === "no-ref" && q.id === "01"), JSON.stringify(fails(unbound)));
  rmSync(join(PROFILE_DIR, "references-log.jsonl"), { force: true });
  const f = film("ref-bound", { script: CLEAN, x: cleanX }), env = { VSO_LINK_CHECK: "off" };
  const r = node("scripts/refs.mjs", ["add", f.dir, "--file", join(f.dir, "build/ruler.mp4"), "--title", "尺的方塊", "--why", "爆衝", "--at", "0.5-1.5", "--take", "motion=慢 → 爆衝 → 滑停"], env);
  const id = /id ([0-9a-f]{8})/.exec(r.out)?.[1]; assert.ok(id, r.out);
  const S = JSON.parse(readFileSync(join(f.dir, "direction/script.json"), "utf8"));
  S.beats[0] = { ...S.beats[0], hero: true, refs: [id] }; S.seams[1].refs = [id];
  writeFileSync(join(f.dir, "direction/script.json"), JSON.stringify(S));
  assert.equal(pack(f).code, 0);
  assert.ok(!fails(f).some((q) => q.code === "no-ref"));
  for (const x of ["refs/beat-01.jpg", "refs/seam-S1.jpg", "refs/refs.txt"]) assert.ok(existsSync(join(f.out, x)), x);
  assert.match(readFileSync(join(f.out, "refs/refs.txt"), "utf8"), /## 拍 01[\s\S]*借動態：慢 → 爆衝 → 滑停/);
  assert.match(readFileSync(join(f.out, "INDEPENDENT.md"), "utf8"), /refs\.txt/);
});

test("hard open and close: a still full picture fails; a fade from black or from white, or a first frame already moving, does not", () => {
  const make = (name, vf) => film(name, { script: CLEAN, make: (f) => execFileSync(FF, ["-v", "error", "-y", "-filter_complex",
    `color=c=0x303030:s=320x180:r=60:d=4[bg];color=c=white:s=80x80:r=60:d=4[b];[bg][b]overlay=x='if(lt(t,0.6),40,40+60*(t-0.6))':y=50:eval=frame:format=rgb,format=yuv420p${vf}[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", f]) });
  const codes = (f) => { pack(f); return new Set(fails(f).map((q) => q.code)); };
  assert.ok(codes(make("still-start", ",fade=out:st=3.4:d=0.6")).has("hard-open"), "0.6 s of a still full picture");
  const white = codes(make("white-fade", ",fade=in:st=0:d=0.4:color=white,fade=out:st=3.4:d=0.6:color=white"));
  assert.ok(!white.has("hard-open") && !white.has("hard-close"), `fades from and to white are fades: ${[...white]}`);
});

test("one composition held longer than staticShot between big moves fails static-shot; moves every 2.2 s pass (an earlier film's beat 03)", () => {
  const script = { total: 6, beats: [{ id: "01", t0: 0, t1: 6, verb: "看", big: "看", proof: "情境示意", reads: [read(0.6, 1.4, "方塊"), read(2.8, 3.6, "方塊"), read(5.0, 5.4, "方塊")] }] };
  const make = (x) => (mp4) => clip(mp4, x, { dur: 6, fade: false });
  const still = film("static-shot", { script, tests: true, make: make(`20+120*${smooth(0.3, 0.5)}`) });
  pack(still);
  assert.ok(fails(still).some((q) => q.code === "static-shot"), JSON.stringify(findings(still)));
  const moving = film("static-shot-ok", { script, tests: true, make: make(`20+60*${smooth(0.3, 0.5)}+60*${smooth(2.5, 2.7)}+60*${smooth(4.7, 4.9)}`) });
  pack(moving);
  assert.ok(!fails(moving).some((q) => q.code === "static-shot"), JSON.stringify(findings(moving)));
});

test("a render drawn differently from the composition at a key pose fails render-mismatch, in a test clip too", () => {
  // the composition: a still white card (a third of the frame); the renders: the same card, or the ground alone
  const page = `<!doctype html><html><head><style>*{margin:0}body{width:320px;height:180px;background:#303030}#b{position:absolute;left:90px;top:30px;width:140px;height:120px;background:#fff}</style></head>
<body><div data-composition-id="t" data-duration="4"><div id="b"></div></div><script>window.__timelines={t:{seek(t){},duration(){return 4}}};</script></body></html>`;
  const render = (card) => (mp4) => execFileSync(FF, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x303030:s=320x180:r=60:d=4",
    ...(card ? ["-vf", "drawbox=x=90:y=30:w=140:h=120:color=white:t=fill"] : []), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", mp4]);
  const mismatches = (name, card) => { const f = film(name, { script: CLEAN, tests: true, make: render(card) }); writeFileSync(join(f.dir, "index.html"), page); pack(f); return findings(f).filter((q) => q.code === "render-mismatch"); };
  assert.deepEqual(mismatches("render-same", true), []);
  const gone = mismatches("render-gone", false);
  assert.ok(gone.length && gone.every((q) => q.level === "FAIL"), JSON.stringify(gone));
});

test("the sound is gated: loudness off -14 LUFS and a true peak over -1 dBTP fail; a rise of 5 LU warns; a test clip holds only the peak", () => {
  // a 1 kHz tone (ffmpeg's sine is 18 dB below full scale): +18 dB reads about -3 LUFS with a 0 dBTP peak, +7 dB about -14 LUFS
  const withTone = (af) => (mp4) => { const silent = mp4.replace(/\.mp4$/, "-v.mp4"); clip(silent, cleanX);
    execFileSync(FF, ["-v", "error", "-y", "-i", silent, "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=4", "-af", af, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", mp4]); rmSync(silent); };
  const codes = (name, af, tests = false) => { const f = film(name, { script: CLEAN, tests, make: withTone(af) }); pack(f); return { f, all: findings(f), has: (c, l) => findings(f).some((q) => q.code === c && (!l || q.level === l)) }; };
  const loud = codes("sound-loud", "volume=18dB");
  assert.ok(loud.has("loudness", "FAIL") && loud.has("true-peak", "FAIL"), JSON.stringify(loud.all.filter((q) => /loud|peak/.test(q.code))));
  assert.match(readFileSync(join(loud.f.out, "sound.txt"), "utf8"), /整體響度 -\d/);
  const ok = codes("sound-ok", "volume=7dB");
  assert.ok(!ok.has("loudness") && !ok.has("true-peak") && !ok.has("no-audio"), JSON.stringify(ok.all.filter((q) => /loud|peak|audio/.test(q.code))));
  const jump = codes("sound-jump", "volume='if(lt(t,2),0.5,2)':eval=frame");
  assert.ok(jump.has("loud-jump", "WARN"), JSON.stringify(jump.all.filter((q) => /loud/.test(q.code))));
  const clipLoud = codes("sound-clip", "volume=18dB", true);
  assert.ok(clipLoud.has("true-peak", "FAIL") && !clipLoud.has("loudness"), "a test clip: the peak fails, the integrated loudness is not judged");
  const silent = film("sound-none", { script: CLEAN, x: cleanX }); pack(silent);
  assert.ok(findings(silent).some((q) => q.code === "no-audio" && q.level === "WARN"));
});
