// Regenerates the text images the regression tests OCR (run once; outputs are committed).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
const root = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const exe = execFileSync(process.execPath, [`${root}scripts/hf.mjs`, "browser", "path"], { encoding: "utf8" }).trim().split("\n").pop();
const font = `@font-face{font-family:T;src:url(file://${root}brand-kits/_fonts/NotoSansTC-VF.ttf)}body{margin:0;font-family:T}`;
const shots = {
  "filter-bar-medical.png": [1600, 400, `<div style="background:#e9ecfd;height:400px;display:flex;gap:28px;align-items:center;padding-left:80px">${["全部", "跨產業", "醫療", "製造", "零售"].map((t) => `<span style="background:#bcc4fd;color:#fff;border-radius:40px;padding:14px 40px;font-size:56px;font-weight:700">${t}</span>`).join("")}</div>`],
  "other-brand-kestrel.png": [1200, 600, `<div style="background:#fff;height:600px;display:grid;place-items:center;font-size:96px;font-weight:900;color:#1B2547">Kestrel 聯盟 產品展示</div>`],
};
const b = await chromium.launch({ executablePath: exe });
for (const [name, [w, h, html]] of Object.entries(shots)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<style>${font}</style>${html}`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${root}tests/fixtures/images/${name}` }); await p.close();
}
await b.close();
console.log("images written");
