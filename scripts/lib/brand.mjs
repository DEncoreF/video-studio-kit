// Brand rules come from one place: brand-kits/<id>/brand.json. Every script that needs a
// brand fact (product names, forbidden terms, other brands, logo rules) reads it through here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KITS } from "./paths.mjs";

export const KITS_DIR = KITS; // see paths.mjs for how the kits folder is chosen

export const kitIds = () => readdirSync(KITS_DIR).filter((d) => !d.startsWith("_") && existsSync(join(KITS_DIR, d, "brand.json")));
export function loadKit(id) {
  const f = join(KITS_DIR, id, "brand.json");
  if (!existsSync(f)) throw new Error(`brand kit "${id}" not found (${f})`);
  return JSON.parse(readFileSync(f, "utf8"));
}

// products: ["Name", …] or [{ "name": "Name", "aliases": ["…"] }, …]
export const products = (kit) => (kit.products ?? []).map((p) => (typeof p === "string" ? { name: p, aliases: [] } : { aliases: [], ...p }));
const norm = (s) => String(s).toLowerCase().replace(/[\s·・_-]+/g, "");
/** Official product name for a user-typed name or alias; null when the kit does not know it. */
export function canonicalProduct(kit, name) {
  if (!name) return null;
  const n = norm(name);
  for (const k of [kit, ...allowedKits(kit)]) for (const p of products(k)) if ([p.name, ...p.aliases].some((a) => norm(a) === n)) return p.name;
  return null;
}

/** Kits this kit may show alongside itself (brand.json allowed_brands, matched by kit id or name). */
export const allowedKits = (kit) => (kit.allowed_brands ?? []).map((n) => kitIds().find((id) => id === n || loadKit(id).name.toLowerCase() === String(n).toLowerCase())).filter(Boolean).map(loadKit);

/** Terms that must never appear on screen or in narration for this kit (hard constraint). */
export const forbiddenTerms = (kit) => kit.forbidden ?? [];

/** Names of every *other* kit's brand and products, minus the ones this kit allows. */
export function otherBrandTerms(kit) {
  const allowed = new Set((kit.allowed_brands ?? []).map(norm));
  const out = [];
  for (const id of kitIds()) {
    if (id === kit.id) continue;
    const other = loadKit(id);
    if (allowed.has(norm(other.name)) || allowed.has(norm(id))) continue;
    for (const t of [other.name, ...products(other).flatMap((p) => [p.name, ...p.aliases])]) if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export const logoRules = (kit) => ({ motion: "static", ...(kit.logo ?? {}) });
