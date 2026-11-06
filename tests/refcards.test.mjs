// Reference cards (scripts/lib/refcards.mjs, refs.mjs card/cards/board): a reference is a node of the plan — tagged with what
// it is for and what to take, its frames cut from a local copy, bound to beats and seams in script.json, required on hero beats
// and major seams by script-lint, and laid out per beat on the maker's board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import { PROFILE, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const FF = createRequire(join(root, "package.json"))("ffmpeg-static");
const env = { VSO_LINK_CHECK: "off" };

test("refs card: tag a logged reference with facets, take and avoid, cut frames and a palette from a local copy; cards lists it", () => {
  rmSync(join(PROFILE, "references-log.jsonl"), { force: true }); rmSync(join(PROFILE, "refs"), { recursive: true, force: true });
  const dir = fresh("refcards/videos/p/films/f"), ref = join(dir, "..", "..", "ref.mp4");
  execFileSync(FF, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x1a2b6d:s=640x360:r=30:d=4", "-f", "lavfi", "-i", "color=c=0xf2b33d:s=160x160:r=30:d=4",
    "-filter_complex", "[0][1]overlay=x='40+n*12':y=100:eval=frame", "-pix_fmt", "yuv420p", ref]);
  let r = node("scripts/refs.mjs", ["add", dir, "--file", ref, "--title", "藍底黃塊掃過", "--why", "交棒乾淨", "--at", "1-3",
    "--facet", "transition", "--take", "transition=黃塊推過去，新畫面跟在後面", "--avoid", "不抄它的藍"], env);
  assert.equal(r.code, 0, r.out);
  const id = /id ([0-9a-f]{8})/.exec(r.out)?.[1]; assert.ok(id, r.out);
  const [card] = JSON.parse(node("scripts/refs.mjs", ["cards", "--json"], env).out);
  assert.equal(card.id, id); assert.deepEqual(card.card.facets, ["transition"]); assert.equal(card.card.avoid, "不抄它的藍");
  assert.equal(card.frames.length, 3, "start, middle, end of the moment"); assert.ok(card.frames.every(existsSync));
  assert.ok(card.card.palette.some((h) => /^#[0-9a-f]{6}$/.test(h)), JSON.stringify(card.card.palette));
  r = node("scripts/refs.mjs", ["card", id, "--take", "camera=鏡頭不動"], env); assert.equal(r.code, 0, r.out);
  assert.match(r.out, /借交棒：黃塊推過去/); assert.match(r.out, /借鏡頭：鏡頭不動/);
  assert.equal(node("scripts/refs.mjs", ["card", id, "--facet", "vibes"], env).code, 1, "an unknown facet is refused");
  assert.match(node("scripts/refs.mjs", ["cards", "--facet", "color"], env).out, /還沒有參考卡/);

  // bound in the plan: lint requires it on the hero beat and the major seam; the board lays it out per node
  const S = { message: "交棒。", total: 4, beats: [{ id: "01", t0: 0, t1: 2, verb: "推", big: "推", proof: "情境示意", hero: true }, { id: "02", t0: 2, t1: 4, verb: "停", big: "停", proof: "情境示意" }],
    seams: [{ id: "open", t: 0, kind: "open", device: "淡入" }, { id: "S1", t: 2, kind: "seam", device: "黃塊掃過", major: true }, { id: "close", t: 4, kind: "close", device: "淡出" }] };
  mkdirSync(join(dir, "direction"), { recursive: true }); const sf = join(dir, "direction/script.json");
  writeFileSync(sf, JSON.stringify(S));
  r = node("scripts/script-lint.mjs", [sf], env); assert.equal(r.code, 1);
  assert.match(r.out, /✗ 01: 主角拍沒有綁參考/); assert.match(r.out, /✗ 接縫 S1: 主要接縫沒有綁參考/);
  assert.equal(node("scripts/refs.mjs", ["board", dir], env).code, 1, "the board flags the unbound required nodes");
  S.beats[0].refs = [id]; S.seams[1].refs = [id, "deadbeef"]; writeFileSync(sf, JSON.stringify(S));
  r = node("scripts/script-lint.mjs", [sf], env); assert.match(r.out, /✗ 接縫 S1: 參考 deadbeef 不在參考紀錄裡/); assert.doesNotMatch(r.out, /沒有綁參考/);
  S.seams[1].refs = [id]; writeFileSync(sf, JSON.stringify(S));
  assert.doesNotMatch(node("scripts/script-lint.mjs", [sf], env).out, /✗/);
  r = node("scripts/refs.mjs", ["board", dir], env); assert.equal(r.code, 0, r.out);
  const md = readFileSync(join(dir, "direction/refboard/BOARD.md"), "utf8");
  assert.match(md, /## 拍 01[\s\S]*借交棒：黃塊推過去[\s\S]*別抄：不抄它的藍/); assert.match(md, /## 接縫 S1/);
  assert.ok(existsSync(join(dir, "direction/refboard/beat-01.jpg")) && existsSync(join(dir, "direction/refboard/seam-S1.jpg")));
});

test("refs axes, match and hunt: cards sit on design axes, a film names the axes it wants, seeds rank by overlap; a hunt lists the gaps, and a required gap is either bound or an experiment the user agreed to", () => {
  rmSync(join(PROFILE, "references-log.jsonl"), { force: true });
  const dir = fresh("refhunt/videos/p/films/f"), add = (title, ...a) => /id ([0-9a-f]{8})/.exec(node("scripts/refs.mjs", ["add", dir, "--url", `https://example.com/${encodeURIComponent(title)}`, "--title", title, "--why", "值得看", ...a], env).out)?.[1];
  assert.equal(node("scripts/refs.mjs", ["add", dir, "--url", "https://example.com/x", "--title", "x"], env).code, 1, "a film's reference says why it is worth watching");
  const fast = add("快的掃過", "--take", "transition=條掃過", "--axis", "pacing=fast", "--axis", "transition=wipe,cut");
  const calm = add("慢的推近", "--take", "camera=慢推", "--axis", "pacing=slow", "--axis", "tone=calm");
  assert.ok(fast && calm);
  assert.equal(node("scripts/refs.mjs", ["card", fast, "--axis", "pacing=warp"], env).code, 1, "an unknown axis value is refused");
  assert.equal(node("scripts/refs.mjs", ["match", dir], env).code, 1, "match needs direction/axes.json");
  mkdirSync(join(dir, "direction"), { recursive: true });
  writeFileSync(join(dir, "direction/axes.json"), JSON.stringify({ pacing: "fast", transition: ["wipe"] }));
  const m = node("scripts/refs.mjs", ["match", dir], env).out;
  assert.match(m, new RegExp(`2  ${fast}  快的掃過`)); assert.doesNotMatch(m, /慢的推近/);

  const S = { message: "交棒。", total: 4, beats: [{ id: "01", t0: 0, t1: 2, verb: "推", big: "推", proof: "情境示意", hero: true }, { id: "02", t0: 2, t1: 4, verb: "停", big: "停", proof: "情境示意" }],
    seams: [{ id: "S1", t: 2, kind: "seam", device: "掃", major: true }] };
  const sf = join(dir, "direction/script.json"); writeFileSync(sf, JSON.stringify(S));
  let r = node("scripts/refs.mjs", ["hunt", dir], env); assert.equal(r.code, 1, r.out);
  let md = readFileSync(join(dir, "direction/ref-hunt.md"), "utf8");
  assert.match(md, /### ⛔ 接縫 S1（主要接縫，一定要有）\n\n要找：交棒、鏡頭的參考\n已經有的候選：`[0-9a-f]{8}` 快的掃過/);
  assert.match(md, /## 參考不足/);
  S.seams[0].refs = [fast]; S.beats[0].experimental = true; writeFileSync(sf, JSON.stringify(S));
  assert.match(node("scripts/script-lint.mjs", [sf], env).out, /✗ 01: experimental 要寫使用者同意首創的原話/);
  S.beats[0].experimental = "這一段你自己發揮"; writeFileSync(sf, JSON.stringify(S));
  r = node("scripts/script-lint.mjs", [sf], env); assert.doesNotMatch(r.out, /✗/, r.out); assert.match(r.out, /△ 01: 實驗（沒有參考/);
  r = node("scripts/refs.mjs", ["hunt", dir], env); assert.equal(r.code, 0, r.out);
  md = readFileSync(join(dir, "direction/ref-hunt.md"), "utf8"); assert.doesNotMatch(md, /參考不足/); assert.match(md, /### 拍 02/);
  assert.match(readFileSync(node("scripts/refs.mjs", ["board", dir], env).out.split("\n")[0], "utf8"), /🧪 實驗：沒有參考，使用者同意首創（「這一段你自己發揮」）/);
});
