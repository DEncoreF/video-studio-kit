"""Cut a licensed music track to the picture and lay synthesized transition effects on top.

Pure standard library. The source must be a 16-bit stereo WAV (decode an MP3 first with the
project's ffmpeg-static). The spec (see the studio's videos/<project>/films/<film>/bgm.json) says which stretches of the
track play where, and which effects land on which frames:

  segments  [{"at": video s, "from": track s, "dur": s, "xin"?: s, "xout"?: s}]   — each starts with a short crossfade
            (or a longer one: xin into it, xout out of it, running past its dur)
  music_env [[video s, gain], …]   — optional level automation on the music (linear, held beyond the ends)
  master_gain  optional fixed output gain (default: normalise the peak to -1 dBFS); stems use the mix's gain
  sfx       [{"t": s, "kind": whoosh|slide|slap|stamp|tick|pop (paper kit) or impact|riser|blip|click|glitch|swish|confirm|segtick (with "f": Hz)
             (tech kit; a riser ends on t), "gain": 1, "dir": l|r|u|d, "dur": s}]

  python3 pipelines/music/edit.py <spec.json> <source.wav> <out.wav>

Since 2026-10-21: a second tech kit of materials and machines (see KIT2 below), cue options
"align": "peak" (the loudest sample lands on t), "pan": -1..1 (the object's position) and "pan_from"/"pan_to" (the
sound travels with it), and an optional effects bus ("sfx_bus" in the spec: low cut, softened top, a short room) so the
effects share one space with the music. Specs without the new keys render exactly as before.
"""
import array, bisect, json, math, pathlib, random, sys, wave

SPEC = json.loads(pathlib.Path(sys.argv[1]).read_text())
SRC, OUT = sys.argv[2], pathlib.Path(sys.argv[3])
SR = 44100
DUR = float(SPEC["duration"])
N = int(SR * DUR)
rng = random.Random(SPEC.get("seed", 3))

w = wave.open(SRC)
assert w.getframerate() == SR and w.getnchannels() == 2 and w.getsampwidth() == 2, "need 44.1 kHz 16-bit stereo WAV"
raw = array.array("h", w.readframes(w.getnframes()))
SL, SRr = raw[0::2], raw[1::2]
L = array.array("f", bytes(4 * N))
R = array.array("f", bytes(4 * N))

# ---------- music: segments with short equal-power crossfades ----------
XF = SPEC.get("xfade", 0.04)
for seg in SPEC["segments"]:
    # "xin"/"xout" (s, optional): a longer equal-power crossfade into / out of this segment, so one section of the track
    # can melt into another over bars instead of switching on the bar line; absent, both are the short XF
    xin, xout = seg.get("xin", XF), seg.get("xout", XF)
    a0, f0, n = int(seg["at"] * SR), int(seg["from"] * SR), int((seg["dur"] + xout) * SR)
    xfi, xfo = max(1, int(xin * SR)), max(1, int(xout * SR))
    for k in range(n):
        i, j = a0 + k, f0 + k
        if not (0 <= i < N) or j >= len(SL):
            continue
        g = 1.0
        if seg["at"] > 0 and k < xfi:
            g = math.sin(0.5 * math.pi * k / xfi)
        if k >= n - xfo:
            g *= math.cos(0.5 * math.pi * (k - (n - xfo)) / xfo)
        L[i] += SL[j] / 32768 * g
        R[i] += SRr[j] / 32768 * g

MG = SPEC.get("music_gain", 0.8)
FI, FO = SPEC.get("fade_in", 0.0), SPEC.get("fade_out", 2.0)
# optional level automation on the music only (since 2026-10-23): "music_env": [[video s, gain], …], linear between
# points and held beyond the ends — eases a track's own big section entrances in without touching the effects
ENV = sorted(SPEC.get("music_env") or [])
_ENV_T = [p[0] for p in ENV]
def env(t):   # binary search: specs with a duck under every click have hundreds of points
    if not ENV: return 1.0
    if t <= ENV[0][0]: return ENV[0][1]
    k = bisect.bisect_right(_ENV_T, t)
    if k >= len(ENV): return ENV[-1][1]
    (t0, g0), (t1, g1) = ENV[k - 1], ENV[k]
    return g0 if t1 == t0 else g0 + (g1 - g0) * (t - t0) / (t1 - t0)
for i in range(N):
    t = i / SR
    g = MG * (min(1.0, t / FI) if FI else 1.0) * min(1.0, (DUR - t) / FO) * env(t)
    L[i] *= g
    R[i] *= g


# ---------- effects (paper and air, matching the collage motion) ----------
def bandnoise(n, f_of_k, q=1.6):
    """White noise through a 2-pole resonant band-pass whose centre follows f_of_k."""
    y1 = y2 = 0.0
    out = [0.0] * n
    for k in range(n):
        fc = f_of_k(k)
        r = math.exp(-math.pi * fc / (q * SR))
        c = 2 * r * math.cos(2 * math.pi * fc / SR)
        y = (1 - r) * rng.uniform(-1, 1) + c * y1 - r * r * y2
        y2, y1 = y1, y
        out[k] = y
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def whoosh(dur=0.38, up=True):
    """Air swish for a sheet leaving or entering: band-pass sweep with a rounded swell."""
    n = int(dur * SR)
    lo, hi = (400, 3200) if up else (2600, 350)
    sig = bandnoise(n, lambda k: lo * (hi / lo) ** (k / n), q=1.2)
    return [v * math.sin(math.pi * k / n) ** 1.5 for k, v in enumerate(sig)]


def slide(dur=0.24):
    """Paper sliding over paper: bright crinkly noise with a grainy envelope."""
    n = int(dur * SR)
    sig = bandnoise(n, lambda k: 2400 + 900 * math.sin(k / n * 9), q=0.9)
    grain = 1.0
    out = []
    for k, v in enumerate(sig):
        if k % 220 == 0:
            grain = rng.uniform(0.35, 1.0)
        out.append(v * grain * math.sin(math.pi * k / n) ** 0.7)
    return out


def slap(dur=0.12):
    """Sheet landing flat: short papery burst over a soft low tap."""
    n = int(dur * SR)
    nz = bandnoise(n, lambda k: 1800, q=0.8)
    return [0.8 * nz[k] * math.exp(-k / SR * 45) + 0.6 * math.sin(2 * math.pi * 120 * k / SR) * math.exp(-k / SR * 35) for k in range(n)]


def stamp(dur=0.22):
    """Rubber stamp: a rounded thud plus a dry click."""
    n = int(dur * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * (75 + 60 * math.exp(-t * 40)) / SR
        out.append(math.sin(ph) * math.exp(-t * 22))
    ck = bandnoise(int(0.02 * SR), lambda k: 3500, q=1.5)
    for k, v in enumerate(ck):
        out[k] += 0.35 * v * math.exp(-k / SR * 200)
    return out


def tick():
    """Pencil tick for a check mark."""
    n = int(0.05 * SR)
    nz = bandnoise(n, lambda k: 4200, q=2.0)
    return [v * math.exp(-k / SR * 120) for k, v in enumerate(nz)]


def pop():
    """Soft bubble pop for a chat reply."""
    n = int(0.09 * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * (520 + 700 * t / 0.09) / SR
        out.append(math.sin(ph) * math.sin(math.pi * k / n) * math.exp(-t * 25))
    return out


# ---------- effects (tech / motion-design kit) ----------
def impact(dur=0.7):
    """Low hit for a slam or a cut: pitch-dropping sub, a bright transient, a short dark tail."""
    n = int(dur * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * (38 + 70 * math.exp(-t * 18)) / SR
        out.append(0.9 * math.sin(ph) * math.exp(-t * 6.5))
    hit = bandnoise(int(min(0.06, dur) * SR), lambda k: 2600, q=0.7)
    for k, v in enumerate(hit):
        out[k] += 0.55 * v * math.exp(-k / SR * 70)
    tail = bandnoise(int(min(0.4, dur) * SR), lambda k: 500, q=0.6)
    for k, v in enumerate(tail):
        out[k] += 0.25 * v * math.exp(-k / SR * 9)
    return out


def riser(dur=0.6):
    """Tension into a hit: noise sweeping up plus a rising tone, swelling to its end (placed to END on t)."""
    n = int(dur * SR)
    nz = bandnoise(n, lambda k: 300 * (5200 / 300) ** (k / n), q=1.4)
    out, ph = [], 0.0
    for k in range(n):
        x = k / n
        ph += 2 * math.pi * (220 + 660 * x * x) / SR
        out.append((0.75 * nz[k] + 0.25 * math.sin(ph)) * x ** 2.2)
    return out


def blip():
    """Data chirp (UI response): four tiny bit-reduced square grains at shifting pitches over a short low thump."""
    sq = lambda ph: 1.0 if math.sin(ph) >= 0 else -1.0
    out = [0.0] * int(0.075 * SR)
    for g, f in enumerate([2400, 3600, 1800, 3000]):
        i0, m = int(g * 0.014 * SR), int(0.011 * SR)
        for k in range(m):
            out[i0 + k] += 0.5 * round(sq(2 * math.pi * f * k / SR) * 8) / 8 * (1 - k / m)
    for k in range(int(0.03 * SR)):
        out[k] += 0.5 * math.sin(2 * math.pi * 180 * k / SR) * math.exp(-k / SR * 90)
    return out


def segtick(f=1200):
    """One meter segment lighting up: an 8 ms bit-reduced square grain at pitch f (rise f across a fill)."""
    n = int(0.008 * SR)
    return [0.6 * round((1.0 if math.sin(2 * math.pi * f * k / SR) >= 0 else -1.0) * 6) / 6 * (1 - k / n) for k in range(n)]


def confirm():
    """Dry confirm after a click: a low-mid knock with a short noise edge, no pitch movement."""
    n = int(0.09 * SR)
    nz = bandnoise(n, lambda k: 1800, q=0.9)
    return [(0.8 * math.sin(2 * math.pi * 420 * k / SR) * math.exp(-k / SR * 55) + 0.35 * nz[k] * math.exp(-k / SR * 120)) for k in range(n)]


def click():
    """Crisp cursor click: a 3 kHz tick over a tiny noise snap."""
    n = int(0.03 * SR)
    nz = bandnoise(n, lambda k: 5000, q=1.5)
    return [(0.6 * math.sin(2 * math.pi * 3100 * k / SR) + 0.5 * nz[k]) * math.exp(-k / SR * 260) for k in range(n)]


def glitch():
    """Four stuttered bit-crushed bursts, 22 ms apart."""
    out = [0.0] * int(0.11 * SR)
    for b in range(4):
        i0, m = int(b * 0.022 * SR), int(0.012 * SR)
        f = [1200, 2400, 800, 3000][b]
        for k in range(m):
            v = math.sin(2 * math.pi * f * k / SR) + rng.uniform(-0.6, 0.6)
            out[i0 + k] += round(v * 4) / 4 * (1 - k / m)
    return out


def swish(dur=0.2, up=True):
    """Fast bright air for a camera move or a panel flying in."""
    n = int(dur * SR)
    lo, hi = (1200, 7000) if up else (7000, 1200)
    sig = bandnoise(n, lambda k: lo * (hi / lo) ** (k / n), q=1.0)
    return [v * math.sin(math.pi * k / n) ** 2 for k, v in enumerate(sig)]


# ---------- second tech kit: materials and machines ----------
def _hann(k, m): return math.sin(math.pi * k / m) ** 2


def shimmer(dur=0.8, d0=40, d1=160):
    """Particle shimmer: tiny high sine grains (2.5–9 kHz), density ramping d0 → d1 grains/s."""
    n = int(dur * SR); out = [0.0] * n; t = 0.0
    while t < dur:
        x = t / dur; dens = d0 + (d1 - d0) * x
        f, m = rng.uniform(2500, 9000), int(rng.uniform(0.004, 0.012) * SR); i0 = int(t * SR); a = rng.uniform(0.3, 1.0)
        for k in range(m):
            if i0 + k < n: out[i0 + k] += a * math.sin(2 * math.pi * f * k / SR) * _hann(k, m)
        t += rng.expovariate(dens)
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def metal(dur=1.3, f0=420):
    """Struck aluminium: inharmonic partials (plate/bar ratios) over a bright strike."""
    n = int(dur * SR); parts = [(1.0, 1.0, 3.2), (2.756, 0.6, 4.5), (5.404, 0.4, 6.5), (8.933, 0.25, 9.0), (13.34, 0.12, 12.0)]
    out = [sum(a * math.sin(2 * math.pi * f0 * r * k / SR) * math.exp(-k / SR * d) for r, a, d in parts) for k in range(n)]
    hit = bandnoise(int(0.015 * SR), lambda k: 6000, q=0.8)
    for k, v in enumerate(hit): out[k] += 0.6 * v * (1 - k / len(hit))
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def materialize(dur=0.7):
    """Particles condensing into metal: shimmer thickening while an air band sweeps up; swells to its end."""
    sh = shimmer(dur, 60, 420); n = len(sh)
    air = bandnoise(n, lambda k: 600 * (6000 / 600) ** (k / n), q=1.6)
    return [(0.7 * sh[k] + 0.4 * air[k]) * (k / n) ** 1.6 for k in range(n)]


def powerup(dur=0.5):
    """Machine powering on: a low hum rising 55 → 220 Hz with harmonics, swelling, then a small latch click."""
    n = int(dur * SR); out, ph = [], 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (55 * 4 ** x) / SR
        out.append((math.sin(ph) + 0.4 * math.sin(2 * ph) + 0.2 * math.sin(3 * ph)) * min(1, x * 3) * (0.5 + 0.5 * x))
    ck = click(); i0 = n - len(ck)
    for k, v in enumerate(ck): out[i0 + k] += 0.8 * v
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def squelch(dur=0.22):
    """Soft wet blob landing: a low tone falling 190 → 80 Hz, wobbling, over a muffled noise burst."""
    n = int(dur * SR); nz = bandnoise(n, lambda k: 380, q=0.7); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (80 + 110 * math.exp(-t * 18)) / SR
        out.append((0.9 * math.sin(ph) * (1 + 0.45 * math.sin(2 * math.pi * 19 * t)) + 0.45 * nz[k]) * math.exp(-t * 14))
    return out


def gulp(dur=0.28):
    """Squeezed through a gap: a bubble pitch falling 620 → 110 Hz with a sucked air sweep."""
    n = int(dur * SR); air = bandnoise(n, lambda k: 2400 * (300 / 2400) ** (k / n), q=1.1); out, ph = [], 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (620 * (110 / 620) ** x) / SR
        out.append((0.8 * math.sin(ph) + 0.35 * air[k]) * math.sin(math.pi * x) ** 0.8)
    return out


def scan(dur=0.55, down=True):
    """Laser scan: a clean tone gliding (down for a scan line moving down) over a matching filtered hiss, with a fine tremolo."""
    n = int(dur * SR); f0, f1 = (2200, 650) if down else (650, 2200)
    nz = bandnoise(n, lambda k: f0 * (f1 / f0) ** (k / n) * 2, q=2.2); out, ph = [], 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (f0 * (f1 / f0) ** x) / SR
        out.append((0.6 * math.sin(ph) + 0.45 * nz[k]) * (0.75 + 0.25 * math.sin(2 * math.pi * 32 * k / SR)) * math.sin(math.pi * x) ** 0.5)
    return out


def clone(dur=0.55):
    """One becoming several: three detuned air sweeps layered (a chorus of whooshes)."""
    n = int(dur * SR); a = bandnoise(n, lambda k: 500 * 8 ** (k / n), q=1.3); b = bandnoise(n, lambda k: 700 * 6 ** (k / n), q=1.8); c = bandnoise(n, lambda k: 380 * 10 ** (k / n), q=1.0)
    return [(a[k] + 0.7 * b[k] + 0.6 * c[k]) / 2.3 * math.sin(math.pi * k / n) ** 1.3 for k in range(n)]


def plink(f=1320):
    """A unit settling into place: a soft glassy bell (f and its slightly sharp octave)."""
    n = int(0.32 * SR)
    return [(math.sin(2 * math.pi * f * k / SR) + 0.35 * math.sin(2 * math.pi * f * 2.01 * k / SR)) * min(1, k / (0.003 * SR)) * math.exp(-k / SR * 11) for k in range(n)]


def zap(dur=0.45):
    """Current running along a line: a tone sweeping up with a buzzy FM edge and sparse crackles."""
    n = int(dur * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (300 * 6 ** x) / SR
        out[k] = math.sin(ph + 1.6 * math.sin(2 * math.pi * 90 * k / SR)) * math.sin(math.pi * x) ** 0.6 * 0.7
    for _ in range(int(dur * 40)):
        i0 = rng.randrange(n); m = int(0.002 * SR)
        for k in range(m):
            if i0 + k < n: out[i0 + k] += rng.uniform(-0.8, 0.8)
    return out


def lens(dur=0.5):
    """A magnifying glass coming into focus: a short rising whir, then a clear glass ting."""
    n = int(dur * SR); out = [0.0] * n; w = bandnoise(int(0.16 * SR), lambda k: 900 * (2600 / 900) ** (k / (0.16 * SR)), q=1.4)
    for k, v in enumerate(w): out[k] += 0.35 * v * math.sin(math.pi * k / len(w))
    i0 = int(0.14 * SR)
    for k in range(n - i0):
        t = k / SR; out[i0 + k] += (0.7 * math.sin(2 * math.pi * 3150 * t) + 0.35 * math.sin(2 * math.pi * 4730 * t) + 0.2 * math.sin(2 * math.pi * 6890 * t)) * math.exp(-t * 9)
    return out


def chalk(dur=0.3):
    """Chalk on a board: stick-slip grains (bright band noise bursts at ~90/s, jittered)."""
    n = int(dur * SR); nz = bandnoise(n, lambda k: 3800 + 1200 * math.sin(k / n * 7), q=1.1); out = [0.0] * n; t = 0.0
    while t < dur:
        i0, m = int(t * SR), int(rng.uniform(0.003, 0.008) * SR); a = rng.uniform(0.4, 1.0)
        for k in range(m):
            if i0 + k < n: out[i0 + k] += a * nz[i0 + k] * _hann(k, m)
        t += rng.uniform(0.007, 0.014)
    return [v * math.sin(math.pi * k / n) ** 0.4 for k, v in enumerate(out)]


def latch():
    """A door slammed shut and locked: a wooden thud, then a metal latch 25 ms later."""
    n = int(0.25 * SR); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (95 + 90 * math.exp(-t * 35)) / SR
        out.append(math.sin(ph) * math.exp(-t * 20))
    ck = bandnoise(int(0.03 * SR), lambda k: 3600, q=2.5); i0 = int(0.025 * SR)
    for k, v in enumerate(ck): out[i0 + k] += 0.7 * v * math.exp(-k / SR * 160)
    return out


def counter():
    """A mechanical counter wheel clicking over: a short knock with a dry tick."""
    n = int(0.03 * SR); ck = bandnoise(n, lambda k: 2300, q=1.8)
    return [(0.7 * math.sin(2 * math.pi * 320 * k / SR) + 0.6 * ck[k]) * math.exp(-k / SR * 180) for k in range(n)]


def dust(dur=0.7):
    """Dust thrown up and settling: soft low granular noise, fast swell, long fade."""
    n = int(dur * SR); nz = bandnoise(n, lambda k: 700, q=0.6); out = [0.0] * n; g = 1.0
    for k in range(n):
        if k % 180 == 0: g = rng.uniform(0.3, 1.0)
        x = k / n; out[k] = nz[k] * g * min(1, x * 12) * (1 - x) ** 1.5
    return out


def sonar(f=1180, dur=1.4):
    """Sonar ping: a pure tone with a soft attack, a long decay gliding a touch flat, and two fainter, darker echoes."""
    n = int(dur * SR); out = [0.0] * n
    for e, (d, a, ff) in enumerate([(0.0, 1.0, 1.0), (0.24, 0.32, 0.5), (0.48, 0.12, 0.5)]):
        i0, ph = int(d * SR), 0.0
        for k in range(n - i0):
            t = k / SR; fr = f * (1 - 0.012 * min(1, t / 0.8)); ph += 2 * math.pi * fr / SR
            env = min(1, t / 0.006) * math.exp(-t * 3.6)
            out[i0 + k] += a * env * (math.sin(ph) + 0.18 * ff * math.sin(2 * ph) * math.exp(-t * 12))
    return out


def condense(dur=0.9):
    """Particles pulled together into a solid: grains that start high and sparse and end low and dense, swelling to the cue."""
    n = int(dur * SR); out = [0.0] * n; t = 0.0
    while t < dur:
        x = t / dur; f = 7000 * (900 / 7000) ** x * rng.uniform(0.85, 1.15); m = int((0.004 + 0.01 * x) * SR); i0 = int(t * SR)
        for k in range(m):
            if i0 + k < n: out[i0 + k] += rng.uniform(0.4, 1.0) * math.sin(2 * math.pi * f * k / SR) * _hann(k, m)
        t += rng.expovariate(60 + 900 * x * x)
    air = bandnoise(n, lambda k: 3000 * (500 / 3000) ** (k / n), q=1.2)
    peak = max(abs(v) for v in out) or 1.0
    return [(0.8 * out[k] / peak + 0.3 * air[k]) * (k / n) ** 1.4 for k in range(n)]


def thunk(dur=0.45):
    """A solid metal box settling: a short low body (two damped modes) under a dry contact click; no ring."""
    n = int(dur * SR); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (68 + 50 * math.exp(-t * 30)) / SR
        out.append(0.9 * math.sin(ph) * math.exp(-t * 11) + 0.35 * math.sin(2 * math.pi * 236 * t) * math.exp(-t * 32) + 0.18 * math.sin(2 * math.pi * 517 * t) * math.exp(-t * 45))
    ck = bandnoise(int(0.012 * SR), lambda k: 4200, q=1.0)
    for k, v in enumerate(ck): out[k] += 0.45 * v * (1 - k / len(ck))
    return out


def ching():
    """Bill issued: a dry mechanical 'ka' then a short, soft register bell (two bright partials)."""
    n = int(0.6 * SR); out = [0.0] * n; ka = counter()
    for k, v in enumerate(ka): out[k] += 0.9 * v
    i0 = int(0.06 * SR)
    for k in range(n - i0):
        t = k / SR; out[i0 + k] += (0.6 * math.sin(2 * math.pi * 2093 * t) + 0.35 * math.sin(2 * math.pi * 3136 * t) + 0.12 * math.sin(2 * math.pi * 5274 * t)) * min(1, t / 0.002) * math.exp(-t * 7)
    return out


def printer(dur=0.32):
    """Thermal receipt printer: a fast, even stream of soft ticks over a faint motor hum."""
    n = int(dur * SR); out = [0.6 * 0.12 * math.sin(2 * math.pi * 120 * k / SR) * math.sin(math.pi * k / n) for k in range(n)]; t = 0.0
    while t < dur - 0.01:
        i0, m = int(t * SR), int(0.004 * SR); nz = bandnoise(m, lambda k: 2600, q=1.5)
        for k in range(m): out[i0 + k] += 0.5 * nz[k] * (1 - k / m)
        t += 0.018
    return out


def digitize(dur=0.6):
    """Turning into data: bit-crushed noise grains whose band sweeps down with the scan line."""
    n = int(dur * SR); out = [0.0] * n; t = 0.0
    while t < dur:
        x = t / dur; m = int(rng.uniform(0.006, 0.02) * SR); f = 5000 * (700 / 5000) ** x; i0 = int(t * SR)
        nz = bandnoise(m, lambda k: f, q=2.0); steps = rng.choice([3, 4, 6])
        for k in range(m):
            if i0 + k < n: out[i0 + k] += round(nz[k] * steps) / steps * rng.uniform(0.5, 1.0) * (1 - k / m)
        t += rng.uniform(0.012, 0.03)
    return [v * math.sin(math.pi * k / n) ** 0.6 for k, v in enumerate(out)]


def whomp(dur=0.8):
    """One becoming many: a sub drop swelling then falling (120 → 45 Hz) under a widening air bloom."""
    n = int(dur * SR); air = bandnoise(n, lambda k: 400 + 2600 * (k / n), q=0.8); out, ph = [], 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (120 * (45 / 120) ** x) / SR
        out.append((0.9 * math.sin(ph) + 0.35 * air[k] * x) * math.sin(math.pi * x) ** 0.7)
    return out


def lock(f=1.0):
    """A module snapping into a rack: a short tactile body, a plastic snap, a tiny metal tick 14 ms later. f scales pitch."""
    n = int(0.12 * SR); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * f * (300 + 220 * math.exp(-t * 60)) / SR
        out.append(0.7 * math.sin(ph) * math.exp(-t * 38))
    sn = bandnoise(int(0.01 * SR), lambda k: 1500 * f, q=1.2)
    for k, v in enumerate(sn): out[k] += 0.6 * v * (1 - k / len(sn))
    tk = bandnoise(int(0.008 * SR), lambda k: 5200, q=2.0); i0 = int(0.014 * SR)
    for k, v in enumerate(tk): out[i0 + k] += 0.35 * v * (1 - k / len(tk))
    return out


def pane():
    """A HUD panel locking into place (texture from layering, not from a glass timbre): a soft low-mid thump that
    drops in pitch, an air bloom that opens and closes, a crisp short tick on top, and a faint electrical hum tail."""
    n = int(0.4 * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (150 + 120 * math.exp(-t * 45)) / SR
        out[k] += 0.7 * math.sin(ph) * math.exp(-t * 24)
    air = bandnoise(int(0.22 * SR), lambda k: 1800 + 3500 * k / (0.22 * SR), q=0.9)
    for k, v in enumerate(air): out[k] += 0.3 * v * math.sin(math.pi * k / len(air)) ** 1.5
    tk = bandnoise(int(0.005 * SR), lambda k: 6200, q=1.4)
    for k, v in enumerate(tk): out[k + int(0.004 * SR)] += 0.55 * v * (1 - k / len(tk))
    for k in range(n):
        t = k / SR; out[k] += 0.06 * math.sin(2 * math.pi * 100 * t) * (1 + math.sin(2 * math.pi * 200 * t)) * math.exp(-t * 7) * min(1, t / 0.03)
    return out


# ---- boot kit (the opening: the machine powering on) ----
def bootclick():
    """The power switch: a tactile low thock, a tiny contact pop and a short electrical fizz as current flows."""
    n = int(0.3 * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (70 + 80 * math.exp(-t * 60)) / SR; out[k] += 0.8 * math.sin(ph) * math.exp(-t * 30)
    pop = bandnoise(int(0.004 * SR), lambda k: 3200, q=1.2)
    for k, v in enumerate(pop): out[k] += 0.7 * v * (1 - k / len(pop))
    fz = bandnoise(int(0.06 * SR), lambda k: 6500, q=0.8); i0 = int(0.008 * SR)
    for k, v in enumerate(fz): out[i0 + k] += 0.15 * v * math.exp(-k / SR * 60)
    return out


def hum(dur=2.0):
    """The system warming up: a low drone (49 Hz and harmonics) whose upper harmonics open slowly, then in its last
    0.45 s it gathers (pitch and brightness rise) into the cue that follows; ends abruptly, handing over."""
    n = int(dur * SR); out, ph = [], 0.0; g0 = n - int(0.45 * SR)
    for k in range(n):
        x = k / n; gx = max(0.0, (k - g0) / (n - g0)); f = 49 * (1 + 0.6 * gx * gx); ph += 2 * math.pi * f / SR
        bright = 0.15 + 0.55 * x + 0.3 * gx
        v = math.sin(ph) + 0.5 * bright * math.sin(2 * ph) + 0.3 * bright ** 1.5 * math.sin(3 * ph) + 0.18 * bright ** 2 * math.sin(4 * ph) + 0.08 * bright ** 3 * math.sin(6 * ph)
        out.append(v * min(1, x * 6) * (0.55 + 0.25 * x + 0.5 * gx) * (1 + 0.04 * math.sin(2 * math.pi * 7 * k / SR)))
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


# ---- professional boot (2026-10-21: the 8-bit version read as cute, not professional) ----
def _saw_block(fs, cut, n_harm=16):
    """Weights for an additive saw at fs with a soft low-pass at `cut` (Hz): 1/k rolled off above the cutoff."""
    return [(1.0 / k) / (1 + (k * fs / cut) ** 4) for k in range(1, n_harm + 1)]


def charge(dur=2.1, f_end=587.3, beat=0.566):
    """A warm synth charge-up: two detuned saws and a sub, gliding up two octaves to f_end along an accelerating curve,
    the filter opening with it; an in-tempo pulse that tightens from eighths to thirty-seconds; rising air; it swells
    into the cue and stops clean."""
    n = int(dur * SR); out = [0.0] * n; f0 = f_end / 4; B = 256
    phs = [0.0, 0.0, 0.0]; gate_ph = 0.0
    air = bandnoise(n, lambda k: 700 * (5500 / 700) ** ((k / n) ** 1.5), q=1.1)
    for b0 in range(0, n, B):
        x = b0 / n; f = f0 * 4 ** (x ** 1.8); cut = 500 + 3500 * x ** 1.5; w = _saw_block(f, cut)
        for k in range(b0, min(n, b0 + B)):
            xx = k / n; ff = f0 * 4 ** (xx ** 1.8); v = 0.0
            for i, det in enumerate((0.9965, 1.0035)):
                phs[i] += 2 * math.pi * ff * det / SR
                v += sum(wh * math.sin((h + 1) * phs[i]) for h, wh in enumerate(w))
            phs[2] += 2 * math.pi * ff / 2 / SR; v += 0.6 * math.sin(phs[2])
            rate = (1 / (beat / 2)) * 2 ** (2 * xx); gate_ph += rate / SR
            gate = 1 - 0.45 * (0.5 + 0.5 * math.cos(2 * math.pi * gate_ph))
            out[k] = (0.5 * v * gate + 0.35 * air[k] * xx ** 2) * (0.15 + 0.85 * xx ** 1.5) * min(1, k / (0.05 * SR)) * min(1, (n - k) / (0.004 * SR))
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def bloom(freqs=(98.0, 146.8, 233.1, 349.2, 440.0, 587.3), dur=1.8):
    """Startup chord: a warm pad that blooms (filter opens fast, settles), two detuned saws per note, a sub hit under it,
    a faint high sparkle on top; Gm9 voicing so it sits on the G-minor bed (a cue's "freqs" revoices it for another key)."""
    n = int(dur * SR); out = [0.0] * n; B = 256
    for fn in freqs:
        phs = [0.0, 0.0]; nh = max(3, min(16, int(5000 / fn)))
        for b0 in range(0, n, B):
            t = b0 / SR; cut = 700 + 3300 * (1 - math.exp(-t / 0.03)) * math.exp(-t / 0.5) + 500; w = _saw_block(fn, cut, nh)
            for k in range(b0, min(n, b0 + B)):
                tt = k / SR; env = min(1, tt / 0.015) * (0.55 + 0.45 * math.exp(-tt / 0.25)) * math.exp(-tt / 0.9); v = 0.0
                for i, det in enumerate((0.997, 1.003)):
                    phs[i] += 2 * math.pi * fn * det / SR; v += sum(wh * math.sin((h + 1) * phs[i]) for h, wh in enumerate(w))
                out[k] += 0.22 * v * env
    ph = 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (49 + 40 * math.exp(-t * 25)) / SR; out[k] += 0.9 * math.sin(ph) * math.exp(-t * 5)   # sub hit
        out[k] += 0.05 * (math.sin(2 * math.pi * 1174.7 * t) + 0.6 * math.sin(2 * math.pi * 1760 * t)) * math.exp(-t * 3) * min(1, t / 0.02)  # sparkle
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


# ---- 8-bit kit (chip sound: pulse waves, a noise channel, 4-bit amplitude, 11 kHz sample-and-hold) ----
def _pulse(ph, duty): return 1.0 if (ph / (2 * math.pi)) % 1.0 < duty else -1.0


def _chip(sig, bits=4, hold=4):
    """Make it 8-bit: hold each sample for `hold` samples (≈11 kHz) and quantise to `bits` bits."""
    q = 2 ** (bits - 1); out = [0.0] * len(sig); v = 0.0
    for k in range(len(sig)):
        if k % hold == 0: v = round(max(-1.0, min(1.0, sig[k])) * q) / q
        out[k] = v
    return out


def chip_pip(f=932.3):
    """A single chip 'pip' (power light on): 60 ms of 25% pulse with a quick pitch blip up."""
    n = int(0.06 * SR); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * f * (1 + 0.5 * (t < 0.015)) / SR; out.append(0.8 * _pulse(ph, 0.25) * (1 - t / 0.06))
    return _chip(out)


def chip_charge(dur=2.1, f0=116.5, f1=1396.9):
    """Chip charge-up: a 12.5→50% pulse sweeping up (exponential, accelerating at the end), its pitch flicking to the
    fifth and back ever faster (the classic arpeggiated charge), loudness swelling; cut off clean at the top."""
    n = int(dur * SR); out, ph, fl = [], 0.0, 0.0
    for k in range(n):
        x = k / n; f = f0 * (f1 / f0) ** (x ** 1.4); fl += (14 + 46 * x * x) / SR       # flick rate 14 → 60 per second
        f *= 2 ** (7 / 12) if (fl % 1.0) < 0.5 else 1.0
        ph += 2 * math.pi * f / SR; duty = 0.125 + 0.375 * x
        out.append(_pulse(ph, duty) * (0.25 + 0.75 * x ** 1.3) * min(1, k / (0.02 * SR)) * min(1, (n - k) / (0.003 * SR)))
    return _chip(out)


def chip_startup(notes=(932.3, 1174.7, 1396.9), top=1864.7):
    """Original chip startup chime in B-flat (fits the G-minor bed): a fast pulse arpeggio up the triad, a held top note
    with a little vibrato, a triangle an octave and a fifth below for body, and a noise 'tsh' on the downbeat."""
    step, hold = 0.05, 0.55; n = int((step * len(notes) + hold + 0.1) * SR); out = [0.0] * n
    for j, f in enumerate(list(notes) + [top]):
        i0, m = int(j * step * SR), int((hold if j == len(notes) else step) * SR); ph = 0.0; duty = (0.5, 0.25, 0.125, 0.25)[j % 4]
        for k in range(m):
            t = k / SR; vib = 1 + (0.006 * math.sin(2 * math.pi * 6 * t) if j == len(notes) and t > 0.12 else 0)
            ph += 2 * math.pi * f * vib / SR; env = (math.exp(-t * 4.5) if j == len(notes) else 0.9)
            if i0 + k < n: out[i0 + k] += 0.55 * _pulse(ph, duty) * env
    tri_f = top / 4 * 2 ** (-5 / 12); i0 = int(step * len(notes) * SR); ph = 0.0                   # body: F4-ish triangle under the top note
    for k in range(int(hold * SR)):
        t = k / SR; ph += 2 * math.pi * tri_f / SR; tri = 2 * abs(2 * ((ph / (2 * math.pi)) % 1) - 1) - 1
        out[i0 + k] += 0.4 * tri * math.exp(-t * 4)
    for k in range(int(0.09 * SR)):                                                                # noise channel
        out[k] += 0.35 * rng.uniform(-1, 1) * math.exp(-k / SR * 40)
    return _chip(out)


def spool(dur=2.0, steps=(), f0=70, f1=820):
    """A machine spinning up (the core of 'starting'): a rotor tone whose pitch climbs, faster and faster, jumping up a
    gear at each step (fractions of dur, with an 80 ms glide); fan air rises with it; the rotor pulse (AM at f/6)
    tightens as it speeds up; it grows louder and brighter to the end and cuts off clean."""
    n = int(dur * SR); out, ph, fz = [0.0] * n, 0.0, 0.0
    lvl = lambda x: x ** 1.6 * 0.55 + sum(0.15 * smooth_step((x - st) / 0.04) for st in steps)
    nz = bandnoise(n, lambda k: 400 + 3600 * lvl(k / n), q=1.4)
    for k in range(n):
        x = k / n; L = min(1.0, lvl(x)); f = f0 * (f1 / f0) ** L; ph += 2 * math.pi * f / SR; fz += 2 * math.pi * (f / 6) / SR
        b = 0.2 + 0.8 * L
        tone = math.sin(ph) + 0.55 * b * math.sin(2 * ph) + 0.35 * b * b * math.sin(3 * ph) + 0.2 * b ** 3 * math.sin(5 * ph)
        am = 0.75 + 0.25 * math.sin(fz)
        out[k] = (0.75 * tone * am + 0.5 * nz[k] * L) * min(1, x * 8) * (0.25 + 0.75 * L) * min(1, (n - k) / (0.004 * SR))
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def smooth_step(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)


def gear():
    """Shifting up a gear: a solid low engage thump with a short metallic clack on top."""
    n = int(0.25 * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (75 + 110 * math.exp(-t * 45)) / SR; out[k] += 0.85 * math.sin(ph) * math.exp(-t * 18)
    ck = bandnoise(int(0.012 * SR), lambda k: 2900, q=1.6)
    for k, v in enumerate(ck): out[k] += 0.55 * v * (1 - k / len(ck))
    return out


def fullpower():
    """Arrival at full power: a deep wide hit (sub 45 Hz dropping), a bright noise wash released outward, a long air tail."""
    n = int(1.3 * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (45 + 90 * math.exp(-t * 22)) / SR; out[k] += 1.0 * math.sin(ph) * math.exp(-t * 4.5)
    wash = bandnoise(n, lambda k: 6000 * (900 / 6000) ** (k / n), q=0.7)
    for k, v in enumerate(wash): out[k] += 0.55 * v * math.exp(-k / SR * 3.2) * min(1, k / (0.003 * SR))
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def heartbeat(level=0.5):
    """One boot heartbeat: a soft low-mid thump with a short data tick on top; level 0..1 makes it fuller and brighter."""
    n = int(0.28 * SR); out, ph = [0.0] * n, 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * (80 + 90 * math.exp(-t * 40)) / SR; out[k] += (0.6 + 0.3 * level) * math.sin(ph) * math.exp(-t * 16)
    tk = bandnoise(int(0.007 * SR), lambda k: 2200 + 3200 * level, q=1.6); i0 = int(0.006 * SR)
    for k, v in enumerate(tk): out[i0 + k] += (0.25 + 0.45 * level) * v * (1 - k / len(tk))
    for k in range(int(0.05 * SR)):
        t = k / SR; out[k] += 0.12 * level * math.sin(2 * math.pi * 660 * (1 + 0.5 * level) * t) * math.exp(-t * 60)
    return out


def calib(ticks=8, dur=0.5):
    """A ring calibrating into place: a fine servo ratchet, fast then slowing (expo-out spacing), fading."""
    n = int((dur + 0.02) * SR); out = [0.0] * n
    for j in range(ticks):
        x = j / max(1, ticks - 1); t0 = dur * (1 - (1 - x) ** 2.2) if ticks > 1 else 0.0; i0 = int(t0 * SR)
        tk = bandnoise(int(0.0025 * SR), lambda k: 4600 + 400 * (j % 3), q=2.0)
        for k, v in enumerate(tk):
            if i0 + k < n: out[i0 + k] += (1 - 0.6 * x) * v * (1 - k / len(tk))
    return out


def screenon():
    """The screen coming on: a short rising zip (narrow band 1.5 → 9 kHz) into a solid thump with a wide air release."""
    n = int(0.6 * SR); out = [0.0] * n; z = int(0.18 * SR)
    zp = bandnoise(z, lambda k: 1500 * (9000 / 1500) ** (k / z), q=3.0)
    for k, v in enumerate(zp): out[k] += 0.55 * v * (k / z) ** 1.5
    ph = 0.0
    for k in range(n - z):
        t = k / SR; ph += 2 * math.pi * (55 + 75 * math.exp(-t * 30)) / SR; out[z + k] += 0.9 * math.sin(ph) * math.exp(-t * 8)
    air = bandnoise(n - z, lambda k: 900, q=0.6)
    for k, v in enumerate(air): out[z + k] += 0.3 * v * math.exp(-k / SR * 10)
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def ping(f=1180, dur=1.3):
    """Sonar ping going out: a clean tone, a hard but click-free attack, a long tail drifting a touch flat, a little
    pressure (low thump) at the start so it reads as sent, not as a UI beep."""
    n = int(dur * SR); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * f * (1 - 0.01 * min(1, t / 0.9)) / SR
        out.append(min(1, t / 0.004) * math.exp(-t * 3.4) * (math.sin(ph) + 0.12 * math.sin(2 * ph) * math.exp(-t * 14)) + 0.4 * math.sin(2 * math.pi * 70 * t) * math.exp(-t * 35))
    return out


def echo(f=1180, dur=0.9):
    """The ping coming back from a contact: lower (doppler), softer attack, darker, smeared by water (a little noise)."""
    n = int(dur * SR); fe = f * 0.955; nz = bandnoise(n, lambda k: fe, q=6.0); out, ph = [], 0.0
    for k in range(n):
        t = k / SR; ph += 2 * math.pi * fe / SR
        out.append(min(1, t / 0.025) * math.exp(-t * 5.5) * (0.75 * math.sin(ph) + 0.35 * nz[k]))
    return out


def beam(dur=2.2, period=1.132):
    """The beam sweeping round: low filtered water noise whose band swells once per turn (as it passes the listener)."""
    n = int(dur * SR); nz = bandnoise(n, lambda k: 380 + 520 * (0.5 + 0.5 * math.cos(2 * math.pi * k / SR / period)), q=1.8)
    return [nz[k] * (0.35 + 0.65 * (0.5 + 0.5 * math.cos(2 * math.pi * k / SR / period)) ** 2) * min(1, k / (0.3 * SR)) * min(1, (n - k) / (0.3 * SR)) for k in range(n)]


def lockon():
    """Contact locked: two short, rounded beeps a fifth apart."""
    n = int(0.2 * SR); out = [0.0] * n
    for d, f in ((0.0, 1568), (0.085, 2349)):
        i0 = int(d * SR)
        for k in range(int(0.07 * SR)):
            t = k / SR; out[i0 + k] += math.sin(2 * math.pi * f * t) * min(1, t / 0.003) * math.exp(-t * 30)
    return out


def morph(dur=0.44):
    """A frame gliding into a new shape: a soft band of air and a quiet tone gliding with it, eased in and out like the move."""
    n = int(dur * SR); air = bandnoise(n, lambda k: 900 + 1600 * math.sin(math.pi * k / n), q=1.6); out, ph = [], 0.0
    for k in range(n):
        x = k / n; e = x * x * (3 - 2 * x); ph += 2 * math.pi * (520 + 260 * e) / SR
        out.append((0.6 * air[k] + 0.25 * math.sin(ph)) * math.sin(math.pi * x) ** 1.2)
    return out


# ---- going into a container (options, 2026-10-21) ----
def plop():
    """Into a liquid-filled container: a short rising 'bloop' (cavity forming and closing), a few bubbles after."""
    n = int(0.55 * SR); out, ph = [0.0] * n, 0.0
    for k in range(int(0.09 * SR)):
        t = k / SR; ph += 2 * math.pi * (260 + 900 * (t / 0.09) ** 1.5) / SR; out[k] += math.sin(ph) * math.sin(math.pi * t / 0.09) ** 0.6
    sp = bandnoise(int(0.03 * SR), lambda k: 1800, q=0.9)
    for k, v in enumerate(sp): out[k] += 0.3 * v * (1 - k / len(sp))
    for j in range(5):
        i0 = int((0.12 + 0.05 * j + 0.012 * (j % 2)) * SR); fb = 700 + 260 * j; ph = 0.0
        for k in range(int(0.035 * SR)):
            t = k / SR; ph += 2 * math.pi * fb * (1 + 1.2 * t / 0.035) / SR; out[i0 + k] += (0.35 - 0.05 * j) * math.sin(ph) * math.sin(math.pi * t / 0.035)
    return out


def cartridge():
    """A module seated into its slot: a smooth plastic-on-metal slide, a firm seat, then a crisp latch click."""
    n = int(0.45 * SR); out = [0.0] * n
    sl = bandnoise(int(0.16 * SR), lambda k: 1300 + 900 * k / (0.16 * SR), q=1.2)
    for k, v in enumerate(sl): out[k] += 0.45 * v * math.sin(math.pi * k / len(sl)) ** 0.8
    i0, ph = int(0.16 * SR), 0.0
    for k in range(n - i0):
        t = k / SR; ph += 2 * math.pi * (180 + 120 * math.exp(-t * 60)) / SR; out[i0 + k] += 0.8 * math.sin(ph) * math.exp(-t * 35)
    c0 = int(0.2 * SR); ck = bandnoise(int(0.006 * SR), lambda k: 4200, q=2.2)
    for k, v in enumerate(ck): out[c0 + k] += 0.9 * v * (1 - k / len(ck))
    for k in range(int(0.03 * SR)): out[c0 + k] += 0.4 * math.sin(2 * math.pi * 2600 * k / SR) * math.exp(-k / SR * 160)
    return out


def pneumatic(rush=0.42):
    """A pneumatic tube: a sucking rush (rush seconds) that rises as the capsule is pulled in, ending in a padded thunk
    at the end stop."""
    m = int(rush * SR); n = m + int(0.18 * SR); out = [0.0] * n
    rush = bandnoise(m, lambda k: 500 * (3000 / 500) ** (k / m), q=1.0)
    for k, v in enumerate(rush): out[k] += 0.6 * v * (k / m) ** 1.4
    ph = 0.0
    for k in range(n - m):
        t = k / SR; ph += 2 * math.pi * (70 + 70 * math.exp(-t * 45)) / SR; out[m + k] += 0.95 * math.sin(ph) * math.exp(-t * 20)
    return out


def coin():
    """Dropped into a slot: a bright metal clink on the edge, then it falls and rolls inside to a stop."""
    n = int(0.8 * SR); out = [0.0] * n
    def clink(i0, a):
        for k in range(min(int(0.25 * SR), n - i0)):
            t = k / SR; out[i0 + k] += a * (0.6 * math.sin(2 * math.pi * 3150 * t) + 0.4 * math.sin(2 * math.pi * 5120 * t) + 0.25 * math.sin(2 * math.pi * 7400 * t)) * math.exp(-t * 18)
    clink(0, 0.9)
    for j, (d, a) in enumerate(((0.17, 0.45), (0.25, 0.3), (0.31, 0.2), (0.355, 0.13), (0.39, 0.08))): clink(int(d * SR), a)
    rl = bandnoise(int(0.25 * SR), lambda k: 2600, q=1.6); r0 = int(0.4 * SR)
    for k, v in enumerate(rl): out[r0 + k] += 0.12 * v * (1 - k / len(rl)) * (0.6 + 0.4 * math.sin(2 * math.pi * 30 * k / SR))
    return out


def collect():
    """Drawn in and collected: a quick inward air sweep into a short bright two-note confirm."""
    n = int(0.55 * SR); out = [0.0] * n; m = int(0.2 * SR)
    sw = bandnoise(m, lambda k: 4000 * (900 / 4000) ** (k / m), q=1.3)
    for k, v in enumerate(sw): out[k] += 0.5 * v * (k / m) ** 1.2
    for d, f in ((0.2, 1568.0), (0.27, 2349.3)):
        i0 = int(d * SR)
        for k in range(int(0.25 * SR)):
            t = k / SR; out[i0 + k] += 0.5 * (math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t)) * min(1, t / 0.002) * math.exp(-t * 12)
    return out


def appear_soft():
    """A machine set down into place: a soft air swell that rises into a low, gentle placement thump."""
    n = int(0.9 * SR); out = [0.0] * n; m = int(0.6 * SR)
    sw = bandnoise(m, lambda k: 300 * (2200 / 300) ** (k / m), q=0.9)
    for k, v in enumerate(sw): out[k] += 0.45 * v * (k / m) ** 2
    ph = 0.0
    for k in range(n - m):
        t = k / SR; ph += 2 * math.pi * (55 + 45 * math.exp(-t * 30)) / SR; out[m + k] += 0.9 * math.sin(ph) * math.exp(-t * 9)
    return out


def trace(dur=0.5, f0=420, f1=1260):
    """A line being drawn: two slightly detuned pure tones (plus a soft octave) gliding up smoothly with the line,
    eased like the motion, a faint air layer, no buzz or crackle."""
    n = int(dur * SR); air = bandnoise(n, lambda k: 2500 + 2000 * k / n, q=1.2); out, p1, p2 = [], 0.0, 0.0
    for k in range(n):
        x = k / n; e = 1 - (1 - x) ** 3; f = f0 * (f1 / f0) ** e
        p1 += 2 * math.pi * f * 0.998 / SR; p2 += 2 * math.pi * f * 1.002 / SR
        env = min(1, x / 0.08) * (1 - x) ** 0.6
        out.append((0.5 * math.sin(p1) + 0.5 * math.sin(p2) + 0.18 * math.sin(2 * p1) + 0.06 * air[k]) * env)
    return out


def node(f=1174.7):
    """A node connecting: a soft round tone (f and a quiet octave) with a tiny click on its front, short decay."""
    n = int(0.35 * SR); out = [0.0] * n
    for k in range(n):
        t = k / SR; out[k] = (math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t) * math.exp(-t * 20)) * min(1, t / 0.003) * math.exp(-t * 13)
    ck = bandnoise(int(0.004 * SR), lambda k: 3000, q=1.5)
    for k, v in enumerate(ck): out[k] += 0.15 * v
    return out


def current(dur=0.6):
    """A clean current coming up along a line: a mains-like hum (100 Hz and harmonics) swelling smoothly, a gentle
    2 Hz breath in it, no crackle; fades as the line settles."""
    n = int(dur * SR); out = []
    for k in range(n):
        x = k / n; t = k / SR; sw = x * x * (3 - 2 * x)
        v = math.sin(2 * math.pi * 100 * t) + 0.5 * math.sin(2 * math.pi * 200 * t) + 0.3 * sw * math.sin(2 * math.pi * 300 * t) + 0.12 * sw * math.sin(2 * math.pi * 600 * t)
        out.append(v * math.sin(math.pi * min(1, x * 1.6) / 2) * (1 - max(0, x - 0.7) / 0.3) * (0.85 + 0.15 * math.sin(2 * math.pi * 2 * t)))
    return out


def pulse_run(dur=0.5):
    """An energy pulse running out along the line: a soft 'whum' rising 150 → 600 Hz in a bell envelope over muted air."""
    n = int(dur * SR); air = bandnoise(n, lambda k: 600 + 1400 * k / n, q=0.8); out, ph = [], 0.0
    for k in range(n):
        x = k / n; ph += 2 * math.pi * (150 * 4 ** (1 - (1 - x) ** 2)) / SR
        out.append((0.8 * math.sin(ph) + 0.25 * air[k]) * math.sin(math.pi * x) ** 1.3)
    return out


def space_tail(dur=1.4):
    """Room and weight after a hit: a dark noise bloom (a large space answering) over a slow sub (42 Hz) decay."""
    n = int(dur * SR); nz = bandnoise(n, lambda k: 320 - 120 * k / n, q=0.5); out = []
    for k in range(n):
        t = k / SR; out.append((0.55 * nz[k] * math.exp(-t * 3.2) + 0.7 * math.sin(2 * math.pi * 42 * t) * math.exp(-t * 2.6)) * min(1, t / 0.012))
    return out


def boxdrop():
    """Something dropped into a box: a muffled contact, the box's hollow body ringing briefly (a few damped wall modes,
    a cavity boom, a short internal echo), two smaller bounces, then a faint settle."""
    n = int(0.6 * SR)
    def thud(scale, pitch):
        o, ph = [0.0] * n, 0.0
        for k in range(n):
            t = k / SR; ph += 2 * math.pi * pitch * (82 + 40 * math.exp(-t * 40)) / SR
            o[k] = scale * (0.9 * math.sin(ph) * math.exp(-t * 13)
                            + sum(a * math.sin(2 * math.pi * f * pitch * t) * math.exp(-t * d) for f, a, d in ((148, 0.55, 22), (231, 0.4, 28), (367, 0.28, 36), (523, 0.16, 48))))
        ct = bandnoise(int(0.02 * SR), lambda k: 900, q=0.8)
        for k, v in enumerate(ct): o[k] += scale * 0.6 * v * (1 - k / len(ct))
        return o
    out = thud(1.0, 1.0)
    for d, sc, pt in ((0.085, 0.38, 1.12), (0.14, 0.16, 1.2)):                          # bounces
        b, i0 = thud(sc, pt), int(d * SR)
        for k in range(n - i0): out[i0 + k] += b[k]
    dl = int(0.0065 * SR)                                                                # hollow: a short internal echo
    for k in range(dl, n): out[k] += 0.42 * out[k - dl] * math.exp(-k / SR * 6)
    for j in range(3):                                                                   # settle
        i0 = int((0.19 + 0.035 * j) * SR); tk = bandnoise(int(0.004 * SR), lambda k: 2400 + 300 * j, q=1.8)
        for k, v in enumerate(tk): out[i0 + k] += (0.12 - 0.03 * j) * v
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


def register():
    """Cash register 'ka-ching': the drawer mechanism (a ratchet of three dry clicks and a low thunk), then the register
    bell (inharmonic bell partials, ringing), the drawer sliding out and a few coins chinking."""
    n = int(1.1 * SR); out = [0.0] * n
    for j, d in enumerate((0.0, 0.017, 0.034)):                         # ratchet
        ck = counter(); i0 = int(d * SR)
        for k, v in enumerate(ck): out[i0 + k] += (0.7 - 0.12 * j) * v
    i0 = int(0.04 * SR)
    for k in range(int(0.12 * SR)):                                     # the key bottoming out
        t = k / SR; out[i0 + k] += 0.5 * math.sin(2 * math.pi * (110 + 60 * math.exp(-t * 50)) * t) * math.exp(-t * 30)
    b0, f0 = int(0.09 * SR), 2140                                       # the bell
    for k in range(n - b0):
        t = k / SR; att = min(1, t / 0.0015)
        out[b0 + k] += att * (0.6 * math.sin(2 * math.pi * f0 * t) * math.exp(-t * 3.2) + 0.35 * math.sin(2 * math.pi * f0 * 2.32 * t) * math.exp(-t * 5)
                              + 0.2 * math.sin(2 * math.pi * f0 * 4.25 * t) * math.exp(-t * 8) + 0.1 * math.sin(2 * math.pi * f0 * 6.63 * t) * math.exp(-t * 12))
    sl = bandnoise(int(0.16 * SR), lambda k: 1400, q=0.9); s0 = int(0.1 * SR)  # the drawer slides out
    for k, v in enumerate(sl): out[s0 + k] += 0.25 * v * math.sin(math.pi * k / len(sl))
    for c in range(5):                                                  # coins
        c0, fc = int((0.16 + c * rng.uniform(0.025, 0.05)) * SR), rng.uniform(4200, 7200)
        for k in range(int(0.06 * SR)):
            if c0 + k < n: t = k / SR; out[c0 + k] += 0.18 * math.sin(2 * math.pi * fc * t) * math.exp(-t * 55)
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak for v in out]


KIT2 = {"space_tail": lambda x: space_tail(x.get("dur", 1.4)), "node": lambda x: node(x.get("f", 1174.7)), "current": lambda x: current(x.get("dur", 0.6)), "pulse_run": lambda x: pulse_run(x.get("dur", 0.5)), "trace": lambda x: trace(x.get("dur", 0.5), x.get("f0", 420), x.get("f1", 1260)), "plop": lambda x: plop(), "cartridge": lambda x: cartridge(), "pneumatic": lambda x: pneumatic(x.get("rush", 0.42)), "coin": lambda x: coin(),
        "collect": lambda x: collect(), "appear_soft": lambda x: appear_soft(), "boxdrop": lambda x: boxdrop(), "charge": lambda x: charge(x.get("dur", 2.1), x.get("f", 587.3)), "bloom": lambda x: bloom(tuple(x["freqs"])) if "freqs" in x else bloom(), "chip_pip": lambda x: chip_pip(x.get("f", 932.3)), "chip_charge": lambda x: chip_charge(x.get("dur", 2.1)), "chip_startup": lambda x: chip_startup(),
        "spool": lambda x: spool(x.get("dur", 2.0), tuple(x.get("steps", ())), x.get("f0", 70), x.get("f1", 820)), "gear": lambda x: gear(),
        "fullpower": lambda x: fullpower(), "bootclick": lambda x: bootclick(), "hum": lambda x: hum(x.get("dur", 2.0)), "heartbeat": lambda x: heartbeat(x.get("level", 0.5)),
        "calib": lambda x: calib(x.get("ticks", 8), x.get("dur", 0.5)), "screenon": lambda x: screenon(), "ping": lambda x: ping(x.get("f", 1180), x.get("dur", 1.3)), "echo": lambda x: echo(x.get("f", 1180), x.get("dur", 0.9)),
        "beam": lambda x: beam(x.get("dur", 2.2), x.get("period", 1.132)), "lockon": lambda x: lockon(),
        "register": lambda x: register(), "pane": lambda x: pane(), "morph": lambda x: morph(x.get("dur", 0.44)), "sonar": lambda x: sonar(x.get("f", 1180), x.get("dur", 1.4)), "condense": lambda x: condense(x.get("dur", 0.9)), "thunk": lambda x: thunk(x.get("dur", 0.45)),
        "ching": lambda x: ching(), "printer": lambda x: printer(x.get("dur", 0.32)), "digitize": lambda x: digitize(x.get("dur", 0.6)),
        "whomp": lambda x: whomp(x.get("dur", 0.8)), "lock": lambda x: lock(x.get("f", 1.0)),"shimmer": lambda x: shimmer(x.get("dur", 0.8), x.get("d0", 40), x.get("d1", 160)), "metal": lambda x: metal(x.get("dur", 1.3), x.get("f", 420)),
        "materialize": lambda x: materialize(x.get("dur", 0.7)), "powerup": lambda x: powerup(x.get("dur", 0.5)), "squelch": lambda x: squelch(x.get("dur", 0.22)),
        "gulp": lambda x: gulp(x.get("dur", 0.28)), "scan": lambda x: scan(x.get("dur", 0.55), x.get("dir", "d") == "d"), "clone": lambda x: clone(x.get("dur", 0.55)),
        "plink": lambda x: plink(x.get("f", 1320)), "zap": lambda x: zap(x.get("dur", 0.45)), "lens": lambda x: lens(x.get("dur", 0.5)), "chalk": lambda x: chalk(x.get("dur", 0.3)),
        "latch": lambda x: latch(), "counter": lambda x: counter(), "dust": lambda x: dust(x.get("dur", 0.7))}

# recorded effects (since 2026-10-25): {"kind": "sample", "file": "…wav", "from"?: s, "dur"?: s, "fade"?: s} — a 44.1 kHz 16-bit
# WAV (mono or stereo, folded to mono and placed by pan like the synthesized ones), the path relative to the spec; "from"/"dur"
# trim it, "fade" is the tail's fade (default 30 ms). Not normalised: "gain" sets its level (base 1.0). For material sounds
# that synthesis can't fake (a laptop lid, paper, a split-flap); licences are the film's to log.
_SAMPLES = {}
def sample(x):
    p = pathlib.Path(x["file"])
    p = p if p.is_absolute() else pathlib.Path(sys.argv[1]).resolve().parent / p
    if p not in _SAMPLES:
        w = wave.open(str(p))
        assert w.getframerate() == SR and w.getsampwidth() == 2, f"{p}: need a 44.1 kHz 16-bit WAV"
        a, ch = array.array("h", w.readframes(w.getnframes())), w.getnchannels()
        _SAMPLES[p] = [sum(a[i:i + ch]) / ch / 32768 for i in range(0, len(a), ch)]
    s = _SAMPLES[p]
    a0 = int(x.get("from", 0) * SR)
    out = s[a0:a0 + int(x["dur"] * SR)] if "dur" in x else s[a0:]
    fi, fo = int(0.002 * SR), max(1, int(x.get("fade", 0.03) * SR))
    return [v * min(1.0, k / fi) * min(1.0, (len(out) - k) / fo) for k, v in enumerate(out)]


PAN = {"l": (-0.7, 0.7), "r": (0.7, -0.7), "u": (0.0, 0.0), "d": (0.0, 0.0)}
KINDS = {"whoosh": 0.30, "slide": 0.26, "slap": 0.34, "stamp": 0.45, "tick": 0.55, "pop": 0.32,
         "impact": 0.6, "riser": 0.28, "blip": 0.22, "click": 0.4, "glitch": 0.22, "swish": 0.3, "confirm": 0.35, "segtick": 0.22,
         "shimmer": 0.16, "metal": 0.32, "materialize": 0.3, "powerup": 0.3, "squelch": 0.45, "gulp": 0.35, "scan": 0.22, "clone": 0.3, "plink": 0.16,
         "zap": 0.2, "lens": 0.25, "chalk": 0.22, "latch": 0.5, "counter": 0.4, "dust": 0.3,
         "space_tail": 0.45, "node": 0.22, "current": 0.22, "pulse_run": 0.35, "trace": 0.3, "plop": 0.4, "cartridge": 0.45, "pneumatic": 0.45, "coin": 0.25, "collect": 0.3, "appear_soft": 0.5, "boxdrop": 0.6, "charge": 0.2, "bloom": 0.42, "chip_pip": 0.16, "chip_charge": 0.1, "chip_startup": 0.17, "spool": 0.2, "gear": 0.5, "fullpower": 0.6, "bootclick": 0.45, "hum": 0.14, "heartbeat": 0.45, "calib": 0.16, "screenon": 0.5, "ping": 0.22, "echo": 0.16, "beam": 0.12, "lockon": 0.14, "register": 0.32, "pane": 0.34, "morph": 0.22, "sonar": 0.22, "condense": 0.28, "thunk": 0.55, "ching": 0.22, "printer": 0.3, "digitize": 0.2, "whomp": 0.45, "lock": 0.4, "sample": 1.0}
SG = SPEC.get("sfx_gain", 1.0)
BUS = SPEC.get("sfx_bus")  # e.g. {"room": 0.2, "decay": 0.74, "damp": 0.42, "soften": 11000}; absent → effects stay dry (older specs)
# with a bus the effects collect separately and are processed before the mix; without one they go straight into L/R as before
XL, XR = (array.array("f", bytes(4 * N)), array.array("f", bytes(4 * N))) if BUS else (L, R)
for x in SPEC.get("sfx", []):
    kind, t = x["kind"], x["t"]
    if kind == "whoosh":
        sig = whoosh(x.get("dur", 0.38), up=x.get("dir", "u") != "d")
    elif kind == "swish":
        sig = swish(x.get("dur", 0.2), up=x.get("dir", "u") != "d")
    elif kind == "impact":
        sig = impact(x.get("dur", 0.7))
    elif kind == "segtick":
        sig = segtick(x.get("f", 1200))
    elif kind == "riser":
        sig = riser(x.get("dur", 0.6))
        t -= len(sig) / SR  # a riser ends on its cue
    elif kind in KIT2:
        sig = KIT2[kind](x)
        if kind in ("materialize", "condense"): t -= len(sig) / SR  # swells into its cue, like a riser
    elif kind == "sample":
        sig = sample(x)
    else:
        sig = {"slide": slide, "slap": slap, "stamp": stamp, "tick": tick, "pop": pop, "blip": blip, "click": click, "glitch": glitch, "confirm": confirm}[kind]()
    g = KINDS[kind] * x.get("gain", 1.0) * SG
    if x.get("align") == "peak":  # the loudest moment lands on t
        t -= max(range(len(sig)), key=lambda k: abs(sig[k])) / SR
    p0, p1 = PAN.get(x.get("dir", "u"), (0.0, 0.0)) if kind != "scan" else (0.0, 0.0)
    if "pan" in x: p0 = p1 = x["pan"]
    if "pan_from" in x: p0, p1 = x["pan_from"], x.get("pan_to", x["pan_from"])  # the sound travels with its object
    i0 = int(t * SR)
    for k, v in enumerate(sig):
        i = i0 + k
        if 0 <= i < N:
            pan = p0 + (p1 - p0) * k / len(sig)
            XL[i] += v * g * math.cos((pan + 1) * math.pi / 4)
            XR[i] += v * g * math.sin((pan + 1) * math.pi / 4)

# ---------- effects bus: 質感 (the user's baseline for every sound) ----------
# Dry synthesis reads as cheap. The bus puts every effect in one small room with the music: a gentle tone shaping
# (low cut at ~30 Hz, the top above ~11 kHz softened so the bit-reduced grains lose their fizz), then a short
# Freeverb-style room (pre-delay 14 ms, ~0.7 s tail, damped, decorrelated left/right for width) sent at a low level.
if BUS:
    a_lp = math.exp(-2 * math.pi * BUS.get("soften", 11000) / SR); a_hp = math.exp(-2 * math.pi * 30 / SR)
    for X in (XL, XR):
        lp = hp_x = hp_y = 0.0
        for i in range(N):
            lp = (1 - a_lp) * X[i] + a_lp * lp
            hp_y = a_hp * (hp_y + lp - hp_x); hp_x = lp
            X[i] = hp_y
    room, fb, damp = BUS.get("room", 0.2), BUS.get("decay", 0.74), BUS.get("damp", 0.42)
    if room > 0:
        pre = int(0.014 * SR)
        for ch, (X, spread) in enumerate(((XL, 0), (XR, 23))):
            combs = [[array.array("f", bytes(4 * (n + spread))), 0, 0.0] for n in (1116, 1188, 1277, 1356)]
            alls = [[array.array("f", bytes(4 * (n + spread))), 0] for n in (556, 441)]
            src = [(XL[i] + XR[i]) * 0.5 for i in range(N)] if ch == 0 else src
            wet = array.array("f", bytes(4 * N))
            for i in range(N):
                x = src[i - pre] if i >= pre else 0.0
                acc = 0.0
                for c in combs:
                    buf, j, st = c; y = buf[j]; st = y * (1 - damp) + st * damp; buf[j] = x + st * fb; c[1] = (j + 1) % len(buf); c[2] = st; acc += y
                for a in alls:
                    buf, j = a; b = buf[j]; buf[j] = acc + b * 0.5; acc = b - acc * 0.5; a[1] = (j + 1) % len(buf)
                wet[i] = acc
            for i in range(N): X[i] += wet[i] * room * 0.25
    for i in range(N):
        L[i] += XL[i]; R[i] += XR[i]

# ---------- master: gentle limit, normalise to -1 dBFS ----------
peak = 0.0
for i in range(N):
    L[i], R[i] = math.tanh(L[i] * 1.05), math.tanh(R[i] * 1.05)
    peak = max(peak, abs(L[i]), abs(R[i]))
gain = 0.89 / peak if peak else 1.0
# "master_gain" (optional, since 2026-11-02): use this output gain instead of normalising to the peak, so stems rendered from
# one spec (music alone, effects alone) keep the mix's levels and can be compared with each other
if "master_gain" in SPEC: gain = float(SPEC["master_gain"])
OUT.parent.mkdir(parents=True, exist_ok=True)
frames = array.array("h", [0]) * (2 * N)
for i in range(N):
    frames[2 * i] = int(L[i] * gain * 32767)
    frames[2 * i + 1] = int(R[i] * gain * 32767)
with wave.open(str(OUT), "wb") as o:
    o.setnchannels(2)
    o.setsampwidth(2)
    o.setframerate(SR)
    o.writeframes(frames.tobytes())
print(f"wrote {OUT} gain {gain:.2f} sfx {len(SPEC.get('sfx', []))}")
