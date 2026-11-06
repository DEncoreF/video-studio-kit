#!/usr/bin/env node
// Per-run reference log (no pre-built database). Each video keeps references.md; every entry
// is also appended to the personal layer's references-log.jsonl (see lib/paths.mjs) so later
// videos can search past finds. The user can hand in references too: a link, or a file dropped in
// <profile>/inbox/ (D7: we keep the link or local path and our notes, never a copy in the film).
//   node scripts/refs.mjs add <videoDir|-> (--url U | --file F) --title T --why W [--learn "what to take"]
//        [--by user|claude] [--direction D] [--used yes|no|maybe] [--license L] [--tags a,b] [--effects id,…]
//        [--source_site URL] [--kind site --category 文字效果]   (kind site: a collection to search, not one work)
//        [--at 4.5-6.5[,7.2-8]] (the moments of the video it is about; one video can be logged once per moment)
//        [--note 隱喻="…" --note 手法="…"] (labelled notes, kept in order) [--video URL | --image URL] (media to show,
//        when the page's own player cannot be embedded, e.g. a YouTube copy or a GIF)
//        (the link is opened first; a dead link is refused unless --no-check)
//   node scripts/refs.mjs check [--all] [--remove-dead]   (open every logged reference and listed site)
//   node scripts/refs.mjs enrich [--force]   (fill in media, author, the site's tags and colours for older entries)
//   node scripts/refs.mjs search <words…> [--project <project>]
//   node scripts/refs.mjs list [videoDir|projectDir] [--by user]
//   node scripts/refs.mjs verdicts [--tag T]   (what the user liked / disliked in the gallery, with reasons)
//   node scripts/refs.mjs inbox                (files in <profile>/inbox/ not logged yet)
// Reference cards (lib/refcards.mjs): what a reference is for, so the plan can bind it and the board and the review can use it.
//   node scripts/refs.mjs card <id|refKey> [--facet transition,camera] [--take transition="條狀掃過，新畫面跟在條後"]…
//        [--avoid "不抄它的配色"] [--axis pacing=fast --axis camera=push,pan] [--file <local copy to cut frames from>]
//        (add takes the same --facet/--take/--avoid/--axis; the axes and their values are in library/rules/ref-axes.json)
//   node scripts/refs.mjs cards [videoDir|projectDir] [--facet F] [--json]
//   node scripts/refs.mjs board <filmDir>      (direction/refboard/: per beat and seam, the bound cards' take/avoid and frames)
//   node scripts/refs.mjs match <filmDir> [--facet F] [--top 10]   (cards ranked as seeds against direction/axes.json)
//   node scripts/refs.mjs hunt <filmDir>       (direction/ref-hunt.md: what each beat and seam still needs, best existing cards,
//        the rules of a hunt round, and the 參考不足 decision for required nodes still empty; exit 1 while one is)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { INBOX, REF_SITES, REFS_LOG, VIDEOS, filmId, projectOf } from "./lib/paths.mjs";
import { addRef, checkLink, readRefs as readLog, refKey, tilde } from "./lib/refs.mjs";
import { fileMeta, sourceMeta } from "./lib/sources.mjs";
import { AXES, FACETS, board, cardFrames, cardId, hunt, match, showAxes, tagRef, targetAxes } from "./lib/refcards.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d = "") => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const all = (k) => rest.flatMap((a, i) => (a === `--${k}` ? [rest[i + 1]] : []));
const MARK = { like: "♥ ", dislike: "✗ " };

/** --facet a,b / --take facet=text / --avoid / --file for the card commands. */
function tagCard(key) {
  const take = Object.fromEntries(all("take").map((s) => String(s).split(/=(.*)/s)).filter(([k, v]) => k && v).map(([k, v]) => [k.trim(), v.trim()]));
  const axes = Object.fromEntries(all("axis").map((s) => String(s).split(/=(.*)/s)).filter(([k, v]) => k && v).map(([k, v]) => [k.trim(), v.trim()]));
  return tagRef(key, { facets: opt("facet").split(",").map((s) => s.trim()).filter(Boolean), take, avoid: opt("avoid"), axes, file: opt("file") ? resolve(opt("file")) : "" });
}
function showCard(e) {
  const c = e.card ?? {}, n = cardFrames(e.id).length;
  console.log(`${e.id}  ${e.title}  [${(c.facets ?? []).map((f) => FACETS[f]).join("、")}]${n ? `  ${n} 格` : "  沒有影格"}${c.palette?.length ? `  ${c.palette.join(" ")}` : ""}`);
  for (const [f, t] of Object.entries(c.take ?? {})) console.log(`    借${FACETS[f]}：${t}`);
  if (c.avoid) console.log(`    別抄：${c.avoid}`);
  if (c.axes && Object.keys(c.axes).length) console.log(`    軸：${showAxes(c.axes)}`);
}
// A film is named by its folder: a path, or a bare id under videos/ ("demo/films/focus").
const filmDir = (a) => { const d = [resolve(a), join(VIDEOS, a)].find((x) => existsSync(x)); if (!d) { console.error(`沒有這支片：${a}（給影片資料夾的路徑，例如 videos/<專案>/films/<片>）`); process.exit(1); } return d; };
if (cmd === "add") {
  const general = rest[0] === "-"; // a reference for the library as a whole, not one video
  if (!general && (!rest[0] || rest[0].startsWith("--"))) { console.error("usage: refs.mjs add <videoDir|-> --url U --title T --why W"); process.exit(1); }
  const dir = general ? null : filmDir(rest[0]);
  if (dir && !opt("why") && opt("kind") !== "site") { console.error("--why：一句話說這件為什麼值得看（找參考時每件都要寫）"); process.exit(1); }
  const f = Object.fromEntries(["url", "title", "why", "learn", "by", "direction", "used", "license", "tags", "effects", "kind", "category", "source_site", "at"].map((k) => [k, opt(k)]));
  f.notes = all("note");
  const file = opt("file") ? resolve(opt("file")) : "";
  // A reference that no longer opens is no use later: check it first (D7 keeps only the link).
  const c = rest.includes("--no-check") ? null : await checkLink(f.url || file);
  if (c?.status === "dead") { console.error(`✗ 連結打不開（${c.note}）：${f.url || file}\n  確定要記就加 --no-check`); process.exit(1); }
  if (c?.status === "blocked") console.error(`! ${c.note}（HTTP ${c.http}），照樣記錄`);
  const meta = file ? await fileMeta(file) : await sourceMeta(f.url);
  if (opt("video") || opt("image")) meta.media = { ...meta.media, ...(opt("video") && { video: opt("video") }), ...(opt("image") && { image: opt("image"), poster: opt("image") }) };
  const r = addRef({ ...meta, ...f, title: f.title || meta.title, file, checked: c && { date: new Date().toISOString().slice(0, 10), status: c.status, http: c.http } }, dir);
  if (r.error) { console.error(r.error); process.exit(1); }
  console.log(`logged: ${r.entry.title}${r.entry.by === "user" ? " (from user)" : ""}  id ${cardId(r.entry)}`);
  if (opt("facet") || all("take").length || opt("avoid") || all("axis").length) { const t = tagCard(cardId(r.entry)); if (t.error) { console.error(t.error); process.exit(1); } }
} else if (cmd === "enrich") {
  // Fill in what each source site says (media, author, tags, colours) for entries logged before that existed.
  const log = readLog(); let n = 0;
  for (const e of log) {
    if (e.media && !rest.includes("--force")) continue;
    const meta = e.url.startsWith("/") ? await fileMeta(e.url) : await sourceMeta(e.url);
    for (const k of ["media", "site_tags", "author", "page", "prompt", "palette", "source"]) if (meta[k] && (typeof meta[k] !== "object" || Object.keys(meta[k]).length)) e[k] = meta[k];
    if (meta.media) n++;
    process.stdout.write(`${meta.media ? "✓" : "·"} ${e.title}\n`);
  }
  writeFileSync(REFS_LOG, log.map((e) => JSON.stringify(e) + "\n").join(""));
  console.log(`${n} 筆補上了影片或圖片`);
} else if (cmd === "check") {
  // Every logged reference and every site in reference-sites.md; --remove-dead drops the dead ones
  // from both (both files are in the personal layer's git, so a removal can be undone there).
  const log = readLog(), sitesMd = existsSync(REF_SITES) ? readFileSync(REF_SITES, "utf8") : "";
  const urls = [...new Set([...log.map((e) => e.url), ...[...sitesMd.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1])])];
  const res = new Map();
  for (let i = 0; i < urls.length; i += 6) await Promise.all(urls.slice(i, i + 6).map(async (u) => res.set(u, await checkLink(u))));
  const mark = { ok: "✓", blocked: "?", dead: "✗" };
  for (const u of urls) { const c = res.get(u); if (c.status !== "ok" || rest.includes("--all")) console.log(`${mark[c.status]} ${c.status.padEnd(7)} ${c.http ?? ""} ${u}${c.note ? `  （${c.note}）` : ""}`); }
  const dead = urls.filter((u) => res.get(u).status === "dead");
  console.log(`${urls.length} 個連結：${urls.length - dead.length - urls.filter((u) => res.get(u).status === "blocked").length} 可用、${urls.filter((u) => res.get(u).status === "blocked").length} 擋程式（瀏覽器可能可開）、${dead.length} 打不開`);
  if (rest.includes("--remove-dead") && dead.length) {
    writeFileSync(REFS_LOG, log.filter((e) => !dead.includes(e.url)).map((e) => JSON.stringify(e) + "\n").join(""));
    if (sitesMd) writeFileSync(REF_SITES, sitesMd.split("\n").filter((l) => !dead.some((u) => l.includes(`](${u})`))).join("\n"));
    console.log(`已移除 ${dead.length} 個打不開的連結`);
  }
} else if (cmd === "search") {
  const proj = opt("project"), words = rest.filter((w, i) => !w.startsWith("--") && rest[i - 1] !== "--project").map((w) => w.toLowerCase());
  const hits = readLog().filter((e) => (!proj || e.project === proj) && words.every((w) => JSON.stringify(e).toLowerCase().includes(w)));
  for (const e of hits) console.log(`${MARK[e.verdict?.v] ?? ""}${e.date} [${e.video}] ${e.title} — ${e.why} (${e.used}) ${refKey(e)}`);
  if (!hits.length) console.log("no past references match");
} else if (cmd === "list") {
  // a film folder lists that film; a project folder lists every film and test in it
  const d = rest[0] && !rest[0].startsWith("--") ? filmDir(rest[0]) : null, v = d && filmId(d), isProj = d && projectOf(d) === v, by = opt("by");
  for (const e of readLog().filter((x) => (!v || (isProj ? x.project === v : x.video === v)) && (!by || (x.by ?? "claude") === by)))
    console.log(`${MARK[e.verdict?.v] ?? ""}${e.date} [${e.video || "library"}] ${e.title} (${e.used}${e.by === "user" ? ", user" : ""}) ${refKey(e)}`);
} else if (cmd === "verdicts") {
  const tag = opt("tag"), L = readLog().filter((e) => !tag || (e.tags ?? []).includes(tag)), marked = L.filter((e) => e.verdict);
  for (const v of ["like", "dislike", null]) for (const e of marked.filter((x) => (x.verdict.v ?? null) === v))
    console.log(`${{ like: "喜歡", dislike: "不喜歡" }[v] ?? "只留言"}\t${e.title}${e.verdict.note ? ` — ${e.verdict.note}` : ""}\t${refKey(e)}`);
  console.log(`${marked.length} / ${L.length} 已標記${tag ? `（標籤 ${tag}）` : ""}`);
} else if (cmd === "card") {
  const key = rest[0] && !rest[0].startsWith("--") ? rest[0] : (console.error("card <id|refKey> --facet … --take 面向=借什麼 --avoid … --file …"), process.exit(1));
  const r = tagCard(key); if (r.error) { console.error(r.error); process.exit(1); }
  showCard(r.entry);
} else if (cmd === "cards") {
  const d = rest[0] && !rest[0].startsWith("--") ? filmDir(rest[0]) : null, v = d && filmId(d), isProj = d && projectOf(d) === v, facet = opt("facet");
  const L = readLog().filter((e) => e.card && (!v || (isProj ? e.project === v : e.video === v)) && (!facet || e.card.facets?.includes(facet))).map((e) => ({ ...e, id: cardId(e) }));
  if (rest.includes("--json")) { console.log(JSON.stringify(L.map((e) => ({ ...e, frames: cardFrames(e.id) })), null, 1)); process.exit(0); }
  for (const e of L) showCard(e);
  console.log(L.length ? `${L.length} 張卡；綁到 script.json：拍或接縫加 "refs": ["<id>"]` : "還沒有參考卡：refs.mjs card <id> --facet … --take 面向=借什麼");
} else if (cmd === "board") {
  const d = filmDir(rest[0] ?? ""), sf = join(d, "direction/script.json");
  if (!existsSync(sf)) { console.error(`沒有 ${sf}`); process.exit(1); }
  const B = board(d, JSON.parse(readFileSync(sf, "utf8")));
  console.log(`${B.md}${B.missing.length ? `\n⛔ 沒有綁參考：${B.missing.map((n) => `${n.node === "beat" ? "拍" : "接縫"} ${n.id}（${n.why}）`).join("、")}` : ""}${B.unknown.length ? `\n✗ 找不到的參考 id：${B.unknown.map((n) => `${n.id} → ${n.key}`).join("、")}` : ""}`);
  process.exit(B.missing.length || B.unknown.length ? 1 : 0);
} else if (cmd === "match") {
  const d = filmDir(rest[0] ?? ""), T = targetAxes(d);
  if (T.missing || T.error) { console.error(T.error ?? `沒有 ${join(d, "direction/axes.json")}：先寫這支片在各軸上要什麼，例如 {"pacing": "fast", "tone": ["premium", "bold"]}（${Object.entries(AXES).map(([k, a]) => `${k} ${a.zh}`).join("、")}）`); process.exit(1); }
  const M = match(T.axes, { facets: opt("facet") ? [opt("facet")] : [] }).slice(0, +opt("top", "10"));
  console.log(`這支片要：${showAxes(T.axes)}`);
  for (const e of M) console.log(`${String(e.score).padStart(2)}  ${e.id}  ${e.title}  符合：${[...e.fac.map((f) => FACETS[f]), ...e.hit.map((k) => AXES[k].zh)].join("、")}`);
  if (!M.length) console.log("沒有符合的卡：先找參考（refs.mjs hunt），標上 --axis");
} else if (cmd === "hunt") {
  const d = filmDir(rest[0] ?? ""), sf = join(d, "direction/script.json");
  const S = existsSync(sf) ? JSON.parse(readFileSync(sf, "utf8")) : { beats: [], seams: [] };
  const H = hunt(d, S, { sites: existsSync(REF_SITES) ? readFileSync(REF_SITES, "utf8") : "" });
  console.log(`${H.file}\n缺口 ${H.gaps.length} 處（一定要有的 ${H.required.length} 處）${H.target.missing ? "；⛔ 還沒寫 direction/axes.json" : ""}`);
  for (const n of H.required) console.log(`  ⛔ ${n.node === "beat" ? "拍" : "接縫"} ${n.id}（${n.why}）`);
  process.exit(H.required.length || H.target.missing ? 1 : 0);
} else if (cmd === "inbox") {
  mkdirSync(INBOX, { recursive: true });
  const logged = new Set(readLog().map((e) => e.url));
  const files = readdirSync(INBOX).filter((f) => !f.startsWith(".") && f !== "README.md").map((f) => join(INBOX, f));
  const fresh = files.filter((f) => !logged.has(f));
  for (const f of fresh) console.log(tilde(f));
  console.log(fresh.length ? `${fresh.length} new file(s) in ${tilde(INBOX)}/` : "inbox: nothing new");
} else {
  console.error("usage: refs.mjs add|search|list|verdicts|inbox|check|enrich|card|cards|board"); process.exit(1);
}
