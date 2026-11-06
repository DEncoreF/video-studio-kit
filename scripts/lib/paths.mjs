// Where things live. Tool files (scripts, pipelines, built-in styles, gallery) sit next to this
// module and are replaced on update; data does not, and resolves on its own:
//
//   PROFILE    the user's personal layer: taste, references, inbox, personal assets and styles
//              VSO_PROFILE → ~/.video-studio
//   WORKSPACE  where videos/ live
//              VSO_WORKSPACE → profile config "workspace" → the current folder if it has videos/ → TOOL
//   KITS       brand kits (company data)
//              VSO_BRAND_KITS → profile config "brand_kits" → WORKSPACE/brand-kits → TOOL/brand-kits
//   CACHE      rebuildable binaries (compiled OCR helper)
//              VSO_CACHE → TOOL/node_modules/.cache/vso
//
// Styles are looked up personal first, then built-in, so a user can add or override a recipe
// without touching the tool.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

const env = process.env;
const home = (p) => (p?.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const firstExisting = (...dirs) => dirs.find((d) => d && existsSync(d));

export const TOOL = decodeURIComponent(new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
export const PROFILE = resolve(home(env.VSO_PROFILE) || join(homedir(), ".video-studio"));
export const CONFIG_FILE = join(PROFILE, "config.json");
export const config = (() => { try { return JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; } })();
const fromConfig = (k) => (config[k] ? resolve(PROFILE, home(config[k])) : null);

export const WORKSPACE = resolve(home(env.VSO_WORKSPACE) || fromConfig("workspace") || (existsSync(join(process.cwd(), "videos")) ? process.cwd() : TOOL));
export const KITS = resolve(home(env.VSO_BRAND_KITS) || fromConfig("brand_kits") || firstExisting(join(WORKSPACE, "brand-kits"), join(TOOL, "brand-kits")) || join(TOOL, "brand-kits"));
export const CACHE = resolve(home(env.VSO_CACHE) || join(TOOL, "node_modules/.cache/vso"));
// Child processes (preview → brand-kit, QA → hf) may run from another folder: hand them the same answers.
env.VSO_PROFILE = PROFILE; env.VSO_WORKSPACE = WORKSPACE; env.VSO_BRAND_KITS = KITS; env.VSO_CACHE = CACHE;

// Projects: a folder in videos/ with a PROJECT.md holds one campaign — films/<film>, tests/_<test>,
// sources/, research/ and a shared assets-library/. A film's id is its path under videos/
// ("demo/films/focus"); a film outside a project keeps its bare folder name.
export const VIDEOS = join(WORKSPACE, "videos");
export const filmId = (dir) => { const r = relative(VIDEOS, resolve(dir)); return r && !r.startsWith("..") ? r.split(sep).join("/") : basename(resolve(dir)); };
export const projectOf = (dir) => { const top = filmId(dir).split("/")[0]; return top && existsSync(join(VIDEOS, top, "PROJECT.md")) ? top : ""; };
/** The film's own assets-library, else its project's. */
export const libraryFor = (dir) => { const own = join(resolve(dir), "assets-library"), p = projectOf(dir); return existsSync(own) || !p ? own : join(VIDEOS, p, "assets-library"); };

// Personal layer contents
export const TASTE = join(PROFILE, "taste.md");
export const TASTE_LOG = join(PROFILE, "taste-log.jsonl");
export const REFS_LOG = join(PROFILE, "references-log.jsonl");
export const REF_SITES = join(PROFILE, "reference-sites.md"); // hand-curated list of reference sites by category
export const PERSONAL_EFFECTS = join(PROFILE, "text-effects.json"); // the user's own named text effects, same format as library/text-effects.json
export const PERSONAL_DEMOS = join(PROFILE, "effect-demos.js"); // looping previews for effects with no registry component (window.EFFECT_DEMOS)
export const INBOX = join(PROFILE, "inbox");
export const PERSONAL_ASSETS = join(PROFILE, "assets");
export const GALLERY_SELECTION = join(PROFILE, "gallery-selection.json");
export const SFX = join(PROFILE, "sfx"); // the shared sound-effect library: CC0 / Pixabay only, sources in its CREDITS.md
export const EXEMPLARS = join(PROFILE, "exemplars"); // the user's approved / rejected moments as clips (scripts/exemplar.mjs)

// Styles: personal layer first, then the tool's built-in library.
export const STYLE_ROOTS = [join(PROFILE, "styles"), join(TOOL, "styles")];
export const recipePath = (id) => firstExisting(...STYLE_ROOTS.map((r) => join(r, "recipes", `${id}.md`)));
export const examplePath = (id) => firstExisting(...STYLE_ROOTS.map((r) => join(r, "examples", id)));
export const recipeIds = () => [...new Set(STYLE_ROOTS.flatMap((r) => (existsSync(join(r, "recipes")) ? readdirSync(join(r, "recipes")) : []))
  .filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.slice(0, -3)))].sort();
/** Built-in catalog with personal entries merged in by id (personal wins), families included. */
export function styleCatalog() {
  const read = (r) => { try { return JSON.parse(readFileSync(join(r, "catalog.json"), "utf8")); } catch { return null; } };
  const [mine, base] = STYLE_ROOTS.map(read);
  const cat = base ?? { groups: {}, styles: [] };
  if (!mine) return cat;
  const ids = new Set((mine.styles ?? []).map((s) => s.id));
  // Families (呈現效果): a personal entry may add a family, or extend a built-in one; its textEffects are appended.
  const families = { ...(cat.families ?? {}) };
  for (const [id, f] of Object.entries(mine.families ?? {})) {
    const base = families[id] ?? {};
    families[id] = { ...base, ...f, textEffects: [...new Set([...(base.textEffects ?? []), ...(f.textEffects ?? [])])] };
  }
  return { ...cat, families, groups: { ...cat.groups, ...(mine.groups ?? {}) }, styles: [...cat.styles.filter((s) => !ids.has(s.id)), ...(mine.styles ?? []).map((s) => ({ ...s, personal: true }))] };
}

/** Palettes (色票), chosen separately from the presentation effect: built-in plus personal, personal wins by id. */
export function paletteList() {
  const read = (r) => { try { return JSON.parse(readFileSync(join(r, "palettes.json"), "utf8")).palettes ?? []; } catch { return []; } };
  const [mine, base] = STYLE_ROOTS.map(read), ids = new Set(mine.map((p) => p.id));
  return [...base.filter((p) => !ids.has(p.id)), ...mine.map((p) => ({ ...p, personal: true }))];
}

export const paths = { VIDEOS, TOOL, PROFILE, CONFIG_FILE, WORKSPACE, KITS, CACHE, TASTE, TASTE_LOG, REFS_LOG, INBOX, PERSONAL_ASSETS };
