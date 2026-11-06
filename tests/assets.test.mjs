// Regression tests for scripts/assets.mjs (V1 skill-test gaps: product names, screenshot dates,
// other brands' marks, mixed folders).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, fixture, fresh, join, node, readFileSync, root, writeFileSync } from "./helpers.mjs";

// A private copy of the brand kits, so aliases can be added without touching the real ones.
function kits(name, mutate) {
  const d = fresh(name);
  cpSync(join(root, "brand-kits"), d, { recursive: true });
  const f = join(d, "novamind/brand.json"), b = JSON.parse(readFileSync(f, "utf8"));
  mutate?.(b);
  writeFileSync(f, JSON.stringify(b, null, 2));
  return { VSO_BRAND_KITS: d };
}
const A = (args, env) => node("scripts/assets.mjs", args, env);
const lib = (name, env) => { const v = fresh(name); const r = A(["init", v, "--brand", "novamind"], env); assert.equal(r.code, 0, r.out); return v; };
const index = (v) => JSON.parse(readFileSync(join(v, "assets-library/index.json"), "utf8"));

test("product names resolve through brand.json aliases; unknown names are refused", () => {
  const env = kits("kits-alias", (b) => { b.products = ["NovaMind", { name: "NovaMind Enterprise", aliases: ["NM Ent", "Enterprise 版"] }, "NovaMind Meter"]; });
  const v = lib("assets-alias", env);
  let r = A(["add", v, fixture("images/neutral-device.png"), "--type", "photo", "--product", "nm ent", "--source", "test"], env);
  assert.equal(r.code, 0, r.out);
  assert.equal(index(v)[0].product, "NovaMind Enterprise");
  r = A(["add", v, fixture("images/other-brand-kestrel.png"), "--type", "photo", "--product", "NovaMind Box", "--source", "test"], env);
  assert.equal(r.code, 1);
  assert.match(r.out, /not a product of NovaMind/);
});

test("screenshots keep capture date and validity; out-of-date ones ask to re-confirm and are never deleted", () => {
  const v = lib("assets-dates");
  const plan = join(v, "plan.json");
  writeFileSync(plan, JSON.stringify([
    { file: fixture("images/neutral-device.png"), type: "screenshot", tags: ["fresh"], source: "test", captured: new Date().toISOString().slice(0, 10) },
    { file: fixture("images/filter-bar-medical.png"), type: "screenshot", tags: ["old"], source: "test", captured: "2026-01-01", valid_days: 30 },
  ]));
  assert.equal(A(["add-plan", v, plan]).code, 0);
  const needs = join(v, "needs.json");
  writeFileSync(needs, JSON.stringify([{ type: "screenshot", label: "new", tags: ["fresh"] }, { type: "screenshot", label: "old", tags: ["old"] }]));
  const r = A(["check", v, needs]);
  assert.match(r.out, /\| new \| 已有 \|/);
  assert.match(r.out, /\| old \| 需重新確認 \|/);
  const e = index(v).find((x) => x.tags.includes("old"));
  assert.equal(e.valid_until, "2026-01-31");
  A(["tidy", v]);
  assert.ok(existsSync(join(v, "assets-library", e.path)), "tidy must not delete");
});

test("an image showing another brand is held for review until a person approves it", () => {
  const v = lib("assets-marks");
  let r = A(["add", v, fixture("images/other-brand-kestrel.png"), "--type", "photo", "--tags", "mark", "--source", "test"]);
  assert.match(r.out, /other brand\(s\): Kestrel/);
  const needs = join(v, "needs.json");
  writeFileSync(needs, JSON.stringify([{ type: "photo", label: "photo", tags: ["mark"] }]));
  assert.match(A(["check", v, needs]).out, /\| photo \| 待審核 \|/);
  assert.equal(A(["review", v, index(v)[0].path]).code, 1, "review needs --approved-by");
  assert.equal(A(["review", v, index(v)[0].path, "--approved-by", "PM"]).code, 0);
  assert.match(A(["check", v, needs]).out, /\| photo \| 已有 \|/);
});

test("a logo file that is not the brand kit's own is flagged by content, not by name", () => {
  const v = lib("assets-logo");
  const fake = join(v, "novamind.svg"); // right name, wrong file
  writeFileSync(fake, readFileSync(join(root, "brand-kits/novamind/logos/novamind.svg"), "utf8").replace(/#12A39A/gi, "#FF0000"));
  let r = A(["add", v, fake, "--type", "logo", "--source", "test"]);
  assert.match(r.out, /not byte-identical to a brand-kit logo/);
  r = A(["add", v, join(root, "brand-kits/novamind/logos/novamind-white.svg"), "--type", "logo", "--source", "brand kit"]);
  assert.doesNotMatch(r.out, /not byte-identical/);
});

test("a confirmed per-file plan imports mixed files with their own tags", () => {
  const v = lib("assets-plan");
  const plan = join(v, "plan.json");
  writeFileSync(plan, JSON.stringify([
    { file: fixture("images/neutral-device.png"), type: "photo", product: "NovaMind", tags: ["產品圖"], source: "產品部" },
    { file: join(root, "brand-kits/novamind/logos/novamind.svg"), type: "logo", tags: ["主要"], source: "brand kit" },
  ]));
  assert.equal(A(["add-plan", v, plan]).code, 0);
  const i = index(v);
  assert.deepEqual(i.map((e) => e.type), ["photo", "logo"]);
  assert.deepEqual(i.map((e) => e.tags[0]), ["產品圖", "主要"]);
});
