// The reference log, shared by scripts/refs.mjs (CLI) and the gallery's 新增參考 form, so both write
// the same entry: one line in the personal layer's references-log.jsonl, plus a row in the video's
// references.md when the reference belongs to one video (D7: links and notes only, never a copy).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REFS_LOG, filmId, projectOf } from "./paths.mjs";

export const tilde = (p) => (p.startsWith(homedir() + "/") ? "~" + p.slice(homedir().length) : p); // files are logged by absolute path, shown with ~
export const readRefs = () => (existsSync(REFS_LOG) ? readFileSync(REFS_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,，、]/)).map((s) => String(s).trim()).filter(Boolean);

/** "4.5-6.5,7.2-8" → [[4.5, 6.5], [7.2, 8]]: the moments of a video that matter, in seconds. Null when malformed. */
export function parseAt(v) {
  if (v == null || v === "") return [];
  const segs = Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim().split("-"));
  const out = segs.map((s) => s.map(Number));
  return out.every((s) => s.length === 2 && s.every(Number.isFinite) && s[0] >= 0 && s[1] > s[0]) ? out : null;
}
/** One reference = one link plus, for a video, the moments it is about: the same video can be logged once per moment. */
export const refKey = (e) => e.url + (e.at?.length ? `#t=${e.at.map((s) => s.join("-")).join(",")}` : "");

/**
 * Does a link still open? "ok" (2xx/3xx after redirects), "blocked" (the site refuses scripts:
 * 401/403/429/999 — it may still open in a browser, so it is kept with a note), or "dead" (404/410,
 * 5xx, DNS failure, timeout). Files are checked on disk. VSO_LINK_CHECK=off skips it (offline work).
 */
export async function checkLink(url, { timeout = 12000 } = {}) {
  if (process.env.VSO_LINK_CHECK === "off") return { status: "unchecked" };
  if (!/^https?:\/\//i.test(url)) return existsSync(url) ? { status: "ok" } : { status: "dead", note: "檔案不存在" };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", accept: "text/html,*/*" } });
    r.body?.cancel?.();
    if (r.ok) return { status: "ok", http: r.status, final: r.url !== url ? r.url : undefined };
    if ([401, 403, 429, 999].includes(r.status)) return { status: "blocked", http: r.status, note: "網站擋程式讀取，用瀏覽器開可能正常" };
    return { status: "dead", http: r.status, note: `HTTP ${r.status}` };
  } catch (e) {
    return { status: "dead", note: e.name === "AbortError" ? "逾時" : String(e.cause?.code ?? e.message) };
  } finally { clearTimeout(timer); }
}

/**
 * Validates and logs one reference. `f` holds the CLI options / form fields; `dir` is the video
 * folder or null for a library-wide reference. Returns { entry } or { error }.
 * kind "site" marks a reference *site* (a collection to search), shown on the gallery's 參考網站 tab.
 */
export function addRef(f, dir = null) {
  const file = f.file ? String(f.file) : "";
  const e = {
    date: new Date().toISOString().slice(0, 10), video: dir ? filmId(dir) : "", url: String(f.url || file).trim(), title: String(f.title ?? "").trim(),
    why: String(f.why ?? "").trim(), learn: String(f.learn ?? "").trim(), by: f.by || "claude", direction: String(f.direction ?? "").trim(),
    used: f.used || "maybe", license: f.license || "reference-only", tags: list(f.tags),
  };
  if (dir && projectOf(dir)) e.project = projectOf(dir);
  if (f.effects && list(f.effects).length) e.effects = list(f.effects); // text-effect ids / registry names it shows
  if (f.kind === "site") { e.kind = "site"; if (f.category) e.category = String(f.category).trim(); }
  if (f.source_site) e.source_site = String(f.source_site).trim();
  if (f.checked) e.checked = f.checked; // result of checkLink, recorded with the entry
  const at = parseAt(f.at);
  if (!at) return { error: `--at wants seconds like 4.5-6.5 or 4.5-6.5,7.2-8: ${f.at}` };
  if (at.length) e.at = at;
  // Labelled notes, in order (e.g. 字 → 隱喻 → 手法 → 為何有效): an object, or "label=text" strings.
  const notes = Array.isArray(f.notes) ? Object.fromEntries(f.notes.map((n) => String(n).split(/=(.*)/s)).filter(([k, v]) => k.trim() && v?.trim()).map(([k, v]) => [k.trim(), v.trim()])) : f.notes;
  if (notes && typeof notes === "object" && Object.keys(notes).length) e.notes = notes;
  // What the source site says about the work (lib/sources.mjs): media to preview, author, the site's own tags.
  for (const k of ["media", "site_tags", "author", "page", "prompt", "palette", "source"]) if (f[k] && (typeof f[k] !== "object" || Object.keys(f[k]).length)) e[k] = f[k];
  if (!e.url || !e.title) return { error: "--url or --file, and --title are required" };
  if (file && !existsSync(file)) return { error: `no such file: ${file}` };
  if (!file && !/^https?:\/\//i.test(e.url)) return { error: `not a web link or an existing file: ${e.url}` };
  if (!["yes", "no", "maybe"].includes(e.used)) return { error: `used must be yes, no or maybe: ${e.used}` };
  if (readRefs().some((x) => refKey(x) === refKey(e) && x.video === e.video)) return { error: `already logged: ${refKey(e)}` };
  mkdirSync(join(REFS_LOG, ".."), { recursive: true });
  appendFileSync(REFS_LOG, JSON.stringify(e) + "\n");
  if (dir) {
    const md = join(dir, "references.md");
    if (!existsSync(md)) writeFileSync(md, `# 參考資源\n\n外部作品只用來分析風格，不放進成片（授權 reference-only）。\n\n| 日期 | 參考 | 為什麼選 | 用在哪個方向 | 採用 | 授權 |\n| --- | --- | --- | --- | --- | --- |\n`);
    const cell = (s) => String(s).replace(/\|/g, "／").replace(/\n/g, " ");
    const link = file ? `${cell(e.title)}（本機：${tilde(file)}）` : `[${cell(e.title)}](${e.url})`;
    const who = e.by === "user" ? "（使用者提供）" : "";
    appendFileSync(md, `| ${e.date} | ${link}${who} | ${cell(e.why)}${e.learn ? `；可借用：${cell(e.learn)}` : ""} | ${cell(e.direction)} | ${e.used} | ${e.license} |\n`);
  }
  return { entry: e };
}

/**
 * The user's verdict on a reference (like / dislike, with an optional reason), written into its log entry
 * so it travels with the reference. `v` null with no note clears it. Returns { entry } or { error }.
 */
export function setVerdict(key, v, note = "") {
  if (![null, "like", "dislike"].includes(v ?? null)) return { error: `verdict must be like or dislike: ${v}` };
  const log = readRefs(), e = log.find((x) => refKey(x) === key);
  if (!e) return { error: `no such reference: ${key}` };
  note = String(note ?? "").trim();
  if (v || note) e.verdict = { v: v ?? null, note, date: new Date().toISOString().slice(0, 10) }; else delete e.verdict;
  writeFileSync(REFS_LOG, log.map((x) => JSON.stringify(x) + "\n").join(""));
  return { entry: e };
}
