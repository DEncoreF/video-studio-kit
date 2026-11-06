// Style examples must work for any brand and product: no hidden Kestrel copy or layout, logos
// still once placed, and recipe/brand conflicts stop instead of being silently resolved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { existsSync, fixture, fresh, join, node, readFileSync, root, writeFileSync } from "./helpers.mjs";
import { loadKit, otherBrandTerms } from "../scripts/lib/brand.mjs";
import { ocr } from "../scripts/lib/ocr.mjs";

const DATA = { novamind: "novamind-enterprise.json", kestrel: "kestrel-alliance.json" };
// Words that only ever came from the Kestrel sample content; a template that prints them is hard-coded.
const SAMPLE_COPY = ["主權", "治理", "kestrel.example "];
const EXAMPLES = ["swiss", "collage", "bauhaus", "neo-brutalism", "y2k", "op-art"];
const S = { logo: [0, 2.5], product: [2.5, 5.5], stat: [5.5, 8], cta: [8, 10] };

function project(name, data, edit) {
  const v = fresh(name);
  const c = JSON.parse(readFileSync(fixture("content", data), "utf8"));
  edit?.(c);
  mkdirSync(join(v, "direction"), { recursive: true });
  writeFileSync(join(v, "direction/content.json"), JSON.stringify(c, null, 2));
  return v;
}

for (const [kitId, data] of Object.entries(DATA)) {
  test(`swiss and collage render ${kitId} data with no Kestrel sample copy or foreign brand`, () => {
    const v = project(`tpl-${kitId}`, data);
    const r = node("scripts/preview.mjs", [v, "swiss,collage"]);
    assert.equal(r.code, 0, r.out);
    const content = readFileSync(join(v, "direction/content.json"), "utf8");
    const banned = [...SAMPLE_COPY.filter((w) => !content.includes(w.trim())), ...otherBrandTerms(loadKit(kitId))];
    for (const style of ["swiss", "collage"]) {
      const stills = [0, 1, 2, 3].map((i) => join(v, "direction", style, "stills", `frame-0${i}-at-${["1.6", "4.6", "7.4", "9.6"][i]}s.png`));
      for (const s of stills) assert.ok(existsSync(s), s);
      const { results } = ocr(stills);
      const text = Object.values(results).flatMap((o) => o.lines.map((l) => l.text)).join(" ");
      for (const w of banned) assert.ok(!text.includes(w.trim()), `${style}/${kitId} shows "${w}": ${text}`);
      assert.ok(text.replace(/\s/g, "").includes(JSON.parse(content).LABEL.replace(/\s/g, "")), `${style}/${kitId} lost its own copy: ${text}`);
    }
  });
}

test("logos hold still between entrance and exit in every example (V1: collage logo jittered)", async () => {
  const v = project("tpl-logo-motion", DATA.kestrel, (c) => { delete c.product; });
  const r = node("scripts/preview.mjs", [v, EXAMPLES.join(","), "--no-stills"]);
  assert.equal(r.code, 0, r.out);
  const exe = execFileSync(process.execPath, [join(root, "scripts/hf.mjs"), "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
  const browser = await chromium.launch({ executablePath: exe });
  try {
    for (const style of EXAMPLES) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`file://${join(v, "direction", style, "index.html")}`);
      await page.waitForFunction(() => !!window.__timelines?.preview, null, { polling: 100, timeout: 15000 });
      for (const [beat, [a, b]] of Object.entries(S)) {
        const times = [0, 1, 2, 3, 4].map((k) => +(a + 1.4 + k / 15).toFixed(3)).filter((t) => t < b - 0.4);
        const boxes = await page.evaluate((ts) => ts.map((t) => {
          window.__timelines.preview.seek(t, false);
          const logos = [...document.querySelectorAll('img[src*="assets/brand/logo"]')].filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
          if (logos.some((e) => !e.closest(".brand-locked"))) return "logo outside .brand-locked";
          return logos
            .map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2).join(","); }).join("|");
        }), times);
        assert.ok(!boxes.includes("logo outside .brand-locked"), `${style}: a logo is placed without H.logo`);
        assert.ok(boxes.every((x) => x === boxes[0]), `${style} logo moves during the ${beat} hold: ${boxes.join(" / ")}`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("a recipe ban that clashes with a brand rule or a must-have stops the build and is reported", () => {
  const v = project("tpl-conflict", DATA.novamind);
  const r = node("scripts/preview.mjs", [v, "op-art"]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /規則衝突/);
  assert.match(r.out, /照片/);
  assert.match(r.out, /Logo 有彩色/);
  assert.ok(!existsSync(join(v, "direction/op-art/index.html")), "nothing is built for a conflicting style");
});

test("the same recipe builds when nothing clashes (navy logo, no product photo)", () => {
  const v = project("tpl-no-conflict", DATA.kestrel, (c) => { delete c.product; });
  const r = node("scripts/preview.mjs", [v, "op-art", "--no-stills"]);
  assert.equal(r.code, 0, r.out);
});
