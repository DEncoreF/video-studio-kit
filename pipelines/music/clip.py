"""Fast iteration on one segment of a film's score (user, 2026-10-21: change and show only the part being worked on).

Mixes the spec only up to t1 with edit.py and lays the result over an already rendered clip of t0..t1, so a
sound-only change needs no render at all (seconds instead of minutes). Loudness is normalised over 0..t1, so it can
sit a little louder than in the full mix.

  python3 pipelines/music/clip.py <spec.json> <source.wav> <t0> <t1> <video clip covering t0..t1> <out.mp4>
"""
import json, pathlib, subprocess, sys, tempfile

spec_path, src, t0, t1, clip, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], sys.argv[6]
root = pathlib.Path(__file__).resolve().parents[2]
spec = json.loads(pathlib.Path(spec_path).read_text())
spec["duration"] = t1
spec["sfx"] = [x for x in spec["sfx"] if x["t"] < t1]
spec["segments"] = [s for s in spec["segments"] if s["at"] < t1]
tmp = pathlib.Path(tempfile.mkdtemp())
(tmp / "spec.json").write_text(json.dumps(spec))
subprocess.run([sys.executable, str(root / "pipelines/music/edit.py"), str(tmp / "spec.json"), src, str(tmp / "mix.wav")], check=True)
ff = subprocess.run(["node", "-e", 'console.log(require("ffmpeg-static"))'], capture_output=True, text=True, cwd=root).stdout.strip()
subprocess.run([ff, "-v", "error", "-y", "-i", clip, "-ss", str(t0), "-i", str(tmp / "mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k", "-shortest", out], check=True)
print("wrote", out)
