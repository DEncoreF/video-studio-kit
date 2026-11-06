// scripts/hooks/draft-gate.mjs, the gate as a hook (declared in the frontmatter of video-draft-review and video-motion-craft):
// PreToolUse on SendUserFile blocks a video under videos/ unless a PASS.json in its film or test folder still matches it;
// Stop blocks a reply that points at a recent unreviewed render, but never while stop_hook_active.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fresh, join, mkdirSync, readFileSync, root, writeFileSync } from "./helpers.mjs";

const HOOK = join(root, "scripts/hooks/draft-gate.mjs");
const run = (mode, input) => { const r = spawnSync(process.execPath, [HOOK, mode], { input: JSON.stringify(input), encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const send = (files, cwd) => run("pre", { hook_event_name: "PreToolUse", tool_name: "SendUserFile", cwd, tool_input: { files, caption: "草稿", status: "normal" } });
/** What review-pack.mjs --check writes, for a file (the hook only reads it). */
function pass(dir, render, mode = "full", extra = {}) {
  mkdirSync(join(dir, "review"), { recursive: true });
  writeFileSync(join(dir, "review/PASS.json"), JSON.stringify({ mode, render, sha256: sha(render), script: join(dir, "direction/script.json"), script_sha256: null, derived: [], ...extra }));
}
function setup() {
  const root_ = fresh("gate"), film = join(root_, "videos/p/films/c"), t = join(root_, "videos/p/tests/_seam");
  for (const d of [join(film, "renders"), join(t, "out"), join(film, "direction/transitions")]) mkdirSync(d, { recursive: true });
  const draft = join(film, "renders/draft-1.mp4"), clip = join(t, "out/clip.mp4"), trans = join(film, "direction/transitions/a.mp4"), still = join(film, "renders/sheet.jpg");
  for (const [f, s] of [[draft, "draft"], [clip, "clip"], [trans, "transition"], [still, "jpg"]]) writeFileSync(f, s);
  return { root: root_, film, t, draft, clip, trans, still };
}

test("PreToolUse: an unreviewed draft is blocked with the command to run; a valid PASS lets it through; a re-render blocks again", () => {
  const s = setup();
  let r = send([s.draft], s.root);
  assert.equal(r.code, 2); assert.match(r.err, /還沒過審片/); assert.match(r.err, /review-pack\.mjs/);
  pass(s.film, s.draft);
  assert.equal(send([s.draft], s.root).code, 0);
  assert.equal(send(["videos/p/films/c/renders/draft-1.mp4"], s.root).code, 0, "a path relative to the session's cwd");
  appendFileSync(s.draft, "x");
  r = send([s.draft], s.root); assert.equal(r.code, 2); assert.match(r.err, /改過了/);
});

test("PreToolUse: a film draft needs the full review; a test clip needs the measurements; a transition test under direction/, stills and files outside videos/ pass", () => {
  const s = setup();
  pass(s.film, s.draft, "measure");
  let r = send([s.draft], s.root); assert.equal(r.code, 2); assert.match(r.err, /只有試片的量測/);
  assert.equal(send([s.clip], s.root).code, 2);
  pass(s.t, s.clip, "measure"); assert.equal(send([s.clip], s.root).code, 0);
  mkdirSync(join(s.film, "direction/transitions/review"), { recursive: true });
  writeFileSync(join(s.film, "direction/transitions/review/PASS.json"), JSON.stringify({ mode: "measure", render: s.trans, sha256: sha(s.trans), derived: [] }));
  assert.equal(send([s.trans], s.root).code, 0, "a transition test inside direction/ is a preview");
  assert.equal(send([s.still], s.root).code, 0, "a still is not a draft");
  const outside = join(s.root, "scratch.mp4"); writeFileSync(outside, "ref");
  assert.equal(send([outside], s.root).code, 0);
  assert.equal(send([s.still, s.clip, s.draft], s.root).code, 2, "one unreviewed video in a batch blocks the batch");
});

test("PreToolUse: an attached re-encode passes, a stranger does not", () => {
  const s = setup(), small = join(s.film, "renders/draft-1-small.mp4"), other = join(s.film, "renders/draft-2.mp4");
  writeFileSync(small, "small"); writeFileSync(other, "other");
  pass(s.film, s.draft, "full", { derived: [{ path: small, sha256: sha(small) }] });
  assert.equal(send([small], s.root).code, 0);
  assert.equal(send([other], s.root).code, 2);
});

test("Stop: a reply pointing at a recent unreviewed render is blocked once, never while stop_hook_active", () => {
  const s = setup(), msg = `草稿 1 好了：videos/p/films/c/renders/draft-1.mp4，請看 04 的停留。`;
  let r = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: false, last_assistant_message: msg });
  assert.equal(r.code, 0); assert.equal(JSON.parse(r.out).decision, "block"); assert.match(JSON.parse(r.out).reason, /還沒過審片/);
  r = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: true, last_assistant_message: msg });
  assert.equal(r.out, "", "already continuing because of a stop hook: let it stop");
  pass(s.film, s.draft);
  r = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: false, last_assistant_message: msg });
  assert.equal(r.out, "");
  r = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: false, last_assistant_message: "我們來討論 04 的節奏。" });
  assert.equal(r.out, "");
});

// 2026-10-29: candidates go out to be chosen from without a review pack. 2026-11-05: a preview of a chosen version is gated: most of
// one film went out as previews and the gate never saw them, while the user kept asking whether the motion skill had run.
test("PreToolUse: a candidate needs no PASS; a preview of a chosen version needs --link; anything under renders/ needs its PASS", () => {
  const s = setup(), proj = join(s.root, "videos/p");
  const cand = join(proj, "previews/t05/candidates/a.mp4"), compare = join(proj, "previews/campaign-x/compare.mp4"), chosen = join(proj, "previews/t05/05-into-06-preview.mp4"),
    closeup = join(proj, "previews/t05/closeup.mp4"), named = join(s.film, "motion-preview-2.mp4"), renderPrev = join(s.film, "renders/draft-2-preview.mp4");
  for (const f of [cand, compare, chosen, closeup, named, renderPrev]) { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, f); }
  assert.equal(send([s.trans], s.root).code, 0, "a transition test under direction/");
  assert.equal(send([cand], s.root).code, 0, "under candidates/");
  assert.equal(send([compare], s.root).code, 0, "a campaign's compare");
  for (const f of [chosen, closeup, named]) { const r = send([f], s.root); assert.equal(r.code, 2, f); assert.match(r.err, /--link/); assert.match(r.err, /candidates/); }
  const r = send([renderPrev], s.root); assert.equal(r.code, 2, "renders/ is never a preview"); assert.match(r.err, /還沒過審片/);
  assert.equal(send([s.draft], s.root).code, 2, "the draft itself still needs its PASS");
  const stop = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: false, last_assistant_message: "候選在 videos/p/previews/t05/candidates/a.mp4，挑一個。" });
  assert.equal(stop.out, "", "pointing at a candidate does not block the reply");
  const stop2 = run("stop", { hook_event_name: "Stop", cwd: s.root, stop_hook_active: false, last_assistant_message: "選定版在 videos/p/previews/t05/closeup.mp4。" });
  assert.match(stop2.out, /"decision":"block"/, "pointing at a chosen preview does");
  // linked to a review that holds: through; a candidate's PASS does not count; the source re-rendered: blocked again
  pass(s.t, s.clip, "measure", { motion: { exemplar: "無" } });
  writeFileSync(`${closeup}.pass.json`, JSON.stringify({ sha256: sha(closeup), from: [{ review: join(s.t, "review"), motion: true }] }));
  assert.equal(send([closeup], s.root).code, 0);
  writeFileSync(s.clip, "re-rendered");
  assert.equal(send([closeup], s.root).code, 2, "the source changed");
  writeFileSync(s.clip, "clip"); pass(s.t, s.clip, "candidate");
  assert.equal(send([s.clip], s.root).code, 2, "a candidate's PASS does not let the clip out alone");
});

test("sound: in a project that mixes its own sound, a video with audio needs a SOUND-PASS.json holding its decoded audio; a copy of the audio passes, auditions and silent files pass", async () => {
  const { audioHash } = await import("../scripts/sound-gate.mjs");
  const FF = (await import("node:module")).createRequire(import.meta.url)("ffmpeg-static");
  const s = setup(), proj = join(s.root, "videos/p"), prev = join(proj, "previews");
  mkdirSync(prev, { recursive: true }); mkdirSync(join(s.t, "build"), { recursive: true });
  const mk = (f, hz, extra = []) => spawnSync(FF, ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x36:d=1", "-f", "lavfi", "-i", `sine=f=${hz}:d=1`, "-shortest", ...extra, f]);
  const cand = join(proj, "mixes"); mkdirSync(cand);   // not a picture preview: only the sound gate looks at these
  const a = join(cand, "mix-a.mp4"), b = join(cand, "mix-b.mp4"), aud = join(prev, "sfx-audition-1.mp4");
  mk(a, 440); mk(b, 660); mk(aud, 550);
  assert.equal(send([a], s.root).code, 0, "no mix in the project yet: nothing to gate");
  writeFileSync(join(s.t, "build/score.json"), "{}");
  let r = send([a], s.root); assert.equal(r.code, 2); assert.match(r.err, /還沒過聲音關卡/); assert.match(r.err, /sound-gate\.mjs/);
  mkdirSync(join(s.t, "review/sound"), { recursive: true });
  writeFileSync(join(s.t, "review/sound/SOUND-PASS.json"), JSON.stringify({ passes: [{ file: a, audio_md5: audioHash(a), verdict: "launch-grade", heard_txt: "—" }] }));
  assert.equal(send([a], s.root).code, 0);
  const small = join(cand, "mix-a-small.mp4");
  spawnSync(FF, ["-nostdin", "-v", "error", "-y", "-i", a, "-c:v", "libx264", "-crf", "30", "-c:a", "copy", small]);
  assert.equal(send([small], s.root).code, 0, "a phone copy with the audio copied keeps the pass");
  assert.equal(send([b], s.root).code, 2, "another mix does not");
  assert.equal(send([aud], s.root).code, 0, "an audition goes out to be chosen from");
});
