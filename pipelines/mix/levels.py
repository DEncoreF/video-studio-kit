# levels.py: each effect file's loudest 50 ms (RMS dB, channels averaged) -> <film>/build/levels.json, so the cue sheet can set
# a layer's gain relative to the sound it sits under. master.mjs runs it first.
#   python3 <tool>/pipelines/mix/levels.py <film dir>
import json, wave, array, math, pathlib, sys
D = pathlib.Path(sys.argv[1]) / "build"; A = D.parent / "assets/sfx"; out = {}
for f in sorted(A.rglob("*.wav")):
    w = wave.open(str(f)); ch = w.getnchannels(); a = array.array("h"); a.frombytes(w.readframes(w.getnframes())); sr = w.getframerate()
    x = [sum(a[i:i + ch]) / ch / 32768 for i in range(0, len(a), ch)]; n = int(0.05 * sr)
    e = max((sum(v * v for v in x[i:i + n]) / n for i in range(0, max(1, len(x) - n), n // 5)), default=1e-12)
    out["../assets/sfx/" + str(f.relative_to(A))] = round(10 * math.log10(max(e, 1e-12)), 2)
(D / "levels.json").write_text(json.dumps(out, indent=1) + "\n")
