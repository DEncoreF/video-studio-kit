# resynth.py: make a sound effect from real recordings instead of synthesizing it. The detail of every grain (the
# attack, the noise, the room) is a CC0 recording; only the arrangement is code: where grains fall, how dense, which
# band a filter lets through. Pure synthesis (earshot's forge, edit.py's voices) reads as code for clouds and sweeps;
# this keeps their shape and gives them a real surface (user 2026-11-03: improve the code-made sounds).
#
#   ~/Projects/earshot/.venv/bin/python pipelines/sfx/resynth.py <recipe> --src a.wav [b.wav ...] --out dir/name
#       [--takes 3] [--dur 1.2] [--seed 0] [--check]
#
# recipes (each take is a new seed; mono 48 kHz 16-bit, peak -3 dBFS, a CC0 room-tone floor 46 dB under the peak; the mixer pans):
#   rain   a patter of short recordings (ticks, clicks, taps; the first 35 ms of each) scattered over --dur, thick early and
#          thinning out, ±3 dB and a little brightness varied per grain, never two grains within 9 ms
#   swirl  a granular cloud read from a longer recording (air, whoosh, cloth): 30–90 ms grains that thicken toward the
#          apex (60 % in) and thin out; the band narrows toward the apex, so it closes in like points gathering
#   scan   a noise-like recording stretched to --dur by grains, then a band-pass swept low → high (a scan line drawing)
#   glide  one swish / slide recording placed so its loudest 10 ms is the apex (--apex, s), cut to --dur, the top
#          softened (a card or panel travelling)
# --check runs earshot's audit (clicks, cut tails, silence) and realness on each take; a warned take is reported, not
# kept silently. Sources must be CC0 / Pixabay: list them in the film's CREDITS.md.
import argparse, json, sys, pathlib
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000

def load(p):
    a, sr = sf.read(p, always_2d=True); a = a.mean(axis=1)
    if sr != SR:
        from scipy.signal import resample_poly
        a = resample_poly(a, SR, sr)
    return a.astype(np.float64)

def trim(a, floor_db=-50):
    """the sound itself: from 2 ms before the first sample over the floor to where it falls under it"""
    e = np.abs(a); thr = e.max() * 10 ** (floor_db / 20); idx = np.nonzero(e > thr)[0]
    if not len(idx): return a
    return a[max(0, idx[0] - int(0.002 * SR)): idx[-1] + int(0.005 * SR)]

def fade(a, i=0.002, o=0.03):
    a = a.copy(); ni, no = min(len(a), int(i * SR)), min(len(a), int(o * SR))
    if ni: a[:ni] *= np.linspace(0, 1, ni)
    if no: a[-no:] *= np.linspace(1, 0, no) ** 2
    return a

def peak(a, db=-3.0):
    m = np.abs(a).max(); return a * (10 ** (db / 20) / m) if m > 0 else a

def band(a, lo, hi):
    lo, hi = max(30, lo), min(SR / 2 - 100, hi)
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), a)

def lowpass(a, f): return sosfilt(butter(2, min(f, SR / 2 - 100), fs=SR, output="sos"), a)

def rain(srcs, rng, dur=1.2, n=None):
    grains = [fade(trim(s)[: int(0.035 * SR)], o=0.008) for s in srcs]; n = n or int(dur * 40)   # each grain its first 35 ms: a patter, not a run of clicks
    out = np.zeros(int((dur + 0.4) * SR))
    # density: a hump over the run (more grains in the middle), times sorted, ≥ 12 ms apart
    t = np.sort(rng.beta(1.6, 2.4, n) * dur); keep = [t[0]]   # thick early (the cards popping up), thinning out
    for x in t[1:]:
        if x - keep[-1] >= 0.009: keep.append(x)
    for x in keep:
        g = grains[rng.integers(len(grains))] * 10 ** (rng.uniform(-3, 3) / 20)
        g = lowpass(g, rng.uniform(6000, 14000)) if rng.random() < 0.6 else g
        i = int(x * SR); out[i:i + len(g)] += g[: len(out) - i]
    return fade(trim(out), o=0.08)

def swirl(srcs, rng, dur=1.15, apex=0.6):
    src = np.concatenate([trim(s) for s in srcs]); out = np.zeros(int((dur + 0.3) * SR))
    t = 0.0
    while t < dur:
        x = t / dur; near = np.exp(-((x - apex) / 0.22) ** 2)                    # 0..1, 1 at the apex
        gl = rng.uniform(0.03, 0.09); n = int(gl * SR)
        if len(src) > n:
            p = rng.integers(0, len(src) - n); g = src[p:p + n]
            c = 700 + 2600 * near; w = 2.6 - 1.4 * near                          # the band narrows toward the apex
            g = band(g, c / w, c * w) * np.hanning(n) * (0.25 + 0.75 * near) * 10 ** (rng.uniform(-2, 2) / 20)
            i = int(t * SR); out[i:i + n] += g[: len(out) - i]
        t += gl * (0.55 - 0.4 * near)                                            # grains overlap more at the apex
    return fade(out, o=0.15)

def stretch(src, dur, rng, gl=0.06):
    """noise-like source to any length by overlapping random grains (keeps its surface, not its timing)"""
    n = int(gl * SR); out = np.zeros(int(dur * SR) + n); h = np.hanning(n)
    # grains only from the source's body (within 12 dB of its loudest 60 ms), each brought to one level: an even surface
    rms = np.array([np.sqrt(np.mean(src[p:p + n] ** 2)) for p in range(0, max(1, len(src) - n), n // 2)])
    body = [p * (n // 2) for p in np.nonzero(rms > rms.max() / 4)[0]] or [0]
    for i in range(0, int(dur * SR), n // 3):
        p = body[rng.integers(len(body))] + rng.integers(0, n // 2); g = src[p:p + n]
        if len(g) == n: out[i:i + n] += g / (np.sqrt(np.mean(g ** 2)) + 1e-9) * h
    return out[: int(dur * SR)]

def scan(srcs, rng, dur=0.7, f0=500, f1=6000):
    src = np.concatenate([trim(s) for s in srcs]); a = stretch(src, dur, rng)
    # band-pass swept in 8 ms blocks (exponential in frequency), overlap-added so no block edges
    blk = int(0.008 * SR); out = np.zeros(len(a) + 2 * blk); h = np.hanning(2 * blk)
    for i in range(0, len(a) - blk, blk):
        x = i / len(a); c = f0 * (f1 / f0) ** x; seg = a[i:i + 2 * blk]
        if len(seg) < 2 * blk: break
        out[i:i + 2 * blk] += band(seg, c / 1.5, c * 1.5) * h
    out = out[: len(a)]; x = np.linspace(0, 1, len(out))
    env = np.minimum(1, x / 0.12) * np.minimum(1, (1 - x) / 0.3) ** 1.5      # quick in, held, eased out
    return fade(out * env, o=0.04)

def glide(srcs, rng, dur=0.6, apex=0.25):
    s = trim(srcs[rng.integers(len(srcs))]); e = np.convolve(s ** 2, np.ones(480), "same"); pk = int(np.argmax(e))
    out = np.zeros(int(dur * SR)); off = int(apex * SR) - pk
    a, b = max(0, off), min(len(out), off + len(s)); out[a:b] = s[a - off:b - off]
    return fade(lowpass(out, rng.uniform(7000, 10000)), i=0.01, o=0.12)

RECIPES = {"rain": rain, "swirl": swirl, "scan": scan, "glide": glide}
ROOM = pathlib.Path.home() / ".video-studio/sfx/room/room-night.wav"   # CC0 (Yuval, freesound 210091)

def finish(a, rng, floor_db=-46):
    """30 Hz high-pass (no DC), a room-tone floor at floor_db under the peak across the take, then peak -3 dBFS"""
    a = sosfilt(butter(2, 30, btype="high", fs=SR, output="sos"), a); a = peak(a, 0)
    if ROOM.exists():
        r = load(str(ROOM)); p = rng.integers(0, max(1, len(r) - len(a))); r = r[p:p + len(a)]
        if len(r) == len(a): a = a + fade(r / (np.sqrt(np.mean(r ** 2)) + 1e-9) * 10 ** (floor_db / 20), i=0.005, o=0.02)
    return peak(a)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("recipe", choices=RECIPES); ap.add_argument("--src", nargs="+", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--takes", type=int, default=3); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--dur", type=float); ap.add_argument("--apex", type=float); ap.add_argument("--check", action="store_true")
    o = ap.parse_args(); srcs = [load(p) for p in o.src]; kw = {k: v for k, v in (("dur", o.dur), ("apex", o.apex)) if v is not None}
    if o.recipe in ("rain", "scan") and "apex" in kw: kw.pop("apex")
    out = pathlib.Path(o.out); out.parent.mkdir(parents=True, exist_ok=True); report = []
    for k in range(o.takes):
        rng = np.random.default_rng(o.seed + k); a = finish(RECIPES[o.recipe](srcs, rng, **kw), rng); p = f"{out}_{k + 1}.wav"
        sf.write(p, a, SR, subtype="PCM_16"); r = {"file": p, "dur": round(len(a) / SR, 3)}
        if o.check:
            from earshot import api
            from earshot.forge import sfx
            c = sfx.check(a.astype(np.float32)); rl = api.realness(p)
            r.update(audit=c.get("summary"), p_real=round(rl["p_real"], 3), verdict=rl["verdict"])
        report.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
    json.dump({"recipe": o.recipe, "src": o.src, "args": kw, "seed": o.seed, "takes": report}, open(f"{out}.json", "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    sys.exit(main())
