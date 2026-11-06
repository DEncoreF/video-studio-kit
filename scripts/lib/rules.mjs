// The craft numbers live in library/rules/<name>.json, one home each: the measuring scripts read `values`, and the skills'
// tables are generated from `rows` (scripts/rules.mjs), so a number changed in one place is changed everywhere.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOOL = decodeURIComponent(new URL("../..", import.meta.url).pathname);
export const rulesFile = (name) => join(TOOL, "library/rules", `${name}.json`);
export const loadRules = (name) => JSON.parse(readFileSync(rulesFile(name), "utf8"));

/** library/rules/motion.json `values` (seconds unless the key says frames). */
export const MOTION = loadRules("motion").values;

const at = (values, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), values);
const show = (v) => (Array.isArray(v) ? v.map((x) => `${Math.round(x * 100)}%`).join("–") : String(v));
/** A row's text with every {a.b} replaced by its value; an unknown path throws so a typo cannot reach a skill. */
export function fill(text, values) {
  return text.replace(/\{([\w.]+)\}/g, (_, p) => { const v = at(values, p); if (v === undefined) throw new Error(`rules: {${p}} is not in values`); return show(v); });
}

const MARK = { fail: "⛔", warn: "⚠", guide: "" };
/** The markdown table for a rules file (what goes between the markers in a SKILL.md). */
export function table(name) {
  const { values, rows } = loadRules(name);
  const cell = (s) => String(s).replace(/\|/g, "\\|");
  return ["| 項目 | 數字 | 誰量 |", "|---|---|---|",
    ...rows.map((r) => `| ${[MARK[r.gate] ?? "", r.item].filter(Boolean).join(" ")} | ${cell(fill(r.text, values))} | ${cell(r.by)} |`)].join("\n");
}

// How long a read needs from its t0 (library/rules/motion.json read.*), shared by script-lint and review-pack so the plan and the
// render are judged by the same numbers. CJK counts characters (+ Latin words), an English-only line counts words.
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const stripTags = (s = "") => String(s).replace(/<[^>]+>/g, "");
export const latinLine = (s = "") => !new RegExp(CJK_RE.source).test(stripTags(s)) && /[A-Za-z]/.test(stripTags(s));
export const latinWords = (s = "") => (stripTags(s).replace(CJK_RE, " ").match(/[A-Za-z0-9][A-Za-z0-9'’%.,:$€£\-]*/g) ?? []).length;
const cjkChars = (s = "") => [...s.replace(/[\s，。、；：「」！？,.;:!?（）()]/g, "")].length;
export const readUnits = (s = "") => (latinLine(s) ? latinWords(s) : cjkChars(stripTags(s).replace(/[A-Za-z0-9][A-Za-z0-9'’%.,:$€£\-]*/g, "")) + latinWords(s));
export function textNeed(s, big) {
  const RD = MOTION.read;
  return latinLine(s) ? (big ? Math.max(RD.enBigMin, RD.enBigBase + RD.enBigPerWord * latinWords(s)) : Math.max(RD.enSmallMin, RD.enSmallBase + RD.enSmallPerWord * latinWords(s)))
    : Math.max(RD.textMin, readUnits(s) / (big ? RD.textRateBig ?? RD.textRate : RD.textRate) + (big ? RD.textBig : RD.textSmall));
}
/** Seconds after t0 that a read needs: a text its reading time, a picture visualBig/Small, a move until it settles plus settleBig/Small. */
export function readNeed(r) {
  const RD = MOTION.read, big = (r.size ?? "big") !== "small", k = { 字: "text", 畫面: "visual", 動作: "motion" }[r.kind] ?? r.kind ?? "visual";
  if (k === "text") return textNeed(r.text ?? r.what ?? "", big);
  if (k === "motion") return ((r.act ?? r.t0 + RD.actDefault) - r.t0) + (big ? RD.settleBig : RD.settleSmall);
  return big ? RD.visualBig : RD.visualSmall;
}
