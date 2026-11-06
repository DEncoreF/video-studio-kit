#!/usr/bin/env node
// Runs the project-local HyperFrames CLI with project-local ffmpeg/ffprobe,
// so nothing needs a system-wide install (brew) and cleanup is just node_modules.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const env = {
  HYPERFRAMES_NO_TELEMETRY: "1", // company work: no anonymous usage telemetry by default
  ...process.env,
  HYPERFRAMES_FFMPEG_PATH: require("ffmpeg-static"),
  HYPERFRAMES_FFPROBE_PATH: require("@ffprobe-installer/ffprobe").path,
};
const bin = new URL("../node_modules/hyperframes/bin/hyperframes.mjs", import.meta.url).pathname;
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: "inherit", env });
process.exit(r.status ?? 1);
