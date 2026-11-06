// scripts/campaign.mjs: one moment made 2–4 ways at once, each measured as a test clip, shown side by side, and the user's pick
// (and the rejects) kept as exemplars — Claude can make variants cheaply but cannot judge how motion feels, so the user chooses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import { PROFILE, fresh, join, mkdirSync, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const FF = createRequire(join(root, "package.json"))("ffmpeg-static");
const clip = (f, speed) => { mkdirSync(join(f, ".."), { recursive: true });
  execFileSync(FF, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x203040:s=1920x1080:r=60:d=3", "-f", "lavfi", "-i", "color=c=0xe0a040:s=300x300:r=60:d=3",
    "-filter_complex", `[0][1]overlay=x='200+n*${speed}':y=400:eval=frame`, "-pix_fmt", "yuv420p", f]); };

test("campaign: new makes one test clip per variant; compare shows only measured passes; pick keeps the winner and the rejects as exemplars", { timeout: 300_000 }, () => {
  rmSync(join(PROFILE, "exemplars"), { recursive: true, force: true });
  const project = fresh("campaign/videos/p"), film = join(project, "films/f");
  mkdirSync(film, { recursive: true }); writeFileSync(join(project, "PROJECT.md"), "# p\n"); writeFileSync(join(film, "index.html"), "<!doctype html><p>f</p><script>window.__timelines = { f: { labels: {}, getChildren: () => [], duration: () => 1 } };</script>");
  mkdirSync(join(film, "renders")); writeFileSync(join(film, "renders/draft-1.mp4"), "x");
  rmSync(join(PROFILE, "references-log.jsonl"), { force: true });
  const refClip = join(project, "ref.mp4"); clip(refClip, 8);
  const added = node("scripts/refs.mjs", ["add", film, "--file", refClip, "--title", "參考的甩鏡", "--why", "乾淨", "--take", "transition=一個動作交棒"], { VSO_LINK_CHECK: "off" });
  const ref = /id ([0-9a-f]{8})/.exec(added.out)?.[1]; assert.ok(ref, added.out);
  assert.equal(node("scripts/campaign.mjs", ["new", project, "noref", "--question", "q", "--variant", "a=x", "--variant", "b=y"]).code, 1, "a variant must name the card it borrows from");
  let r = node("scripts/campaign.mjs", ["new", project, "hand", "--kind", "seam", "--question", "主角拍的交棒用哪一種？", "--variant", `a=甩鏡帶模糊@${ref}`, "--variant", `b=條狀掃過@${ref}`, "--from", film]);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(project, "tests/_hand-a/index.html")), "copied from --from");
  assert.ok(!existsSync(join(project, "tests/_hand-a/renders")), "renders are not copied");
  assert.match(readFileSync(join(project, "tests/_hand-b/NOTES.md"), "utf8"), /條狀掃過[\s\S]*借的參考：參考的甩鏡/);
  assert.equal(node("scripts/campaign.mjs", ["new", project, "solo", "--question", "q", "--variant", "a=x", "--no-refs"]).code, 1, "one variant is not a comparison");

  const C = join(project, "campaigns/hand");
  clip(join(project, "tests/_hand-a/out/clip.mp4"), 6); clip(join(project, "tests/_hand-b/out/clip.mp4"), 3);
  r = node("scripts/campaign.mjs", ["compare", C]); assert.equal(r.code, 1, "nothing measured yet"); assert.match(r.out, /不到 2 個/);
  for (const k of ["a", "b"]) {
    const d = join(project, `tests/_hand-${k}`);
    assert.equal(node("scripts/review-pack.mjs", [d, join(d, "out/clip.mp4"), "--out", join(d, "review")]).code, 0);
    r = node("scripts/review-pack.mjs", ["--check", join(d, "review"), "--candidate"]); assert.equal(r.code, 0, r.out);
  }
  r = node("scripts/campaign.mjs", ["compare", C]); assert.equal(r.code, 0, r.out);
  const P = join(project, "previews/campaign-hand");
  for (const f of ["compare.mp4", "compare.jpg", "COMPARE.md"]) assert.ok(existsSync(join(P, f)), f);
  assert.match(readFileSync(join(P, "COMPARE.md"), "utf8"), /\| A \| 左 \| 甩鏡帶模糊 \| 參考的甩鏡（[0-9a-f]{8}）：一個動作交棒 \| ✓/);
  assert.ok(existsSync(join(P, "ref-a.jpg")), "each variant's reference row");

  r = node("scripts/campaign.mjs", ["pick", C, "a", "--why", "一個動作到位", "--quote", "這個俐落", "--reject", "b=條太細"]); assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(C, "campaign.json"), "utf8")).pick.key, "a");
  const E = JSON.parse(node("scripts/exemplar.mjs", ["list", "--json"]).out);
  assert.deepEqual(E.map((e) => [e.verdict, e.why]).sort(), [["keep", "甩鏡帶模糊：一個動作到位"], ["reject", "條狀掃過：條太細"]]);
  assert.ok(E.every((e) => e.kind === "seam" && e.tags.includes("campaign:hand")));
});
