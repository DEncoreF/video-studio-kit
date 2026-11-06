// Regression tests for the gallery's library tabs: reference sites parsed from the hand-written list,
// the 關係圖 built only from written-down fields, and references added from the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, fresh, join, mkdirSync, node, PROFILE, readFileSync, root, writeFileSync } from "./helpers.mjs";
import { graph, parseSites } from "../scripts/lib/library.mjs";

const SITES_MD = `# 參考網站

## 主要來源：Prompt Motion

[prompt-motion.com](https://prompt-motion.com/)：動態影片合集，附提示詞。

| Prompt Motion 分類（支數） | 對應 |
|---|---|
| Kinetic type（98） | 文字效果 |

## 文字效果

| 網站 | 適合找 |
|---|---|
| [React Bits](https://reactbits.dev) | 文字動畫元件，MIT |
| HyperFrames 動畫 skill | 本機就有 |

## 動畫效果

| 網站 | 適合找 |
|---|---|
| [React Bits](https://reactbits.dev) | 背景、粒子 |
`;

test("reference sites: links in paragraphs and first table cells, under their heading; plain rows are skipped", () => {
  const s = parseSites(SITES_MD);
  assert.deepEqual(s.map((x) => [x.category, x.name]), [["主要來源：Prompt Motion", "prompt-motion.com"], ["文字效果", "React Bits"], ["動畫效果", "React Bits"]]);
  assert.equal(s[0].note, "動態影片合集，附提示詞。");
});

test("the graph links only what a field names; registry items join only when linked; sites are not references", () => {
  const g = graph({
    styles: [{ id: "swiss", zh: "瑞士", raw: "用 翻牌 開場" }, { id: "y2k", zh: "Y2K", raw: "" }],
    refs: [
      { url: "https://a.example/1", title: "A", direction: "swiss", effects: ["rgb-glitch-text"], tags: ["科技感"], source_site: "https://site.example/" },
      { url: "https://site.example/", title: "網站", kind: "site" },
    ],
    effects: [{ id: "split-flap", zh: "翻牌", en: "Split Flap", hyperframes: "split-flap-board" }, { id: "count", zh: "數字跳動", en: "Count", hyperframes: "(blueprint dataviz-countup)" }],
    siteList: [{ name: "網站", url: "https://site.example/", categories: ["x"] }],
    registryItems: [{ name: "split-flap-board", title: "Split-Flap Board" }, { name: "rgb-glitch-text", title: "RGB Glitch" }, { name: "unused-thing", title: "Unused" }],
  });
  const has = (a, b, why) => g.edges.some((e) => e.a === a && e.b === b && e.why === why);
  assert.ok(has("ref:https://a.example/1", "style:swiss", "參考方向"));
  assert.ok(has("ref:https://a.example/1", "registry:rgb-glitch-text", "用到的效果"));
  assert.ok(has("ref:https://a.example/1", "site:https://site.example/", "出處"));
  assert.ok(has("ref:https://a.example/1", "tag:科技感", "標籤"));
  assert.ok(has("effect:split-flap", "registry:split-flap-board", "對應元件"));
  assert.ok(has("style:swiss", "effect:split-flap", "配方提到"));
  assert.ok(!g.nodes.some((n) => n.id === "registry:unused-thing"), "an unlinked registry item stays out");
  assert.ok(!g.nodes.some((n) => n.id === "ref:https://site.example/"), "a site is not drawn as a reference");
  assert.ok(!g.edges.some((e) => e.a === "effect:count"), "a blueprint note is not a component");
});

function server(env) {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [join(root, "scripts/gallery.mjs"), "--port", "0"], { cwd: root, env: { ...process.env, VSO_PROFILE: PROFILE, ...env } });
    let out = "";
    p.stdout.on("data", (c) => { out += c; const m = out.match(/localhost:(\d+)/); if (m) done({ p, url: `http://localhost:${m[1]}` }); });
    p.on("exit", (c) => fail(new Error(`gallery exited ${c}: ${out}`)));
  });
}

test("a reference added on the page is logged like refs.mjs add; other sites and bad entries are refused", async () => {
  const d = fresh("gallery-add"), prof = join(d, "me"), ws = join(d, "ws");
  mkdirSync(join(ws, "videos/demo"), { recursive: true }); mkdirSync(prof, { recursive: true });
  const { p, url } = await server({ VSO_PROFILE: prof, VSO_WORKSPACE: ws, VSO_LINK_CHECK: "off" }); // made-up links: the check has its own test
  try {
    const post = (body, headers = { "content-type": "application/json" }) => fetch(`${url}/refs`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    let r = await post({ url: "https://example.com/reel", title: "示範片", why: "節奏", effects: "翻牌, rgb-glitch-text", tags: "科技感", video: "demo", direction: "swiss" });
    assert.equal(r.status, 200, await r.clone().text());
    const log = readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log.length, 1);
    assert.deepEqual([log[0].by, log[0].video, log[0].effects, log[0].tags], ["user", "demo", ["翻牌", "rgb-glitch-text"], ["科技感"]]);
    assert.match(readFileSync(join(ws, "videos/demo/references.md"), "utf8"), /示範片.*使用者提供/);
    assert.equal((await post({ url: "https://example.com/reel", title: "again", video: "demo" })).status, 400, "duplicate");
    assert.equal((await post({ url: "javascript:alert(1)", title: "x" })).status, 400, "not a web link");
    assert.equal((await post({ url: "https://example.com/2", title: "x", video: "../../etc" })).status, 400, "unknown video");
    assert.equal((await post("url=https://x.example&title=x", { "content-type": "application/x-www-form-urlencoded" })).status, 403, "a plain form post from another page");
    assert.equal((await post({ url: "https://x.example", title: "x" }, { "content-type": "application/json", origin: "https://evil.example" })).status, 403, "another origin");
    r = await post({ kind: "site", url: "https://sites.example/", title: "新網站", why: "找轉場", category: "動畫效果" });
    assert.equal(r.status, 200);
    const data = await (await fetch(`${url}/data.json`)).json();
    assert.ok(data.sites.some((s) => s.url === "https://sites.example/" && s.categories[0] === "動畫效果"));
    assert.ok(!data.refs.some((x) => x.url === "https://sites.example/"), "a site is listed on 參考網站, not 參考");
    assert.ok(data.videos.includes("demo"));
    assert.equal(readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").length, 2);
    assert.ok(!existsSync(join(root, "library/references-log.jsonl")), "nothing is written into the tool");
  } finally { p.kill(); }
});

test("refs.mjs add refuses an exact repeat and keeps the effects it was given", () => {
  const prof = join(fresh("refs-effects"), "me");
  const add = () => node("scripts/refs.mjs", ["add", "-", "--url", "https://example.com/a", "--title", "A", "--effects", "翻牌,typewriter"], { VSO_PROFILE: prof, VSO_LINK_CHECK: "off" });
  assert.equal(add().code, 0);
  const again = add();
  assert.equal(again.code, 1); assert.match(again.out, /already logged/);
  assert.deepEqual(JSON.parse(readFileSync(join(prof, "references-log.jsonl"), "utf8")).effects, ["翻牌", "typewriter"]);
});

test("my own text effects merge with the built-in list by id: my names win, missing fields keep the built-in ones", async () => {
  const prof = join(fresh("gallery-effects"), "me");
  mkdirSync(prof, { recursive: true });
  writeFileSync(join(prof, "text-effects.json"), JSON.stringify({ groups: { SWITCH: "換詞" }, effects: [
    { no: 1, id: "split-flap", zh: "翻牌", en: "Split Flap", look: "車站時刻表", group: "SWITCH", hyperframes: "(GSAP 自製)", cjk: "ok" },
    { no: 2, id: "my-move", zh: "我的招", en: "My Move", look: "新招", group: "SWITCH", hyperframes: "(GSAP 自製)", cjk: "partial" },
  ] }));
  writeFileSync(join(prof, "effect-demos.js"), "window.EFFECT_DEMOS = { 'my-move': { bg: '#000', css: '', html: '<b>招</b>' } };");
  const { p, url } = await server({ VSO_PROFILE: prof });
  try {
    const d = await (await fetch(`${url}/data.json`)).json();
    const built = JSON.parse(readFileSync(join(root, "library/text-effects.json"), "utf8")).effects;
    assert.equal(d.effects.length, built.length + 1);
    const flap = d.effects.find((e) => e.id === "split-flap");
    assert.deepEqual(flap.from, ["built-in", "mine"]);
    assert.equal(flap.look, "車站時刻表");
    assert.equal(flap.hyperframes, "split-flap-board", "a real component beats (GSAP 自製)");
    assert.deepEqual(d.effects.find((e) => e.id === "my-move").from, ["mine"]);
    assert.deepEqual(d.effectGroups, { SWITCH: "換詞" });
    assert.match(await (await fetch(`${url}/personal/effect-demos.js`)).text(), /my-move/);
  } finally { p.kill(); }
});

test("a reference is opened before it is logged: dead links are refused, sites that block scripts are kept with a note", async () => {
  const { createServer } = await import("node:http");
  const srv = createServer((req, res) => { res.writeHead({ "/ok": 200, "/gone": 404, "/bot": 403 }[req.url] ?? 500); res.end("x"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const { checkLink } = await import("../scripts/lib/refs.mjs");
    assert.equal((await checkLink(`${base}/ok`)).status, "ok");
    assert.equal((await checkLink(`${base}/gone`)).status, "dead");
    assert.equal((await checkLink(`${base}/bot`)).status, "blocked");
    assert.equal((await checkLink("http://does-not-exist.invalid/")).status, "dead");
    const prof = join(fresh("refs-check"), "me"), env = { VSO_PROFILE: prof };
    const add = (path, extra = []) => new Promise((done) => {
      const p = spawn(process.execPath, [join(root, "scripts/refs.mjs"), "add", "-", "--url", `${base}${path}`, "--title", path, ...extra], { env: { ...process.env, ...env } });
      let out = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (out += c)); p.on("exit", (code) => done({ code, out }));
    });
    let r = await add("/gone");
    assert.equal(r.code, 1); assert.match(r.out, /連結打不開/);
    r = await add("/gone", ["--no-check"]);
    assert.equal(r.code, 0, "--no-check logs it anyway");
    r = await add("/bot");
    assert.equal(r.code, 0); assert.match(r.out, /擋程式/);
    r = await add("/ok", ["--source_site", "https://example.com/"]);
    const log = readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const ok = log.find((e) => e.title === "/ok");
    assert.equal(ok.checked.status, "ok"); assert.equal(ok.source_site, "https://example.com/");
    assert.equal(log.find((e) => e.title === "/bot").checked.status, "blocked");
  } finally { srv.close(); }
});

test("an image can be a reference: uploaded to the inbox, shown as the media, its colours measured", async () => {
  const d = fresh("gallery-image"), prof = join(d, "me");
  mkdirSync(prof, { recursive: true });
  const { p, url } = await server({ VSO_PROFILE: prof, VSO_LINK_CHECK: "off" });
  try {
    // a small red-and-blue PNG made with the project's ffmpeg
    const { createRequire } = await import("node:module"), { execFileSync } = await import("node:child_process");
    const src = join(d, "src.png");
    execFileSync(createRequire(import.meta.url)("ffmpeg-static"), ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-filter_complex", "hstack", "-frames:v", "1", src]);
    const png = `data:image/png;base64,${readFileSync(src).toString("base64")}`;
    const post = (path, body) => fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let r = await post("/upload", { name: "frame.png", data: png });
    const { file } = await r.json();
    assert.ok(file.startsWith(join(prof, "inbox")), file);
    assert.equal((await post("/upload", { name: "x.svg", data: "data:image/svg+xml;base64,PHN2Zz4=" })).status, 400, "only raster images");
    r = await post("/refs", { url: file, file, title: "分鏡截圖" });
    assert.equal(r.status, 200, await r.clone().text());
    const { entry } = await r.json();
    assert.equal(entry.media.image, file);
    assert.ok(entry.palette.length >= 1 && entry.site_tags.colors.length >= 1, JSON.stringify(entry));
    assert.equal((await fetch(`${url}/inbox/${file.split("/").pop()}`)).status, 200, "the page can show it");
    assert.equal((await post("/refs", { url: "/etc/hosts", file: "/etc/hosts", title: "x" })).status, 400, "files outside the inbox are refused");
  } finally { p.kill(); }
});

test("colour names are plain words for the filter", async () => {
  const { colourName } = await import("../scripts/lib/sources.mjs");
  assert.deepEqual([[0, 0, 0], [250, 250, 250], [120, 120, 125], [220, 30, 30], [40, 80, 220], [60, 170, 80]].map(colourName), ["black", "white", "gray", "red", "blue", "green"]);
});

test("a video reference can name its moments and carry labelled notes; one video is logged once per moment", () => {
  const prof = join(fresh("refs-moments"), "me"), env = { VSO_PROFILE: prof, VSO_LINK_CHECK: "off" };
  const add = (...a) => node("scripts/refs.mjs", ["add", "-", "--url", "https://example.com/reel", "--title", "R", ...a], env);
  assert.equal(add("--at", "4.5-6.5,7.2-8", "--note", "隱喻=門甩上", "--note", "手法=clip-path 切兩半 = 門板", "--video", "https://cdn.example/r.mp4").code, 0);
  assert.equal(add("--at", "10-12").code, 0, "another moment of the same video");
  assert.match(add("--at", "4.5-6.5,7.2-8").out, /already logged/);
  assert.match(add("--at", "6-5").out, /--at wants seconds/);
  const [e] = readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(e.at, [[4.5, 6.5], [7.2, 8]]);
  assert.deepEqual(e.notes, { 隱喻: "門甩上", 手法: "clip-path 切兩半 = 門板" }, "notes keep their order and any = inside the text");
  assert.equal(e.media.video, "https://cdn.example/r.mp4");
});

test("likes and dislikes are kept in the reference's entry; only logged local files are served, in byte ranges", async () => {
  const d = fresh("gallery-verdict"), prof = join(d, "me"), clip = join(d, "film.mp4"), other = join(d, "secret.mp4");
  mkdirSync(prof, { recursive: true }); writeFileSync(clip, Buffer.alloc(1000, 7)); writeFileSync(other, "x");
  const env = { VSO_PROFILE: prof, VSO_LINK_CHECK: "off" };
  assert.equal(node("scripts/refs.mjs", ["add", "-", "--file", clip, "--title", "在地端", "--at", "2.2-4.5", "--tags", "semantic-type"], env).code, 0);
  assert.equal(node("scripts/refs.mjs", ["add", "-", "--file", clip, "--title", "不出門", "--at", "4.5-6.7", "--tags", "semantic-type"], env).code, 0);
  const { p, url } = await server(env);
  try {
    const post = (body) => fetch(`${url}/refs/verdict`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ key: `${clip}#t=2.2-4.5`, v: "like", note: "重量感對" })).status, 200);
    assert.equal((await post({ key: `${clip}#t=4.5-6.7`, v: "dislike" })).status, 200);
    assert.equal((await post({ key: `${clip}#t=9-10`, v: "like" })).status, 400, "unknown reference");
    assert.equal((await post({ key: `${clip}#t=2.2-4.5`, v: "love" })).status, 400, "only like or dislike");
    const log = readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual([log[0].verdict.v, log[0].verdict.note, log[1].verdict.v], ["like", "重量感對", "dislike"]);
    const out = node("scripts/refs.mjs", ["verdicts", "--tag", "semantic-type"], env).out;
    assert.match(out, /喜歡\t在地端 — 重量感對/); assert.match(out, /2 \/ 2 已標記/);
    assert.equal((await post({ key: `${clip}#t=4.5-6.7`, v: null })).status, 200);
    assert.ok(!readFileSync(join(prof, "references-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))[1].verdict, "cleared");
    const r = await fetch(`${url}/local?p=${encodeURIComponent(clip)}`, { headers: { range: "bytes=100-199" } });
    assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${url}/local?p=${encodeURIComponent(other)}`)).status, 404, "a file that is not a logged reference");
  } finally { p.kill(); }
});
