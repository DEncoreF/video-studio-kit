// Regression tests for scripts/brand-qa.mjs — one per problem found in the V1 skill test run,
// plus the V2 acceptance cases (image text, re-QA of approved films, fail-closed rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, fingerprint, findingsOf, join, node, qaVideo, readFileSync, report, root, TMP, writeFileSync } from "./helpers.mjs";

const qa = (v, ...a) => node("scripts/brand-qa.mjs", [v, "--no-lint", ...a]);

test("forbidden word inside a screenshot is FAIL, not a judgement call (V1: 醫療 chip was let through)", () => {
  const v = qaVideo("qa-image-forbidden");
  const r = qa(v, "--no-stills");
  assert.equal(r.code, 1, r.out);
  const hits = findingsOf(report(v), "禁用內容");
  assert.ok(hits.some((f) => f.status === "FAIL" && f.severity === "hard" && f.issue.includes("醫療") && f.where.includes("filter-bar-medical.png")), JSON.stringify(hits));
  for (const f of hits) for (const k of ["issue", "where", "severity", "basis", "fix"]) assert.ok(f[k], `finding lacks ${k}`);
});

test("forbidden word is also found in rendered frames, with the time", () => {
  const v = qaVideo("qa-frame-forbidden");
  qa(v, "--at", "1,3");
  const frames = findingsOf(report(v), "禁用內容").filter((f) => /s 影格$/.test(f.where));
  assert.ok(frames.some((f) => f.where.startsWith("1.0s") || f.where.startsWith("1s")), JSON.stringify(frames));
});

test("uncertain or unavailable OCR is NEEDS_REVIEW, never PASS", () => {
  const v = qaVideo("qa-ocr-unsure");
  const fx = join(TMP, "ocr-fixture.json"); // outside the film, so QA does not read it as film text
  writeFileSync(fx, JSON.stringify({ "filter-bar-medical.png": [{ text: "醫療", conf: 0.3 }] }));
  let r = qa(v, "--no-stills", "--no-lint"); // real OCR finds it for sure → FAIL (sanity)
  r = node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills"], { VSO_OCR_FIXTURE: fx });
  assert.equal(report(v).checks["禁用內容"], "NEEDS_REVIEW", r.out);
  r = node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills"], { VSO_OCR_FIXTURE: "unavailable" });
  assert.equal(report(v).checks["圖片文字"], "NEEDS_REVIEW");
  assert.notEqual(report(v).verdict, "PASS");
});

test("QA is read-only and idempotent: the film is byte-identical and the verdict repeats", () => {
  const v = qaVideo("qa-readonly", { image: "other-brand-kestrel.png", kit: "novamind" });
  const before = fingerprint(v);
  qa(v, "--at", "1,2");
  const first = report(v);
  qa(v, "--at", "1,2");
  const second = report(v);
  assert.deepEqual(fingerprint(v), before);
  assert.equal(second.verdict, first.verdict);
  assert.deepEqual(second.findings, first.findings);
  assert.equal(second.digest, first.digest);
});

test("approved film: unchanged content is reported as such; a new violation revokes approval without touching the film", () => {
  const v = qaVideo("qa-approved", { image: "other-brand-kestrel.png", kit: "novamind" });
  qa(v, "--no-stills");
  const digest = report(v).digest;
  writeFileSync(join(v, "approval.json"), JSON.stringify({ status: "approved", approved_by: "test", date: "2026-10-19", digest }));
  let r = qa(v, "--no-stills");
  assert.match(readFileSync(join(v, "QA.md"), "utf8"), /內容與規則未變更/);
  // a new hard violation appears (someone edits the caption)
  const html = join(v, "index.html");
  writeFileSync(html, readFileSync(html, "utf8").replace("部門自己管", "限時優惠 NT$ 9,900"));
  const kit = join(root, "brand-kits/novamind/brand.json");
  const before = fingerprint(v);
  r = node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel"]); // kestrel forbids prices
  assert.equal(r.code, 1, r.out);
  assert.equal(JSON.parse(readFileSync(join(v, "approval.json"), "utf8")).status, "revoked");
  assert.deepEqual(fingerprint(v), before, "QA must not rewrite the film when it revokes approval");
  assert.ok(existsSync(kit));
});

test("brand rules cannot be waived; lint waivers need a named approver", () => {
  const v = qaVideo("qa-waiver");
  writeFileSync(join(v, "qa-waivers.json"), JSON.stringify([{ check: "禁用內容", reason: "looks fine", approved_by: "someone" }, { check: "lint", match: "", reason: "x" }]));
  const r = qa(v, "--no-stills");
  assert.equal(r.code, 1);
  assert.equal(report(v).checks["禁用內容"], "FAIL");
});

test("a signed lint waiver clears the matching warning or error, and only that one", () => {
  const v = qaVideo("qa-lint-waiver", { image: "other-brand-kestrel.png", kit: "novamind" });
  const fx = join(TMP, "lint-fixture.txt");
  writeFileSync(fx, "⚠ [index.html:57:7] nested_structure_needs_subcomposition [stage]\n⚠ [index.html:9:1] some_other_warning\n✗ [index.html:3:1] missing_timeline_registry\n");
  const lint = () => { node("scripts/brand-qa.mjs", [v, "--no-stills"], { VSO_LINT_FIXTURE: fx }); return findingsOf(report(v), "lint"); };
  let f = lint();
  assert.deepEqual(f.map((x) => x.status).sort(), ["FAIL", "NEEDS_REVIEW", "NEEDS_REVIEW"]);
  writeFileSync(join(v, "qa-waivers.json"), JSON.stringify([
    { check: "lint", match: "nested_structure_needs_subcomposition", reason: "Studio-only", approved_by: "test" },
    { check: "lint", match: "", reason: "blanket", approved_by: "test" },
  ]));
  f = lint();
  assert.ok(!f.some((x) => x.issue.includes("nested_structure")), "a waived warning is no longer a finding");
  assert.equal(f.find((x) => x.issue.includes("some_other_warning")).status, "NEEDS_REVIEW");
  assert.equal(f.find((x) => x.issue.includes("missing_timeline_registry")).status, "FAIL", "an empty match must not waive everything");
});

test("Remotion (D1): React scenes may import it only through a local shim alias; the real package fails", () => {
  const v = qaVideo("qa-remotion", { image: "other-brand-kestrel.png", kit: "novamind" });
  const rem = () => { qa(v, "--no-stills", "--no-ocr"); return { status: report(v).checks["Remotion 授權"], f: findingsOf(report(v), "Remotion 授權") }; };
  assert.equal(rem().status, "PASS", "no Remotion at all");
  writeFileSync(join(v, "scene.tsx"), 'import { useCurrentFrame } from "remotion";\nimport { Audio } from "@remotion/media";\n');
  let r = rem(); assert.equal(r.status, "NEEDS_REVIEW", "an import with no alias to a shim");
  writeFileSync(join(v, "build.mjs"), 'const shim = "./src/shim/";\nawait build({ alias: { remotion: shim + "remotion.tsx", "@remotion/media": shim + "media.tsx" } });\n');
  assert.equal(rem().status, "PASS", "aliased to the shim (the Kestrel intro's way)");
  writeFileSync(join(v, "package.json"), JSON.stringify({ dependencies: { remotion: "4.0.536" } }));
  r = rem(); assert.equal(r.status, "FAIL"); assert.ok(r.f.some((x) => x.severity === "hard" && /package\.json/.test(x.where)), JSON.stringify(r.f));
});

test("missing frame.md is reported for visual review, not guessed (V1: 39 stray colours)", () => {
  const v = qaVideo("qa-no-frame", { image: "other-brand-kestrel.png", kit: "novamind" });
  qa(v, "--no-stills");
  const c = findingsOf(report(v), "色彩");
  assert.equal(c.length, 1);
  assert.equal(c[0].status, "NEEDS_REVIEW");
  assert.match(c[0].issue, /frame\.md/);
});

test("all contact sheets are discovered when there are more than 8 stills (V1: hard-coded contact-sheet.jpg)", () => {
  const v = qaVideo("qa-many-stills", { image: "other-brand-kestrel.png", kit: "novamind" });
  qa(v, "--at", Array.from({ length: 13 }, (_, i) => (0.2 + i * 0.28).toFixed(2)).join(","));
  const { sheets } = report(v);
  assert.ok(sheets.length >= 2, JSON.stringify(sheets));
  for (const s of sheets) assert.ok(existsSync(join(v, s)), s);
});

test("another brand seen in an image needs review unless brand.json allows it", () => {
  const v = qaVideo("qa-other-brand", { image: "other-brand-kestrel.png", kit: "novamind" });
  qa(v, "--no-stills");
  assert.ok(findingsOf(report(v), "第三方品牌").some((f) => f.status === "NEEDS_REVIEW" && f.issue.includes("Kestrel")));
});

test("stale voice-over and missing pronunciation records fail", () => {
  const v = qaVideo("qa-vo", { image: "other-brand-kestrel.png", kit: "novamind", narration: [{ key: "s1", start: 0, slot: 4, text: "NovaMind 讓每個部門都有 AI" }] });
  writeFileSync(join(v, "brand/pronunciation.json"), "[]");
  qa(v, "--no-stills");
  const f = findingsOf(report(v), "旁白與發音");
  assert.ok(f.some((x) => x.status === "FAIL" && /旁白檔/.test(x.issue)));
  assert.ok(f.some((x) => x.status === "FAIL" && /NovaMind/.test(x.issue)));
});

// The real Kestrel film lives in the work folder (VSO_WORKSPACE, or marketing-video-studio next to the tool), not in this repo.
// It runs on a copy without renders/ and qa/, so the film's own QA.md is never overwritten; skipped where the film is absent.
const WORK = [process.env.VSO_WORKSPACE, join(root, "..", "marketing-video-studio"), root].find((w) => w && existsSync(join(w, "videos/<專案>/films/<片>")));
test("Kestrel film: no forbidden content anywhere, lint clean, folder untouched", { skip: !WORK }, () => {
  const v = join(TMP, "demo-film");
  rmSync(v, { recursive: true, force: true });
  cpSync(join(WORK, "videos/<專案>/films/<片>"), v, { recursive: true, filter: (f) => !/\/(renders|qa)(\/|$)|\/QA\.md$/.test(f.slice(WORK.length)) });
  const before = fingerprint(v, /^(QA\.md|qa\/|approval\.json|\.hyperframes\/)/);
  const r = node("scripts/brand-qa.mjs", [v], { VSO_WORKSPACE: WORK });
  const rep = report(v);
  assert.equal(rep.checks.lint, "PASS", r.out);
  assert.equal(rep.checks["禁用內容"], "PASS", JSON.stringify(findingsOf(rep, "禁用內容")));
  assert.equal(rep.checks["素材授權"], "PASS", JSON.stringify(findingsOf(rep, "素材授權")));
  assert.deepEqual(fingerprint(v, /^(QA\.md|qa\/|approval\.json|\.hyperframes\/)/), before);
});

test("text inside HTML comments is not treated as on-screen text", () => {
  const v = qaVideo("qa-comment", { image: "other-brand-kestrel.png", kit: "novamind" });
  const html = join(v, "index.html");
  writeFileSync(html, readFileSync(html, "utf8").replace("<body>", "<body><!-- note: the badge 醫療 NT$ 500 is cropped out -->"));
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel"]);
  assert.ok(!findingsOf(report(v), "禁用內容").some((f) => f.where === "index.html"), JSON.stringify(findingsOf(report(v), "禁用內容")));
});

// 2026-10-29 (skill audit): the end card, the「情境示意」stamp and the delivered frame rate were rules nobody checked.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
/** A copy of the test kits with rules.end_card set on kestrel (the kits themselves stay untouched). */
function kitsWith(endCard) {
  const d = join(TMP, "_kits-endcard"); rmSync(d, { recursive: true, force: true }); cpSync(join(root, "brand-kits"), d, { recursive: true });
  const f = join(d, "kestrel/brand.json"), k = JSON.parse(readFileSync(f, "utf8"));
  if (endCard) k.rules = { ...(k.rules ?? {}), end_card: endCard }; else if (k.rules) delete k.rules.end_card;
  writeFileSync(f, JSON.stringify(k, null, 2)); return d;
}
const endOf = (v) => findingsOf(report(v), "結尾卡");

test("end card: the kit's required logos must be read in the last 3 s (user:「片尾要記得幫我補Acme 集團的logo」)", () => {
  const v = qaVideo("qa-endcard", { caption: "部門自己管 · Kestrel" });
  // the caption stands in for a logo's wordmark: it is on screen to the end
  let kits = kitsWith({ logos: [{ id: "kestrel", name: "Kestrel 字標", ocr: ["部門自己管"] }], layout: "置中" });
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--kit", "kestrel"], { VSO_BRAND_KITS: kits });
  assert.equal(report(v).checks["結尾卡"], "PASS", JSON.stringify(endOf(v)));
  kits = kitsWith({ logos: [{ id: "acme", name: "Acme 集團", ocr: ["Acme", "ACME"], files: ["acme-white.svg"] }] });
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--kit", "kestrel"], { VSO_BRAND_KITS: kits });
  assert.ok(endOf(v).some((f) => f.status === "FAIL" && /Acme 集團/.test(f.issue)), JSON.stringify(endOf(v)));
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel"], { VSO_BRAND_KITS: kits });
  assert.equal(report(v).checks["結尾卡"], "NEEDS_REVIEW", "no frames: cannot tell");
  kits = kitsWith(null);
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel"], { VSO_BRAND_KITS: kits });
  assert.ok(endOf(v).some((f) => f.status === "NEEDS_REVIEW" && /rules\.end_card/.test(f.issue)), "no rule in the kit: needs review, not a guess");
});

test("a film with rebuilt or illustrative UI needs「情境示意」or Illustrative on screen", () => {
  const v = qaVideo("qa-illustrative");
  mkdirSync(join(v, "direction"), { recursive: true });
  writeFileSync(join(v, "direction/script.json"), JSON.stringify({ beats: [{ id: "01", t0: 0, t1: 4, proof: "情境示意" }] }));
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--at", "1,2"]);
  assert.ok(findingsOf(report(v), "情境示意").some((f) => f.status === "NEEDS_REVIEW"), JSON.stringify(findingsOf(report(v), "情境示意")));
  const w = qaVideo("qa-illustrative-ok", { caption: "情境示意 Illustrative" });
  mkdirSync(join(w, "direction"), { recursive: true });
  writeFileSync(join(w, "direction/script.json"), JSON.stringify({ beats: [{ id: "01", t0: 0, t1: 4, proof: "情境示意" }] }));
  node("scripts/brand-qa.mjs", [w, "--no-lint", "--at", "1,2"]);
  assert.equal(report(w).checks["情境示意"], "PASS", JSON.stringify(findingsOf(report(w), "情境示意")));
  const x = qaVideo("qa-illustrative-none");   // real screenshots only: nothing to stamp
  node("scripts/brand-qa.mjs", [x, "--no-lint", "--no-stills"]);
  assert.equal(report(x).checks["情境示意"], "PASS");
});

test("the delivered file's frame rate must match BRIEF.md (default 60)", () => {
  const FF = createRequire(import.meta.url)(join(root, "node_modules/ffmpeg-static"));
  const v = qaVideo("qa-fps");
  mkdirSync(join(v, "renders"), { recursive: true });
  const mk = (name, fps) => execFileSync(FF, ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=white:s=160x90:r=${fps}:d=1`, "-c:v", "libx264", "-preset", "ultrafast", join(v, "renders", name)]);
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills"]);
  assert.match(readFileSync(join(v, "QA.md"), "utf8"), /還沒有正式檔/, "no delivered file yet: a note, not a finding");
  mk("final-1080p30.mp4", 30); mk("draft-3.mp4", 60);
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills"]);
  assert.ok(findingsOf(report(v), "交件規格").some((f) => f.status === "FAIL" && /30 fps.*60 fps/.test(f.issue)), JSON.stringify(findingsOf(report(v), "交件規格")));
  writeFileSync(join(v, "BRIEF.md"), "---\nfps: 30\n---\n# brief\n");
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel"]);
  assert.equal(report(v).checks["交件規格"], "PASS");
  mk("final-1080p60.mp4", 60);
  node("scripts/brand-qa.mjs", [v, "--no-lint", "--no-stills", "--kit", "kestrel", "--render", "renders/final-1080p60.mp4"]);
  assert.equal(report(v).checks["交件規格"], "FAIL", "BRIEF says 30, the named file is 60");
});
