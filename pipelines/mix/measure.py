# measure.py: per cue, how far the effect stands over the music bed (earshot's launch-kit measure, see below). The effect's level is computed from its own sample and gain at the mix's gains (so a slide that starts
# with a click isn't measured as the click); a hit and the layers under it are summed. Prints the cues outside their tier's
# range (-v: all).
#   python3 <tool>/pipelines/mix/measure.py <film dir> [--apply] [-v]   (after master.mjs --stems; --apply multiplies corrections into
#   build/trim.json; master.mjs --trim N runs the loop)
import json, wave, array, math, pathlib, statistics, sys
D = pathlib.Path([a for a in sys.argv[1:] if not a.startswith("-")][0]) / "build"
MIX = json.loads((D / "sections.json").read_text()).get("mix", {})
def load(p):
    w = wave.open(str(p)); a = array.array("h"); a.frombytes(w.readframes(w.getnframes())); ch = w.getnchannels()
    return ([sum(a[i:i + ch]) / ch for i in range(0, len(a), ch)] if ch > 1 else a), w.getframerate()
M, sr = load(D / "stems/music.wav"); n = int(sr * 0.01)
def pk(a, i0, i1): return max(10 * math.log10(max(1, sum(x * x for x in a[i:i + n]) / n)) for i in range(max(0, i0), max(i0 + n, i1), n // 2))
spec = json.loads((D / "score.json").read_text()); GN = json.loads((D / "stems/gain.json").read_text())
# a cue's level in the mix: its own sample's 10 ms RMS peak × its gain × the mix's output gain × the loudness gain (the
# effects bus's 30 Hz cut, 11 kHz softening and quiet room barely move a peak; the master tanh is linear at these levels)
OFS = 20 * math.log10(spec.get("sfx_gain", 1) * GN["master_gain"]) + GN["loudness_db"]
_c = {}
def own(c):
    f = c["file"]
    if f not in _c: _c[f] = load((D / f).resolve())[0]
    a = _c[f]; i0 = int(c.get("from", 0) * sr); i1 = i0 + int(c["dur"] * sr) if "dur" in c else len(a)
    # edit.py's equal-power pan, folded to mono like the stems: (cos + sin) / 2 of the pan angle (−3 dB in the middle)
    pan = c.get("pan", (c.get("pan_from", 0) + c.get("pan_to", c.get("pan_from", 0))) / 2)
    law = 20 * math.log10((math.cos((pan + 1) * math.pi / 4) + math.sin((pan + 1) * math.pi / 4)) / 2)
    # sounds that lose level on the way (short clicks through a bus's softening and room, the AAC encode), measured in a finished
    # mix: sections.json mix.heard {"<part of the file name>": dB}
    heard = next((v for s, v in MIX.get("heard", {}).items() if s in f), 0.0)
    # where the sample's loudest 10 ms sits after the cue: a kit take starts before its peak (a whoosh peaks 0.07-0.17 s in);
    # a cue aligned on its peak by edit.py already has it on t
    seg = a[i0:i1]; e = [sum(x * x for x in seg[j:j + n]) for j in range(0, max(1, len(seg) - n), n // 2)]
    c["pk_s"] = 0.0 if c.get("align") == "peak" else e.index(max(e)) * (n // 2) / sr
    return pk(a[i0:i1], 0, i1 - i0) + 20 * math.log10(max(1e-9, c["gain"])) + OFS + law + heard
cues = spec["sfx"]
for c in cues: c["p"] = 10 ** (own(c) / 10)
# Each cue names how far it should stand over the music (its "bed", dB; cues.mjs BEDDB, earshot's launch-film medians) and is read
# the way earshot reads it: the loudest 50 ms of the effect over the music's median 50 ms level in the second before the cue.
# The effect is read in the finished mix with the music taken out: the drum on the click's beat otherwise reads as the click
# (it silenced three clicks once), and the limiter's share shows as "loss". The limiter delays the mix (lookahead): align first.
TOL = 1.5
X = load(D / "stems/mix.wav")[0]
def lag_of(i0, n_):
    best = (0, float("inf"))
    for lag in range(-200, 201, 2):
        e = sum((X[i0 + k] - M[i0 + k + lag]) ** 2 for k in range(0, n_, 4))
        if e < best[1]: best = (lag, e)
    return best[0]
quiet = max(range(int(sr), len(M) - 2 * int(sr), int(sr)), key=lambda i: min(abs(c["t"] * sr - i) for c in cues))
LAG = lag_of(quiet, int(0.5 * sr))
if "-v" in sys.argv: print(f"music stem aligned {LAG} samples at {quiet / sr:.1f} s")
R = [X[k] - M[k + LAG] if 0 <= k + LAG < len(M) else X[k] for k in range(len(X))]
w50 = int(0.05 * sr)
def l50(a, i): s_ = a[max(0, i):max(0, i) + w50]; return 10 * math.log10(max(1, sum(x * x for x in s_) / max(1, len(s_))))
res = {}
for c in cues:
    key = (c["of"] if "#" in c["of"] else c["of"] + "#0") if c.get("of") else c["key"]
    r = res.setdefault(key, {"t": c["t"], "pk": c["pk_s"], "tier": c["tier"], "bed_db": c.get("bed", 6), "own": 0.0})
    r["own"] += c["p"]
    if not c.get("of"): r["t"], r["pk"], r["tier"], r["bed_db"], r["file"] = c["t"], c["pk_s"], c["tier"], c.get("bed", 6), c["file"]
for key, r in res.items():
    t = r["t"]; tp = t + r["pk"]   # the effect is read around its own peak; the bed before the cue
    fx = max(l50(R, i) for i in range(int((tp - 0.05) * sr), int((tp + 0.15) * sr), w50 // 5))
    # a hero opens a section, and the second before it is a stop-down or a quiet break: read it against the music it opens
    after = r["tier"] == "hero"
    bed = statistics.median(l50(M, i) for i in (range(int(t * sr), int((t + 1) * sr), w50) if after else range(int((t - 1) * sr), int(t * sr), w50)))
    r["d"] = fx - bed
    r["loss"] = 10 * math.log10(r["own"]) - max(pk(R, int((tp - 0.03) * sr), int((tp + 0.12) * sr)), 1)   # what the limiter took off
bad = 0
for key, r in sorted(res.items(), key=lambda kv: kv[1]["t"]):
    lo, hi = r["bed_db"] - TOL, r["bed_db"] + TOL; ok = lo <= r["d"] <= hi; bad += not ok
    if "-v" in sys.argv or not ok: print(f"{r['t']:7.2f} {key:12s} {r['d']:+6.1f} dB over the bed  target {r['bed_db']:+.1f}{'' if ok else '  ✗'}" + (f"  (limiter −{r['loss']:.1f})" if r["loss"] > 3 else ""))
print(f"{len(res) - bad}/{len(res)} cues within ±{TOL} dB of their level over the bed")
if "--apply" in sys.argv:
    tp = D / "trim.json"; T = json.loads(tp.read_text()) if tp.exists() else {}
    for key, r in res.items():
        if r["loss"] > 4.5:   # flattened hard by the limiter: back it off to ~3 dB of limiting
            T[key] = round(T.get(key, 1) * 10 ** (-(r["loss"] - 3) / 20 * 0.7), 3); continue
        step = r["bed_db"] - r["d"]
        if abs(step) <= TOL: continue
        if step > 0 and r["loss"] > 3: continue   # the limiter already takes it: pushing would duck the whole mix on the hit
        T[key] = round(min(6.0, T.get(key, 1) * min(2.5, max(0.3, 10 ** (step * 0.8 / 20)))), 3)
    tp.write_text(json.dumps(T, indent=1, sort_keys=True) + "\n")
