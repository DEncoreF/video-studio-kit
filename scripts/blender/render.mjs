// Render a film's Blender scene script, draft or final, resumable, and encode the frames for HyperFrames.
//   node scripts/blender/render.mjs <scene.py> --out <framesDir> [--draft | --final] [--frames 1-300] [--fps 30]
//        [--encode <file.mp4>] [-- <arguments for the scene script>]
// The scene script reads BLENDER_QUALITY (draft | final) and calls lookdev.render(scene, quality). Draft ≈ seconds a frame
// (EEVEE, half size): check the camera and the timing first. Final = Cycles on the GPU only — for reference frames and single
// hero stills; animation is baked (scripts/blender/bake.py) and drawn by three.js (library/three/baked-scene.js), ~200× faster.
// Frames already on disk are skipped, so a stopped render continues where it left off. Run it in the background for long renders.
import { createRequire } from "node:module";
import { spawnSync, execFileSync } from "node:child_process"; import { existsSync, mkdirSync, readdirSync } from "node:fs"; import { resolve, join } from "node:path";
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2), sep = argv.indexOf("--"), own = sep < 0 ? argv : argv.slice(0, sep), pass = sep < 0 ? [] : argv.slice(sep + 1);
const opt = (k, d) => { const i = own.indexOf(k); return i >= 0 ? own[i + 1] : d; };
const scene = resolve(own[0] ?? ""), out = resolve(opt("--out", "frames")), quality = own.includes("--final") ? "final" : "draft";
const frames = opt("--frames", "1-300"), fps = opt("--fps", "30"), encode = opt("--encode", null);
if (!existsSync(scene)) { console.error("usage: node scripts/blender/render.mjs <scene.py> --out <dir> [--draft|--final] [--frames a-b] [--encode out.mp4] [-- scene args]"); process.exit(1); }
const bin = ["/Applications/Blender.app/Contents/MacOS/Blender", "blender"].find((b) => b.includes("/") ? existsSync(b) : spawnSync("which", [b]).status === 0);
if (!bin) { console.error("Blender not found: install it (brew install --cask blender)"); process.exit(1); }
mkdirSync(out, { recursive: true });
const tool = resolve(new URL(".", import.meta.url).pathname);
const r = spawnSync(bin, ["-b", "-P", scene, "--", "--anim", "--frames", frames, "--out", join(out, "f"), ...pass],
  { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, BLENDER_QUALITY: quality, BLENDER_LOOKDEV: tool } });
if (r.status !== 0) { console.error("blender exited with", r.status); process.exit(r.status ?? 1); }
const n = readdirSync(out).filter((f) => /^f\d{4}\.png$/.test(f)).length; console.log(`${n} frames in ${out} (${quality})`);
if (encode) {
  execFileSync(require("ffmpeg-static"), ["-nostdin", "-v", "error", "-y", "-framerate", fps, "-i", join(out, "f%04d.png"), "-c:v", "libx264", "-crf", quality === "final" ? "16" : "22", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", resolve(encode)], { stdio: "inherit" });
  console.log("encoded", encode);
}
