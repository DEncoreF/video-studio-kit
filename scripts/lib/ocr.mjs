// Text in images (screenshots, photos, rendered frames) via macOS Vision. OCR is an aid, not
// proof: callers treat a low-confidence or missing read as "needs review", never as a pass.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { CACHE, TOOL } from "./paths.mjs";

const SRC = join(TOOL, "scripts/lib/ocr.swift");
const BIN = join(CACHE, "ocr");

function binary() {
  if (process.platform !== "darwin") return null;
  if (existsSync(BIN) && statSync(BIN).mtimeMs >= statSync(SRC).mtimeMs) return BIN;
  mkdirSync(join(BIN, ".."), { recursive: true });
  const r = spawnSync("swiftc", ["-O", "-o", BIN, SRC], { encoding: "utf8" });
  return r.status === 0 ? BIN : null;
}

/** @returns {{available: boolean, results: Record<string, {lines: {text: string, conf: number}[], error?: string}>}} */
export function ocr(files) {
  // Test hook: VSO_OCR_FIXTURE=unavailable, or a JSON file mapping basename → lines.
  const fx = process.env.VSO_OCR_FIXTURE;
  if (fx === "unavailable") return { available: false, results: {} };
  if (fx) { const map = JSON.parse(readFileSync(fx, "utf8")); return { available: true, results: Object.fromEntries(files.map((f) => [f, { file: f, lines: map[basename(f)] ?? [] }])) }; }
  const bin = binary();
  if (!bin || !files.length) return { available: !!bin, results: {} };
  const results = {};
  for (let i = 0; i < files.length; i += 40) {
    const r = spawnSync(bin, files.slice(i, i + 40), { encoding: "utf8", maxBuffer: 64 << 20 });
    for (const line of (r.stdout ?? "").split("\n").filter(Boolean)) { const o = JSON.parse(line); results[o.file] = o; }
  }
  return { available: true, results };
}

/** Find terms in OCR lines. Each hit carries the line, its confidence and whether it is sure. */
export function findTerms(lines, terms, sure = 0.5) {
  const hits = [];
  const squash = (s) => s.replace(/\s+/g, "").toLowerCase();
  for (const l of lines) for (const t of terms) if (squash(l.text).includes(squash(t))) hits.push({ term: t, text: l.text, conf: l.conf, sure: l.conf >= sure });
  return hits;
}
