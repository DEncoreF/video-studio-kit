// Reference cards: a logged reference (lib/refs.mjs) made usable by the pipeline — which facets it is a reference for, what to
// take and what not to copy, key frames cut from a local copy and the palette read from them. A card has a short id (8 hex of
// its refKey) that script.json binds to beats and seams (`refs: ["a1b2c3d4"]`), so a reference is a node of the plan that the
// lint requires, the maker's board shows and the review pack compares against — not a link next to the work.
// Frames and palettes live in the personal layer (<profile>/refs/<id>/), reference-only: never in a film (D7).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PROFILE, REFS_LOG, TOOL } from "./paths.mjs";
import { readRefs, refKey } from "./refs.mjs";

/** What a reference can be a reference for (the card's facets). */
export const FACETS = { composition: "構圖", type: "字", color: "顏色", material: "材質", motion: "動態", transition: "交棒", camera: "鏡頭", pacing: "節奏", sound: "聲音", concept: "概念" };
export const CARDS = join(PROFILE, "refs");
/** The design axes a card sits on and a film aims for (library/rules/ref-axes.json): { axis: { zh, values: { key: zh } } }. */
export const AXES = JSON.parse(readFileSync(join(TOOL, "library/rules/ref-axes.json"), "utf8")).axes;
/** Validate { axis: value | [values] } against AXES → { axes } (values as arrays) or { error }. */
export function checkAxes(a = {}) {
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    if (!AXES[k]) return { error: `不認得的軸：${k}（${Object.keys(AXES).join("／")}）` };
    const vals = (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean), bad = vals.filter((x) => !AXES[k].values[x]);
    if (bad.length) return { error: `${AXES[k].zh}（${k}）沒有 ${bad.join("、")}：${Object.keys(AXES[k].values).join("／")}` };
    out[k] = vals;
  }
  return { axes: out };
}
export const showAxes = (a = {}) => Object.entries(a).map(([k, v]) => `${AXES[k]?.zh ?? k}:${[].concat(v).map((x) => AXES[k]?.values[x] ?? x).join("/")}`).join("  ");
export const cardId = (e) => createHash("sha256").update(refKey(e)).digest("hex").slice(0, 8);
export const cardDir = (id) => join(CARDS, id);
const FF = () => createRequire(join(TOOL, "package.json"))("ffmpeg-static");

/** The logged reference for an id (8 hex) or a refKey, with its id. */
export function findRef(key, log = readRefs()) {
  const e = log.find((x) => cardId(x) === key || refKey(x) === key);
  return e ? { ...e, id: cardId(e) } : null;
}
/** Frames on disk for a card, oldest first. */
export const cardFrames = (id) => (existsSync(cardDir(id)) ? readdirSync(cardDir(id)).filter((f) => /^f-[\d.]+\.jpg$/.test(f)).sort((a, b) => parseFloat(a.slice(2)) - parseFloat(b.slice(2))).map((f) => join(cardDir(id), f)) : []);

/** Key frames at the start, middle and end of each moment (or 3 across the clip when it has none), cut from a local file. */
export function cutFrames(id, file, at = []) {
  const dur = +execFileSync(createRequire(join(TOOL, "package.json"))("@ffprobe-installer/ffprobe").path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
  const times = (at.length ? at : [[0, dur]]).flatMap(([a, b]) => [a, (a + b) / 2, Math.max(a, b - 0.05)]).filter((t) => t < dur);
  mkdirSync(cardDir(id), { recursive: true });
  return times.map((t) => { const f = join(cardDir(id), `f-${t.toFixed(2)}.jpg`);
    execFileSync(FF(), ["-nostdin", "-v", "error", "-y", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "3", f]); return f; });
}
/** The 6 main colours of a card's frames, as hex (ffmpeg palettegen over the frames, read back as raw RGB). */
export function palette(frames) {
  if (!frames.length) return [];
  const raw = execFileSync(FF(), ["-nostdin", "-v", "error", ...frames.flatMap((f) => ["-i", f]), "-filter_complex",
    `${frames.map((_, i) => `[${i}:v]scale=320:-2[s${i}]`).join(";")};${frames.map((_, i) => `[s${i}]`).join("")}${frames.length > 1 ? `vstack=inputs=${frames.length},` : ""}palettegen=max_colors=6:reserve_transparent=0:stats_mode=full`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const hex = []; for (let i = 0; i + 2 < raw.length; i += 3) hex.push(`#${[raw[i], raw[i + 1], raw[i + 2]].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
  return [...new Set(hex)].slice(0, 6);
}

/**
 * Make or update a card on a logged reference: facets (keys of FACETS), take { facet: "what to borrow" }, avoid, and a local
 * file to cut frames from (a download the user asked for, a ruler under ~/.video-studio/rulers, or the reference's own file).
 * Returns { entry } or { error }; the log is rewritten in place (it lives in the personal layer's git).
 */
export function tagRef(key, { facets = [], take = {}, avoid = "", file = "", axes = {} } = {}) {
  const log = readRefs(), e = log.find((x) => cardId(x) === key || refKey(x) === key);
  if (!e) return { error: `沒有這個參考：${key}（refs.mjs cards 列出 id）` };
  const bad = [...facets, ...Object.keys(take)].filter((f) => !FACETS[f]); if (bad.length) return { error: `不認得的面向：${bad.join("、")}（${Object.keys(FACETS).join("／")}）` };
  const ax = checkAxes(axes); if (ax.error) return ax;
  const local = file || e.card?.file || (e.url.startsWith("/") ? e.url : "");
  if (local && !existsSync(local)) return { error: `沒有這個檔：${local}` };
  const id = cardId(e), card = { ...(e.card ?? {}) };
  card.facets = [...new Set([...(card.facets ?? []), ...facets, ...Object.keys(take)])];
  card.take = { ...(card.take ?? {}), ...take };
  if (avoid) card.avoid = avoid;
  if (Object.keys(ax.axes).length) card.axes = { ...(card.axes ?? {}), ...ax.axes };
  if (local) { card.file = local; card.frames = cutFrames(id, local, e.at ?? []).map((f) => f.slice(CARDS.length + 1)); card.palette = palette(cardFrames(id)); }
  if (!card.facets.length) return { error: "至少一個面向（--facet 或 --take 面向=借什麼）：這張卡是哪方面的參考" };
  e.card = card;
  writeFileSync(REFS_LOG, log.map((x) => JSON.stringify(x) + "\n").join(""));
  return { entry: { ...e, id } };
}

/** Where a script binds references: every beat and seam with its refs, and whether it must have one (a hero beat; a seam
 *  marked major or bar). Seams fall back to S1, S2… as everywhere else. */
export function bindings(S) {
  return [...(S.beats ?? []).map((b, i) => ({ node: "beat", id: String(b.id ?? `B${i + 1}`), refs: (b.refs ?? []).map(String), required: !!b.hero, why: "主角拍", experimental: b.experimental ?? null, facets: ["composition", "type", "motion"] })),
    ...(S.seams ?? []).map((m, i) => ({ node: "seam", id: String(m.id ?? `S${i + 1}`), refs: (m.refs ?? []).map(String), required: m.major === true || m.bar === true, why: m.bar === true ? "換章節的接縫" : "主要接縫", t: m.t, experimental: m.experimental ?? null, facets: ["transition", "camera"] }))];
}

/** What this film aims for on the design axes: direction/axes.json, { axis: value | [values] } (written in video-direction step 1/3). */
export function targetAxes(dir) {
  const f = join(dir, "direction/axes.json"); if (!existsSync(f)) return { axes: {}, missing: true };
  const r = checkAxes(JSON.parse(readFileSync(f, "utf8"))); return r.error ? { axes: {}, error: `${f}：${r.error}` } : { axes: r.axes };
}
/** Cards ranked as seeds for a film: one point per target axis the card shares a value with, one per wanted facet it covers. */
export function match(target, { facets = [], log = readRefs() } = {}) {
  return log.filter((e) => e.card).map((e) => {
    const c = e.card, hit = Object.entries(target).filter(([k, v]) => (c.axes?.[k] ?? []).some((x) => v.includes(x))).map(([k]) => k), fac = facets.filter((f) => c.facets?.includes(f));
    return { ...e, id: cardId(e), score: hit.length + fac.length, hit, fac };
  }).filter((e) => e.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * The reference hunt for a film: every beat and seam with no card bound (required ones first), what kind of reference it
 * needs, and the best existing cards for it. Written to direction/ref-hunt.md with the rules of a hunt round and, for the
 * required nodes still empty, the 參考不足 decision. Returns { file, gaps, required }.
 */
export function hunt(dir, S, { sites = "", log = readRefs() } = {}) {
  const T = targetAxes(dir), gaps = bindings(S).filter((n) => !n.refs.length && !n.experimental).sort((a, b) => b.required - a.required), required = gaps.filter((n) => n.required);
  const L = ["# 找參考", "",
    `這支片要的樣子（direction/axes.json）：${T.missing ? "⛔ 還沒寫：先在 direction/axes.json 寫這支片在各軸上要什麼（library/rules/ref-axes.json），才排得出 seed" : T.error ?? (showAxes(T.axes) || "（空的）")}`, "",
    "## 這一輪怎麼找", "",
    "- 只從認可的來源找（下面的清單；個人層 `reference-sites.md`），按缺口的類型分開搜（交棒、鏡頭、構圖、字、節奏、產品示範），不要一次搜「好看的影片」。",
    "- 每一輪 3–5 件新作品，每件寫一句**為什麼值得看**（`--why`），影片用 /watch 看過才算。",
    "- 找到就記、就標：`refs.mjs add <片> --url … --why … --at …` → `refs.mjs card <id> --take 面向=借什麼 --axis 軸=值 [--file …]` → 寫進 script.json 的 `refs`。", "",
    ...(sites ? ["## 來源", "", sites.trim(), ""] : []),
    "## 缺口", ""];
  for (const n of gaps) {
    const best = match(T.axes, { facets: n.facets, log }).filter((e) => e.fac.length).slice(0, 3);
    L.push(`### ${n.required ? "⛔ " : ""}${NODE[n.node]} ${n.id}${n.required ? `（${n.why}，一定要有）` : ""}`, "", `要找：${n.facets.map((f) => FACETS[f]).join("、")}的參考`);
    L.push(best.length ? `已經有的候選：${best.map((e) => `\`${e.id}\` ${e.title}（${[...e.fac.map((f) => FACETS[f]), ...e.hit.map((k) => AXES[k].zh)].join("、")}）`).join("；")}` : "已經有的候選：沒有", "");
  }
  if (!gaps.length) L.push("沒有缺口：每一拍、每個接縫都綁了參考或已標實驗。", "");
  if (required.length) L.push("## 參考不足：找過一輪還是沒有時", "",
    "不要沒有參考硬做。把上面標 ⛔ 的缺口、找過哪些來源、為什麼都不合，連同兩個選項給使用者決定：", "",
    "1. **改需求**：改腳本或畫面，換成找得到參考的演法（通常也是程式做得好的演法，見 capabilities.md）；",
    '2. **首創**：接受這一處是實驗。在 script.json 那一拍或接縫寫 `"experimental": "使用者的原話"`；量測照跑（頓點、閃格這些是瑕疵，不是品味），但它不算主線的品質承諾，回報與審片包都標成實驗。', "");
  const file = join(dir, "direction/ref-hunt.md"); mkdirSync(join(dir, "direction"), { recursive: true }); writeFileSync(file, L.join("\n"));
  return { file, gaps, required, target: T };
}
const NODE = { beat: "拍", seam: "接縫" };

/**
 * The maker's reference board for a film: direction/refboard/<node>.jpg (the bound cards' frames, one row per card) and
 * BOARD.md (per beat and seam: what to take, what not to copy, palette, frames). Returns { md, missing, unknown }.
 */
export function board(dir, S, log = readRefs()) {
  const out = join(dir, "direction/refboard"), lines = ["# 參考板", "", "做每一拍、每個接縫之前先看這一節和它的圖：照「借什麼」做，「別抄」的不要。卡片由 `refs.mjs card` 標，綁在 `direction/script.json` 的 `refs`。", ""];
  const missing = [], unknown = [];
  mkdirSync(out, { recursive: true });
  for (const n of bindings(S)) {
    if (!n.refs.length && n.experimental) { lines.push(`## ${NODE[n.node]} ${n.id}`, "", `🧪 實驗：沒有參考，使用者同意首創（「${n.experimental}」）`, ""); continue; }
    if (!n.refs.length) { if (n.required) { missing.push(n); lines.push(`## ${NODE[n.node]} ${n.id}`, "", `⛔ ${n.why}沒有綁參考：先找一件，標好面向與「借什麼」，寫進 script.json 的 refs`, ""); } continue; }
    lines.push(`## ${NODE[n.node]} ${n.id}`, "");
    const rows = [];
    for (const key of n.refs) {
      const e = findRef(key, log); if (!e) { unknown.push({ ...n, key }); lines.push(`- ✗ 沒有參考 \`${key}\``); continue; }
      const c = e.card ?? {}, frames = cardFrames(e.id);
      lines.push(`- **${e.title}** \`${e.id}\`（${(c.facets ?? []).map((f) => FACETS[f]).join("、") || "沒標面向"}）${e.url.startsWith("http") ? ` ${e.url}` : ""}${e.at?.length ? ` @ ${e.at.map((a) => a.join("–")).join("、")} 秒` : ""}`);
      for (const [f, t] of Object.entries(c.take ?? {})) lines.push(`  - 借${FACETS[f]}：${t}`);
      if (c.avoid) lines.push(`  - 別抄：${c.avoid}`);
      if (c.palette?.length) lines.push(`  - 色票：${c.palette.join(" ")}`);
      if (!frames.length) lines.push("  - （沒有影格：給一份本機檔 `refs.mjs card <id> --file …` 才切得出來）");
      if (frames.length) rows.push(frames.slice(0, 6));
    }
    if (rows.length) {
      const img = join(out, `${n.node}-${n.id.replace(/[^\w-]+/g, "_")}.jpg`), W = 320, H = 180;
      const tiles = rows.flatMap((r, y) => r.map((f, x) => ({ f, x: x * (W + 4), y: y * (H + 4) })));
      execFileSync(FF(), ["-nostdin", "-v", "error", "-y", ...tiles.flatMap((t) => ["-i", t.f]), "-filter_complex",
        `${tiles.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2[t${i}]`).join(";")};${tiles.map((_, i) => `[t${i}]`).join("")}${tiles.length > 1 ? `xstack=inputs=${tiles.length}:layout=${tiles.map((t) => `${t.x}_${t.y}`).join("|")}:fill=black` : "null"}`,
        "-frames:v", "1", img]);
      lines.push("", `![${n.id}](${img.slice(out.length + 1)})`);
    }
    lines.push("");
  }
  writeFileSync(join(out, "BOARD.md"), lines.join("\n"));
  return { md: join(out, "BOARD.md"), missing, unknown };
}

/**
 * The review's side-by-side: for every beat and seam that binds a card with frames, one row of this render (a beat at its
 * middle; a seam just before, at and after its time) and one row per bound card, plus refs.txt with what each card says to
 * take and not to copy. Written to <out>/refs/. Returns the nodes compared.
 */
export function compareRefs(render, S, out, log = readRefs()) {
  const rd = join(out, "refs"), W = 320, H = 180, done = [], txt = ["# 和參考並排：每一列第一排是這一版，下面是綁的參考；照「借什麼」逐項比，差在哪寫進審片", ""];
  const beats = Object.fromEntries((S.beats ?? []).map((b, i) => [String(b.id ?? `B${i + 1}`), b]));
  for (const n of bindings(S)) {
    const cards = n.refs.map((k) => findRef(k, log)).filter(Boolean).map((e) => ({ e, frames: cardFrames(e.id).slice(0, 3) })).filter((c) => c.frames.length);
    if (!cards.length) continue;
    mkdirSync(rd, { recursive: true });
    const b = beats[n.id], times = n.node === "beat" ? [b.t0 + (b.t1 - b.t0) * 0.25, (b.t0 + b.t1) / 2, b.t0 + (b.t1 - b.t0) * 0.75] : [n.t - 0.2, n.t, n.t + 0.3].map((t) => Math.max(0, t));
    const ours = times.map((t, i) => { const f = join(rd, `.ours-${n.node}-${n.id}-${i}.jpg`);
      execFileSync(FF(), ["-nostdin", "-v", "error", "-y", "-ss", t.toFixed(3), "-i", render, "-frames:v", "1", "-vf", "scale=640:-2", f]); return f; });
    const rows = [ours, ...cards.map((c) => c.frames)], tiles = rows.flatMap((r, y) => r.map((f, x) => ({ f, x: x * (W + 4), y: y * (H + 4) })));
    const img = join(rd, `${n.node}-${n.id.replace(/[^\w-]+/g, "_")}.jpg`);
    execFileSync(FF(), ["-nostdin", "-v", "error", "-y", ...tiles.flatMap((t) => ["-i", t.f]), "-filter_complex",
      `${tiles.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2[t${i}]`).join(";")};${tiles.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${tiles.length}:layout=${tiles.map((t) => `${t.x}_${t.y}`).join("|")}:fill=black`,
      "-frames:v", "1", img]);
    txt.push(`## ${NODE[n.node]} ${n.id}（${times.map((t) => t.toFixed(2)).join("、")} 秒）→ ${img.slice(out.length + 1)}`);
    for (const { e } of cards) { txt.push(`- ${e.title} \`${e.id}\``); for (const [f, t] of Object.entries(e.card?.take ?? {})) txt.push(`  - 借${FACETS[f]}：${t}`); if (e.card?.avoid) txt.push(`  - 別抄：${e.card.avoid}`); }
    txt.push(""); done.push(n);
  }
  if (done.length) writeFileSync(join(rd, "refs.txt"), txt.join("\n"));
  return done;
}
