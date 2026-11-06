#!/usr/bin/env node
// Brand kits: brand.json is the single source; this generates the HyperFrames-facing files
// and can apply a kit to a video project.
//   node scripts/brand-kit.mjs build [kit]            → design.md, theme.css, tokens.json for each kit
//   node scripts/brand-kit.mjs apply <kit> <videoDir>  → copy logos, fonts, specs, pronunciation into the video
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { KITS as root } from "./lib/paths.mjs";
const kits = () => readdirSync(root).filter((d) => !d.startsWith("_") && existsSync(join(root, d, "brand.json")));
const load = (id) => JSON.parse(readFileSync(join(root, id, "brand.json"), "utf8"));

function designMd(b) {
  const c = b.colors, f = b.fonts;
  return `---
name: ${b.name}
description: ${b.description}
colors:
  ink: "${c.ink.hex}"
  accent: "${c.accent.hex}"
  canvas: "${c.canvas.hex}"
typography:
  display: { fontFamily: "${f.display.family}", weight: ${Math.max(...f.display.weights)} }
  body: { fontFamily: "${f.body.family}", weight: 500 }
  latin: { fontFamily: "${f.latin.family}", weight: 400 }
---

# ${b.name} 品牌規格

${b.description}。本檔由 \`brand-kits/${b.id}/brand.json\` 產生，請改 brand.json 再執行 \`node scripts/brand-kit.mjs build\`。

## 色彩

${Object.entries(c).map(([k, v]) => `- **${k}** \`${v.hex}\`：${v.role}`).join("\n")}

## 字型

${Object.entries(f).map(([k, v]) => `- **${k}**：${v.family}（${v.weights.join("/")}）${v.note ? `，${v.note}` : ""}`).join("\n")}

## Logo

${Object.entries(b.logos).map(([k, v]) => `- **${k}** \`${v.file}\`：${v.use}`).join("\n")}

## 發音（旁白）

${b.pronunciation.map((p) => `- ${p.text} → 合成時寫成「${p.say}」：${p.note}`).join("\n")}

## Do

${b.rules.do.map((r) => `- ${r}`).join("\n")}

## Don't

${b.rules.dont.map((r) => `- ${r}`).join("\n")}
`;
}

// HyperFrames 18-token theme contract (themes/CONTRACT.md). Style recipes override the
// non-brand tokens (canvas, surfaces, motion); brand ink/accent/fonts stay.
const themeCss = (b) => `/* ${b.name} brand theme — generated from brand.json */
:root {
  --bg: ${b.colors.canvas.hex};
  --fg: ${b.colors.ink.hex};
  --muted: color-mix(in srgb, ${b.colors.ink.hex} 55%, ${b.colors.canvas.hex});
  --surface: color-mix(in srgb, ${b.colors.ink.hex} 4%, ${b.colors.canvas.hex});
  --border: color-mix(in srgb, ${b.colors.ink.hex} 18%, ${b.colors.canvas.hex});
  --brand: ${b.colors.ink.hex};
  --accent: ${b.colors.accent.hex};
  --accent-2: color-mix(in srgb, ${b.colors.accent.hex} 35%, ${b.colors.canvas.hex});
  --font-display: "${b.fonts.display.family}", "${b.fonts.latin.family}", serif;
  --font-body: "${b.fonts.body.family}", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --radius: 8px;
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 32px;
  --dur-beat: 0.5s;
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-emphasis: cubic-bezier(0.65, 0, 0.35, 1);
}
`;

// tokens.json: the colors/fonts subset of the extracted/tokens.json that `hyperframes capture` writes (apply puts it there).
const tokensJson = (b) => ({
  colors: [b.colors.ink.hex, b.colors.accent.hex, b.colors.canvas.hex],
  fonts: [b.fonts.display, b.fonts.body].map((f) => ({ family: f.family, weights: f.weights })),
});

function build(ids) {
  for (const id of ids) {
    const b = load(id), dir = join(root, id);
    writeFileSync(join(dir, "design.md"), designMd(b));
    writeFileSync(join(dir, "theme.css"), themeCss(b));
    writeFileSync(join(dir, "tokens.json"), JSON.stringify(tokensJson(b), null, 2) + "\n");
    console.log(`built ${id}: design.md theme.css tokens.json`);
  }
}

function apply(id, video) {
  const b = load(id), dir = join(root, id);
  if (!existsSync(join(dir, "design.md"))) build([id]);
  const put = (from, to) => { mkdirSync(join(video, to, ".."), { recursive: true }); copyFileSync(from, join(video, to)); };
  for (const l of Object.values(b.logos)) put(join(dir, l.file), join("assets/brand", l.file.split("/").pop()));
  // Kit-independent names so compositions can swap brands without edits.
  put(join(dir, b.logos.primary.file), "assets/brand/logo.svg");
  put(join(dir, b.logos.reversed.file), "assets/brand/logo-reversed.svg");
  for (const f of new Set(Object.values(b.fonts).map((x) => x.file))) put(join(root, "_fonts", f), join("fonts", f));
  put(join(root, "_fonts", "OFL.txt"), "fonts/OFL.txt");
  put(join(dir, "theme.css"), "brand/theme.css");
  put(join(dir, "tokens.json"), "capture/extracted/tokens.json");
  writeFileSync(join(video, "brand", "pronunciation.json"), JSON.stringify(b.pronunciation, null, 2) + "\n");
  // design.md is brand truth for HyperFrames; a style recipe's frame.md (if any) takes precedence.
  if (!existsSync(join(video, "design.md"))) put(join(dir, "design.md"), "design.md");
  console.log(`applied ${id} → ${video}`);
}

const [cmd, a, b2] = process.argv.slice(2);
if (cmd === "build") build(a ? [a] : kits());
else if (cmd === "apply" && a && b2) apply(a, b2);
else { console.error("usage: brand-kit.mjs build [kit] | apply <kit> <videoDir>"); process.exit(1); }
