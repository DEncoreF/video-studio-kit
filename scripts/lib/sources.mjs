// What a reference site already says about a work: its video or image, author, and the site's own tags
// and colours. The gallery shows references the way those sites do (watch the work, filter by their
// tags), so nothing here is our own interpretation: Raivcoo's keywords and colour palette, Prompt
// Motion's categories and prompt, a page's Open Graph media. An X post is looked up on Prompt Motion,
// which hosts most of the Claude-made videos with their categories.
// For an image file, the colours are measured from the pixels (the only thing we compute).
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const run = promisify(execFile);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const get = async (url, timeout = 15000) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctl.signal, redirect: "follow" }); return r.ok ? await r.text() : null; }
  catch { return null; } finally { clearTimeout(t); }
};
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const ldJson = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const og = (html, k) => html.match(new RegExp(`<meta[^>]+property="og:${k}"[^>]+content="([^"]+)"`))?.[1] ?? html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="og:${k}"`))?.[1];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

// Raivcoo embeds the media record (escaped JSON) in the page.
function raivcoo(html) {
  const field = (k) => { const m = html.match(new RegExp(`\\\\"${k}\\\\":(\\[[^\\]]*\\]|\\\\"[^\\\\]*\\\\")`)); if (!m) return null; try { return JSON.parse(m[1].replace(/\\"/g, '"')); } catch { return null; } };
  const ld = ldJson(html).find((x) => x["@type"] === "VideoObject") ?? {};
  const palette = field("color_palette") ?? [];
  return {
    source: "Raivcoo", title: ld.name ?? og(html, "title"), author: ld.author?.name ?? field("original_creator"),
    media: { video: ld.contentUrl, poster: ld.thumbnailUrl ?? og(html, "image") },
    site_tags: { keywords: (field("keywords") ?? []).map(title), software: field("software") ?? [], colors: [...new Set(palette.map((c) => c.name))] },
    palette: palette.map((c) => c.hex), original: field("original_source_url") ?? undefined,
  };
}

// Prompt Motion's own category ids and names (its filter row).
export const PM_CATEGORIES = { "product-ui": "Product UI", phone: "Phone", charts: "Charts", diagrams: "Diagrams", "kinetic-type": "Kinetic type", shapes: "Shapes", particles: "Particles", characters: "Characters", photos: "Photos", music: "Music", code: "Code" };
async function promptMotion(html, url) {
  const ld = ldJson(html).find((x) => x["@type"] === "VideoObject") ?? {};
  const prompt = html.match(/id="entry-prompt"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const slug = (ld.url ?? url).split("/").pop();
  const card = (await promptMotionLibrary()).items.find((i) => i.id === slug); // categories live on the list
  return {
    source: "Prompt Motion", title: ld.name, author: ld.creator?.name, page: ld.url ?? url,
    media: { video: ld.contentUrl, poster: [].concat(ld.thumbnailUrl ?? [])[0], preview: card?.preview },
    site_tags: { keywords: card?.categories ?? [] },
    prompt: prompt && decode(prompt.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).trim(),
    original: html.match(/href="(https:\/\/x\.com\/[^"]+\/status\/\d+)"/)?.[1],
  };
}

/**
 * Prompt Motion's whole collection, read live from its homepage (the page embeds every card:
 * title, author, categories, poster, a short preview clip and the full video). Nothing is copied;
 * the list is kept in memory for a few minutes so tab switches do not refetch it.
 */
let pmCache = null;
export async function promptMotionLibrary() {
  if (pmCache && Date.now() - pmCache.at < 10 * 60 * 1000) return pmCache.data;
  const html = await get("https://prompt-motion.com/", 25000);
  if (!html) return { items: [], error: "讀不到 Prompt Motion（網路或網站有問題）" };
  const i = html.indexOf('\\"cards\\":[');
  if (i < 0) return { items: [], error: "Prompt Motion 的頁面格式變了，讀不到作品清單" };
  // The array is escaped JSON inside a script string: take it bracket-balanced, then unescape.
  let depth = 0, j = html.indexOf("[", i);
  for (let k = j; k < html.length; k++) { const c = html[k]; if (c === "[") depth++; else if (c === "]" && --depth === 0) { j = [j, k]; break; } }
  let cards = [];
  try { cards = JSON.parse(JSON.parse(`"${html.slice(j[0], j[1] + 1)}"`)); } catch { return { items: [], error: "Prompt Motion 的作品清單格式變了" }; }
  const items = cards.map((c) => ({ id: c.slug, url: `https://prompt-motion.com/${c.slug}`, title: c.title, author: c.handle, date: c.date,
    categories: (c.contentTags ?? []).map((t) => PM_CATEGORIES[t] ?? t), kind: (c.tags ?? []).includes("skill") ? "skill" : "prompt",
    poster: c.poster, preview: c.preview, video: c.video, width: c.width, height: c.height }));
  pmCache = { at: Date.now(), data: { items, categories: Object.values(PM_CATEGORIES) } };
  return pmCache.data;
}

// X posts are behind a login; most Claude-made ones are on Prompt Motion, found through the author's handle.
async function fromPromptMotion(xUrl) {
  const handle = xUrl.match(/x\.com\/([^/]+)\/status/)?.[1]; if (!handle) return null;
  const home = await get("https://prompt-motion.com/"); if (!home) return null;
  const slug = handle.toLowerCase().replace(/_/g, "-");
  const pages = [...new Set([...home.matchAll(/href="\/([a-z0-9-]+-[0-9a-f]{6})"/g)].map((m) => m[1]).filter((p) => p.startsWith(slug + "-")))];
  for (const p of pages) {
    const html = await get(`https://prompt-motion.com/${p}`);
    if (html?.includes(xUrl.split("?")[0])) return await promptMotion(html, `https://prompt-motion.com/${p}`);
  }
  return null;
}

const IMAGE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i, VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** Media, author and the site's own tags for a reference URL; {} when the page says nothing usable. */
export async function sourceMeta(url) {
  if (process.env.VSO_LINK_CHECK === "off") return {};
  if (/^https?:\/\/(www\.)?x\.com\/|twitter\.com\//.test(url)) return (await fromPromptMotion(url)) ?? { source: "X" };
  // A link straight to an image or a video file is its own media (and is not downloaded as a page).
  const host = new URL(url).host.replace(/^www\./, "");
  if (IMAGE.test(url)) return { source: host, media: { image: url } };
  if (VIDEO.test(url)) return { source: host, media: { video: url } };
  const html = await get(url); if (!html) return {};
  if (/raivcoo\.com\/media\//.test(url)) return raivcoo(html);
  if (/prompt-motion\.com\//.test(url)) return await promptMotion(html, url);
  const video = og(html, "video:url") ?? og(html, "video"), image = og(html, "image");
  return { source: new URL(url).host.replace(/^www\./, ""), title: og(html, "title") && decode(og(html, "title")), media: video || image ? { video, poster: image } : undefined };
}

// ---- colours of an image (the only thing measured rather than read) ----
const NAMES = [["black", 0, 0, 0], ["white", 245, 245, 245], ["gray", 128, 128, 128], ["red", 210, 40, 40], ["orange", 240, 140, 40], ["yellow", 240, 210, 50], ["green", 60, 170, 80], ["blue", 50, 90, 210], ["purple", 130, 70, 190], ["pink", 235, 120, 170], ["brown", 130, 85, 50]];
export function colourName([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 28) return max < 60 ? "black" : max > 215 ? "white" : "gray"; // no real hue
  return NAMES.slice(3).map(([n, R, G, B]) => [n, (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2]).sort((a, b) => a[1] - b[1])[0][0];
}
/** The 5 most common colours of an image (16×16 sample, quantised), as hex plus a plain name. */
export async function imageColours(file) {
  const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
  const { stdout } = await run(ffmpeg, ["-v", "error", "-i", file, "-vf", "scale=16:16:flags=area", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer", maxBuffer: 1 << 20 });
  const count = new Map();
  for (let i = 0; i + 2 < stdout.length; i += 3) {
    const q = [stdout[i], stdout[i + 1], stdout[i + 2]].map((v) => Math.min(255, Math.round(v / 32) * 32));
    const k = q.join(","); count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => { const rgb = k.split(",").map(Number); return { hex: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""), name: colourName(rgb) }; });
}

/** A reference given as a file: an image is shown and its colours measured; a video (e.g. our own render) is played. */
export async function fileMeta(file) {
  if (VIDEO.test(file)) return { source: "影片", media: { video: file } };
  if (!/\.(png|jpe?g|webp|gif)$/i.test(file)) return {};
  try {
    const c = await imageColours(file);
    return { source: "圖片", media: { image: file }, site_tags: { colors: [...new Set(c.map((x) => x.name))] }, palette: c.map((x) => x.hex) };
  } catch { return { source: "圖片", media: { image: file } }; }
}
