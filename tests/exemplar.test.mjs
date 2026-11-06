// scripts/exemplar.mjs: the user's verdicts on moments of a film kept as clips in the personal layer — a strip of 8 frames,
// the clip, the reason and the code — so the next film starts from examples instead of re-tuning from prose rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import { PROFILE, fresh, join, node, root, writeFileSync } from "./helpers.mjs";

test("exemplar: add cuts the clip and an 8-frame strip, keeps the reason and the code; list filters by kind and verdict", () => {
  rmSync(join(PROFILE, "exemplars"), { recursive: true, force: true });
  const dir = fresh("exemplar"), video = join(dir, "draft-3.mp4"), code = join(dir, "whip.js");
  const FF = createRequire(join(root, "package.json"))("ffmpeg-static");
  execFileSync(FF, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=60:duration=4", "-pix_fmt", "yuv420p", video]);
  writeFileSync(code, "export const whip = { dur: 0.28, blur: 24 };\n");
  let r = node("scripts/exemplar.mjs", ["add", video, "--at", "1.0-2.5", "--kind", "seam", "--verdict", "keep", "--why", "甩鏡帶模糊，打在拍上", "--quote", "硬切也是能驚艷我啊", "--code", code]);
  assert.equal(r.code, 0, r.out);
  r = node("scripts/exemplar.mjs", ["add", video, "--at", "3.0-3.8", "--kind", "seam", "--verdict", "reject", "--why", "原地溶接，新舊字疊在一起"]); assert.equal(r.code, 0, r.out);
  r = node("scripts/exemplar.mjs", ["add", video, "--at", "1.0-2.5", "--kind", "seam", "--verdict", "keep", "--why", "again"]);
  assert.equal(r.code, 1, "the same moment twice is refused"); assert.match(r.out, /已經記過/);
  assert.equal(node("scripts/exemplar.mjs", ["add", video, "--at", "1-2", "--kind", "seam", "--verdict", "keep"]).code, 1, "a verdict needs its reason");
  const all = JSON.parse(node("scripts/exemplar.mjs", ["list", "--json"]).out);
  assert.equal(all.length, 2);
  const keep = all.find((e) => e.verdict === "keep");
  for (const f of [keep.clip, keep.strip, join(PROFILE, "exemplars", keep.id, "code.js")]) assert.ok(existsSync(f), f);
  assert.deepEqual([keep.at, keep.quote, keep.code], [[1, 2.5], "硬切也是能驚艷我啊", "code.js"]);
  const out = node("scripts/exemplar.mjs", ["list", "--kind", "seam", "--verdict", "reject"]).out;
  assert.match(out, /✗ seam-\w+ +seam +原地溶接/); assert.doesNotMatch(out, /甩鏡/);
  assert.match(node("scripts/exemplar.mjs", ["list", "--kind", "camera"]).out, /沒有範例/);
});
