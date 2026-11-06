#!/usr/bin/env node
// The draft gate as a Claude Code hook (declared in the frontmatter of video-draft-review and video-motion-craft, so it is
// registered when either skill is invoked and stays for the rest of the session; no settings file is involved).
//   node draft-gate.mjs pre    PreToolUse on SendUserFile: a video under videos/ goes to the user only when a PASS.json in its
//                              film or test folder still matches it (review-pack.mjs --check, --attach); otherwise exit 2.
//                              A candidate still being chosen passes: under direction/ or candidates/, a compare.*, an audition
//                              (isCandidate); a preview of a chosen version needs review-pack.mjs --link (isPreview); nothing under
//                              renders/ is either. Sound is gated apart from the
//                              picture: a video with an audio track in a project that mixes its own sound needs a SOUND-PASS.json
//                              holding its decoded audio (scripts/sound-gate.mjs), previews included; auditions pass
//   node draft-gate.mjs stop   Stop: the last message points the user at a recent render under videos/ that has no valid
//                              PASS.json → { decision: "block" } once (never while stop_hook_active, so it cannot loop)
// The skills call it as node "$(cd <skill dir> && pwd -P)/../../../scripts/hooks/draft-gate.mjs": the skill folders are symlinks
// into the toolkit, and node would resolve "../" lexically from the link. Reads the hook's JSON on stdin. What it cannot see: a path pasted in the chat for a render older than 12 hours, a Studio
// preview URL, a file outside videos/. Those are covered only by the skill's own rule (video-draft-review SKILL.md).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { linked, verify } from "../review-pack.mjs";
import { verifySound } from "../sound-gate.mjs";

const VIDEO = /\.(mp4|mov|m4v|webm|gif)$/i, RECENT_H = 12;
const TOOL = resolve(new URL("../..", import.meta.url).pathname);
const say = (s) => process.stderr.write(s + "\n");

/** The film or test folder a file belongs to: videos/…/films/<片>, videos/…/tests/_<名>, or a bare videos/<片>. */
export function unitOf(file) {
  const parts = resolve(file).split(sep), v = parts.lastIndexOf("videos");
  if (v < 0) return null;
  for (let i = parts.length - 2; i > v; i--) {
    if (parts[i - 1] === "films" || (parts[i - 1] === "tests" && parts[i].startsWith("_"))) return { dir: parts.slice(0, i + 1).join(sep), test: parts[i - 1] === "tests" };
  }
  const bare = parts.slice(0, v + 2).join(sep);   // videos/<片> without projects (USAGE.md「專案」)
  return parts.length > v + 2 && existsSync(join(bare, "index.html")) ? { dir: bare, test: basename(bare).startsWith("_") } : null;
}

/** Every PASS.json under the unit (review/, or a --out folder), a few levels deep. */
function passes(dir, depth = 4) {
  const out = [];
  const walk = (d, n) => { let names = []; try { names = readdirSync(d); } catch { return; }
    for (const name of names) {
      if (name === "node_modules" || name === ".git" || name.endsWith(".frames")) continue;
      const p = join(d, name);
      if (name === "PASS.json") out.push(d);
      else if (n > 0) { try { if (statSync(p).isDirectory()) walk(p, n - 1); } catch { /* gone */ } }
    } };
  walk(dir, depth);
  return out;
}

const under = (file) => { const p = resolve(file).split(sep), v = p.lastIndexOf("videos"); return v < 0 ? null : p.slice(v + 1); };

/** Still being chosen, so it goes out without a review: under a direction/ or a candidates/ folder, a campaign's compare.*, a sound
 *  audition. Never under renders/ (a full draft there needs its PASS whatever it is called). The user approved it 2026-10-29. */
export function isCandidate(file) {
  const p = under(file);
  return !!p && !p.includes("renders") && (p.includes("direction") || p.includes("candidates") || /^compare|audition/i.test(p.at(-1)));
}

/** A preview of a chosen version: under previews/, or named …preview… (2026-11-05: most of one film went out this way, so the
 *  gate never saw it; the user approved gating these). It needs --link to the passed reviews it was made from. */
export function isPreview(file) {
  const p = under(file);
  return !!p && !p.includes("renders") && (p.includes("previews") || /preview/i.test(p.at(-1)));
}

/** → { gated: false } | { gated: true, ok, why } for one file about to reach the user. */
export function judge(file) {
  const f = resolve(file);
  if (!VIDEO.test(f) || !existsSync(f) || !under(f)) return { gated: false };
  if (isCandidate(f)) return { gated: false, preview: true };
  const unit = unitOf(f), mine = (r) => r.ok && r.pass?.mode !== "candidate";
  if (isPreview(f)) {
    const l = linked(f);
    if (l.ok) return { gated: true, ok: true, why: l.why };
    for (const d of unit ? passes(unit.dir) : []) { const r = verify(d, f); if (mine(r)) return { gated: true, ok: true, why: r.why }; }
    return { gated: true, ok: false, why: [`${basename(f)} 是選定版本的預覽，還沒過動態檢查（${l.why}）。`,
      `  選定的版本：在它的試片跑 review-pack.mjs、填 MOTION.md、--check，再跑 node ${TOOL}/scripts/review-pack.mjs --link ${relative(process.cwd(), f)} <試片>/review。`,
      "  還在挑的候選：放到 previews/<名稱>/candidates/ 或 direction/，並說清楚只是拿來挑。"].join("\n") };
  }
  if (!unit) return { gated: false };
  const needFull = !unit.test;   // a film's draft needs the full review
  const tried = [];
  for (const d of passes(unit.dir)) {
    const r = verify(d, f);
    if (mine(r) && (!needFull || r.pass?.mode === "full")) return { gated: true, ok: true, why: r.why };
    tried.push(!r.ok ? `${relative(unit.dir, d)}：${r.why}` : r.pass?.mode === "candidate" ? `${relative(unit.dir, d)}：只是候選（--candidate），單獨給之前要填 MOTION.md 再 --check` : `${relative(unit.dir, d)}：只有試片的量測（正片草稿要完整審片）`);
  }
  const cmd = `node ${TOOL}/scripts/review-pack.mjs ${relative(process.cwd(), unit.dir) || "."} ${relative(process.cwd(), f)}`;
  return { gated: true, ok: false, why: [`${basename(f)} 還沒過審片（/video-draft-review）。`, ...tried.map((t) => `  - ${t}`),
    `先跑 ${cmd}，${unit.test ? "填 MOTION.md，" : "看完審片包、填 CHECKLIST.md 與 MOTION.md，"}再跑 review-pack.mjs --check（量測的 FAIL 要修掉，或由使用者豁免）；重新編碼的小檔用 --attach。`].join("\n") };
}

/** Every reason this file may not reach the user yet (picture, then sound); empty when it may. */
export function blockers(file) {
  const out = [], r = judge(file);
  if (r.gated && !r.ok) out.push(r.why);
  const s = verifySound(file);
  if (s.gated && !s.ok) out.push(s.why);
  return out;
}

const strings = (x) => (typeof x === "string" ? [x] : Array.isArray(x) ? x.flatMap(strings) : x && typeof x === "object" ? Object.values(x).flatMap(strings) : []);

function main() {
  const mode = process.argv[2] ?? "pre";
  let input = {}; try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
  const cwd = input.cwd ?? process.cwd();
  try { process.chdir(cwd); } catch { /* keep ours */ }
  if (mode === "pre") {
    const files = strings(input.tool_input ?? {}).filter((s) => VIDEO.test(s)).map((s) => resolve(cwd, s));
    const blocked = [];
    for (const f of files) {
      try { blocked.push(...blockers(f)); }
      catch (e) { if (unitOf(f)) blocked.push(`${basename(f)}：審片關卡讀不到結果（${e.message}）。先跑 review-pack.mjs --check。`); }
    }
    if (blocked.length) { say(blocked.join("\n")); process.exit(2); }
    process.exit(0);
  }
  if (mode === "stop") {
    if (input.stop_hook_active) process.exit(0);
    const msg = String(input.last_assistant_message ?? ""), seen = new Set(), blocked = [];
    for (const m of msg.matchAll(/(?:[~\w.\/-]*\/)?videos\/[^\s`'"<>()（）「」，。、]+?\.(?:mp4|mov|m4v|webm|gif)/gi)) {
      const f = resolve(cwd, m[0].replace(/^~(?=\/)/, process.env.HOME ?? "~"));
      if (seen.has(f) || !existsSync(f)) continue; seen.add(f);
      if (Date.now() - statSync(f).mtimeMs > RECENT_H * 3600e3) continue;   // an old draft being discussed, not a new one being shown
      try { blocked.push(...blockers(f)); } catch { /* the pre hook and the skill cover it */ }
    }
    if (blocked.length) process.stdout.write(JSON.stringify({ decision: "block", reason: `這則回覆把還沒過審片的草稿給使用者看：\n${blocked.join("\n")}\n過了再給，回報時貼 PASS 那一行；不給的話，改寫回覆、不要指向這個檔。` }));
    process.exit(0);
  }
  process.exit(0);
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
