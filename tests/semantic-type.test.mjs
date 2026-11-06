// Regression tests for the semantic-type skill's test bed and checks (.claude/skills/semantic-type/scripts/semtype.mjs):
// each check must catch the mistake it exists for (a touched neighbour, added text, a missing sound cue, an end that
// differs from the layout) and pass a plain, honest effect; copy must make a working test copy of a one-take film.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { existsSync, fresh, join, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

const SEM = ".claude/skills/semantic-type/scripts/semtype.mjs";
const bed = (name, effect, sfx = { key: 1.2, cues: [{ t: 1.2, kind: "stamp", why: "橡皮章壓下" }] }) => {
  const d = join(fresh(name), "bed");
  assert.equal(node(SEM, ["init", d, "--title", "權限測試"]).code, 0);
  if (effect) writeFileSync(join(d, "effect.js"), `window.SEMANTIC_EFFECT = ({ tl, title, cue, lib }) => { ${effect} };`);
  writeFileSync(join(d, "sfx.json"), JSON.stringify(sfx));
  const r = node(SEM, ["check", d]);
  return { d, r, c: JSON.parse(readFileSync(join(d, "check/check.json"), "utf8")) };
};

test("a quiet in-box effect with a sound on its key passes every check", () => {
  const { d, c } = bed("sem-pass", "tl.fromTo(lib.splitChars(title), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.1 }, 0.3);");
  assert.equal(c.pass, true, JSON.stringify(c.checks));
  assert.ok(existsSync(join(d, "check/sheet.jpg")));
  assert.ok(existsSync(join(d, "NOTES.md")) && existsSync(join(d, "fonts/NotoSerifTC-VF.ttf")) && existsSync(join(d, "lib/semantic-type.js")));
});

test("moving the title onto the label above is caught, even though it ends back in place", () => {
  const { r, c } = bed("sem-touch", "tl.fromTo(title, { y: 0 }, { y: -60, duration: 0.4, yoyo: true, repeat: 1, immediateRender: false }, 0.3);");
  assert.equal(r.code, 2);
  assert.equal(c.checks.no_neighbour_touch.pass, false); assert.ok(c.checks.no_neighbour_touch.neighbours.includes("dept"));
  assert.equal(c.checks.stays_in_box.pass, false);
  assert.equal(c.checks.end_matches_layout.pass, true);
});

test("a reading added next to the title is caught; an end that is not the layout fails until the user approves it", () => {
  const { d, c } = bed("sem-text", "const n = lib.el('span', { position: 'absolute', left: '100%', top: '0', fontSize: '0.3em' }, title, '76%'); tl.fromTo(n, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.5); tl.to(title, { opacity: 0.5, duration: 0.3 }, 1);");
  assert.equal(c.checks.no_added_text.pass, false); assert.match(c.checks.no_added_text.frames[0].chars, /7|6|%/);
  assert.equal(c.checks.end_matches_layout.pass, false);
  writeFileSync(join(d, "semtype.json"), JSON.stringify({ end: "meaning" }));
  node(SEM, ["check", d]);
  assert.equal(JSON.parse(readFileSync(join(d, "check/check.json"), "utf8")).checks.end_matches_layout.pass, false, "declared but not approved");
});

test("no sound cue, an unknown sound, or a cue without a reason fails the sound check", () => {
  assert.equal(bed("sem-nosfx", null, { key: 1.2, cues: [] }).c.checks.sound_cue.pass, false);
  assert.deepEqual(bed("sem-badsfx", null, { key: 1.2, cues: [{ t: 1.2, kind: "kazoo", why: "x" }] }).c.checks.sound_cue.unknown_kinds, ["kazoo"]);
  assert.equal(bed("sem-nowhy", null, { key: 1.2, cues: [{ t: 1.2, kind: "stamp" }] }).c.checks.sound_cue.pass, false);
});

// copy: a test copy of a film drawn from the time (a one-take), with the world frozen at one moment
const oneTake = (name, start = "0") => {
  const f = join(fresh(name), "film");
  for (const d of ["vendor", "lib"]) mkdirSync(join(f, d), { recursive: true });
  copyFileSync(createRequire(join(root, "package.json")).resolve("gsap/dist/gsap.min.js"), join(f, "vendor/gsap.min.js"));
  copyFileSync(join(root, ".claude/skills/semantic-type/lib/semantic-type.js"), join(f, "lib/semantic-type.js"));
  writeFileSync(join(f, "index.html"), `<!doctype html><html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0b0b0f; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; color: #eee; font-family: serif; }
  #dot { position: absolute; top: 200px; width: 80px; height: 80px; border-radius: 50%; background: #725ff7; }
  #hud { position: absolute; left: 100px; top: 60px; font-size: 24px; }
  .big { position: absolute; left: 100px; bottom: 320px; font-size: 140px; font-weight: 900; line-height: 1.1; }
  .sub { position: absolute; left: 104px; bottom: 220px; font-size: 32px; opacity: 0; }
</style></head><body>
  <div id="root" data-composition-id="film" data-start="0" data-width="1920" data-height="1080" data-duration="8" data-fps="30">
    <div id="stage" class="clip" data-start="${start}" data-duration="8" data-track-index="0">
      <div id="dot"></div><div id="hud">00:00</div>
      <div id="big1" class="big">一次呼叫</div><div id="big2" class="big">自動分派</div><div id="sub1" class="sub">送出一個問題</div>
    </div>
  </div>
  <script src="vendor/gsap.min.js"></script><script src="lib/semantic-type.js"></script>
  <script>
    // everything is drawn from t; the film splits its titles itself first, as a film running its own title effects does
    const $ = (id) => document.getElementById(id); [$("big1"), $("big2")].forEach((b) => SemType.splitChars(b));
    function render(t) {
      $("dot").style.left = (100 + 200 * t).toFixed(1) + "px"; $("hud").textContent = "00:0" + Math.floor(t);
      $("big1").style.opacity = t >= 1 && t < 4 ? "1" : "0"; $("big2").style.opacity = t >= 4 ? "1" : "0"; $("sub1").style.opacity = t >= 1.2 && t < 4 ? "1" : "0";
    }
    const tl = gsap.timeline({ paused: true }), drive = { t: 0 };
    tl.to(drive, { t: 8, duration: 8, ease: "none", onUpdate: () => render(drive.t) }, 0);
    window.__timelines = { film: tl }; render(0);
  </script>
</body></html>`);
  return f;
};

test("copy freezes a one-take at one moment and runs only the title, untouched by what the film did to it; a re-run keeps the work", () => {
  const f = oneTake("sem-copy"), d = join(dirname(f), "copy");
  const args = ["copy", f, "--to", d, "--target", "big1", "--sub", "sub1", "--nb", "hud", "--freeze", "3", "--key", "2", "--off", "1", "--dur", "3"];
  assert.equal(node(SEM, args).code, 0);
  assert.match(readFileSync(join(d, "effect.js"), "utf8"), /const make = \(title, key, lib\)/);
  writeFileSync(join(d, "sfx.json"), JSON.stringify({ key: 1, cues: [{ t: 1, kind: "stamp", why: "橡皮章壓下" }] }));
  node(SEM, ["check", d]);
  const c = JSON.parse(readFileSync(join(d, "check/check.json"), "utf8"));
  assert.equal(c.pass, true, JSON.stringify(c.checks));
  assert.ok(c.checks.settles_and_holds.starts !== null, "the effect moved the title the copy shows, not the characters the film split earlier");
  writeFileSync(join(d, "effect.js"), readFileSync(join(d, "effect.js"), "utf8") + "// mine\n");
  assert.equal(node(SEM, args).code, 0);
  assert.match(readFileSync(join(d, "effect.js"), "utf8"), /\/\/ mine/);
});

test("copy refuses a film made of scenes", () => {
  const f = oneTake("sem-copy-scenes", "2"), r = node(SEM, ["copy", f, "--to", join(dirname(f), "copy"), "--target", "big1", "--freeze", "3", "--key", "2"]);
  assert.notEqual(r.code, 0); assert.match(r.out, /one page/);
});
