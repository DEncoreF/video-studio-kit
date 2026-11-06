"""Procedural score from a cue sheet, so music lands on the picture's cuts.

Pure standard library: soft FM electric piano, bass, pad, glockenspiel, drums, plus
paper slap / tear effects. Arrangement comes from a JSON cue sheet (see the studio's videos/<project>/films/<film>/score.json):
sections (intro, hit, groove, steps, lift, outro), sound-effect hits and drum fills.

  python3 pipelines/music/compose.py <cues.json> <out.wav> [--keys epiano|none]
"""
import array, json, math, pathlib, random, sys, wave

CUES = json.loads(pathlib.Path(sys.argv[1]).read_text())
OUT = pathlib.Path(sys.argv[2])
SR = 44100
DUR = float(CUES["duration"])
N = int(SR * DUR)
BEAT = 60.0 / CUES.get("bpm", 120)
L = array.array("f", bytes(4 * N))
R = array.array("f", bytes(4 * N))
rng = random.Random(CUES.get("seed", 7))
# Melodic voice: "epiano" (soft FM electric piano) or "none" (drums, bass, pad and effects only).
KEYS = sys.argv[sys.argv.index("--keys") + 1] if "--keys" in sys.argv else CUES.get("keys", "epiano")


def f(m):  # MIDI -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)


def add(t, sig, gain=1.0, pan=0.0):
    """Mix a mono signal (list/array) at time t seconds with constant-power pan."""
    i0 = int(t * SR)
    gl = gain * math.cos((pan + 1) * math.pi / 4)
    gr = gain * math.sin((pan + 1) * math.pi / 4)
    for k, v in enumerate(sig):
        i = i0 + k
        if 0 <= i < N:
            L[i] += v * gl
            R[i] += v * gr


# ---------- voices ----------
def epiano(m, dur=0.9):
    """Soft FM electric piano (Rhodes-like): 1:1 FM with a decaying index plus a faint tine."""
    if KEYS == "none":
        return []
    fr, n = f(m), int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        idx = 0.35 + 1.1 * math.exp(-t * 6)
        mod = math.sin(2 * math.pi * fr * t)
        v = math.sin(2 * math.pi * fr * t + idx * mod)
        v += 0.08 * math.sin(2 * math.pi * fr * 7 * t) * math.exp(-t * 25)
        env = min(1.0, k / 120) * math.exp(-t * 2.2) * min(1.0, (n - k) / 600)
        out.append(v * env * (1 + 0.06 * math.sin(2 * math.pi * 4.5 * t)))
    return out


def tick():
    """Soft clock tick (filtered click) for the intro."""
    return noise_burst(0.03, 120, bp=0.25)


def bell(m, dur=2.2):
    """Glockenspiel-like: harmonic partials so it sits in key."""
    fr, n = f(m), int(dur * SR)
    return [(math.sin(2 * math.pi * fr * k / SR) + 0.3 * math.sin(2 * math.pi * fr * 2 * k / SR) * math.exp(-k / SR * 3))
            * math.exp(-k / SR * 2.2) * min(1.0, k / 30) for k in range(n)]


def bass(m, dur=0.45):
    fr, n = f(m), int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        env = min(1.0, k / 80) * math.exp(-t * 3.0) * min(1.0, (n - k) / 300)
        out.append((math.sin(2 * math.pi * fr * t) + 0.25 * math.sin(4 * math.pi * fr * t)) * env)
    return out


def pad(ms, dur, att=0.6, rel=0.8):
    n = int(dur * SR)
    frs = [(f(m) * d) for m in ms for d in (0.997, 1.003)]
    out = []
    for k in range(n):
        t = k / SR
        env = min(1.0, t / att) * min(1.0, (dur - t) / rel)
        v = sum(math.sin(2 * math.pi * fr * t + j) for j, fr in enumerate(frs)) / len(frs)
        out.append(v * env * (0.85 + 0.15 * math.sin(2 * math.pi * 0.3 * t)))
    return out


def kick(dur=0.35):
    out, ph = [], 0.0
    for k in range(int(dur * SR)):
        t = k / SR
        fr = 45 + 90 * math.exp(-t * 28)
        ph += 2 * math.pi * fr / SR
        out.append(math.sin(ph) * math.exp(-t * 9))
    return out


def noise_burst(dur, decay, hp=0.85, bp=None):
    out, lp, prev = [], 0.0, 0.0
    for k in range(int(dur * SR)):
        x = rng.uniform(-1, 1)
        hpv = x - prev  # crude high-pass
        prev = x * hp
        if bp:
            lp += bp * (hpv - lp)
            hpv = lp
        out.append(hpv * math.exp(-k / SR * decay))
    return out


def clap():
    a = noise_burst(0.18, 22, bp=0.35)
    for off in (0.0, 0.011, 0.022):  # three quick hits like hands
        for k in range(int(0.006 * SR)):
            i = int(off * SR) + k
            if i < len(a):
                a[i] *= 1.6
    return a


def shaker():
    return noise_burst(0.06, 70, hp=0.98)


def paper_slap():
    s = noise_burst(0.09, 45, bp=0.45)
    th = [math.sin(2 * math.pi * 110 * k / SR) * math.exp(-k / SR * 30) for k in range(int(0.12 * SR))]
    return [s[k] * 0.9 + (th[k] if k < len(th) else 0) * 0.6 for k in range(len(s))] + th[len(s):]


def paper_tear(dur=0.4):
    out, prev = [], 0.0
    for k in range(int(dur * SR)):
        x = rng.uniform(-1, 1)
        v = x - prev * 0.97
        prev = x
        crackle = 1.0 if rng.random() < 0.35 else 0.25
        t = k / SR
        out.append(v * crackle * math.sin(math.pi * t / dur) * 0.6)
    return out


def swell(dur=2.0):
    return [rng.uniform(-1, 1) * (k / (dur * SR)) ** 2 for k in range(int(dur * SR))]


# ---------- arrangement (driven by the cue sheet) ----------
A, C_, D, E, F_, G = 57, 60, 62, 64, 65, 67  # A3 C4 D4 E4 F4 G4
CHORDS = {
    "Am": [A, C_, E], "F": [F_ - 12, A, C_], "C": [C_, E, G], "G": [G - 12, 59, D],
    "Em": [52, 55, 59], "Fadd9": [F_ - 12, A, C_, 67], "Cadd9": [C_, E, G, D + 12],
}
ROOT = {"Am": 45, "F": 41, "C": 48, "G": 43, "Em": 40, "Fadd9": 41, "Cadd9": 48}
PENTA = [69, 72, 74, 76, 79, 81]


def groove_bar(t0, chord, energy=1.0, bar_beats=4):
    """One bar of drums + bass + keys arpeggio starting at t0."""
    root = ROOT[chord]
    for b in range(bar_beats):
        t = t0 + b * BEAT
        if b % 2 == 0:
            add(t, kick(), 0.65)
        else:
            add(t, clap(), 0.2)
        for h in range(2 if energy < 1.2 else 4):
            add(t + h * BEAT / (2 if energy < 1.2 else 4), shaker(), 0.07 if h % 2 == 0 else 0.045, 0.5)
    for b, interval, length in [(0, 0, 0.45), (1.5, 12, 0.2), (2, 7, 0.4), (3.5, 12 if energy > 1 else 7, 0.2)]:
        if b < bar_beats:
            add(t0 + b * BEAT, bass(root + interval, length), 0.42)
    notes = CHORDS[chord]
    for e in range(bar_beats * 2):
        m = notes[e % len(notes)] + 12 + (12 if e % 4 == 3 else 0)
        add(t0 + e * BEAT / 2, epiano(m, 0.4), 0.13 * energy, -0.35 if e % 2 else 0.35)


def bars(start, end, chord, energy):
    """Fill [start, end) with 4-beat bars (a shorter last bar if needed)."""
    t = start
    while t < end - 1e-6:
        beats = min(4, round((end - t) / BEAT))
        groove_bar(t, chord, energy, beats)
        t += beats * BEAT


def intro(s):
    a, b, ch = s["start"], s["end"], s.get("chord", "Am")
    add(a, pad(CHORDS[ch] + [71], b - a + 0.2, att=min(2.5, (b - a) / 3), rel=0.6), 0.22)
    t = a
    while t < b - 1e-6:
        add(t, tick(), 0.12, 0.4)
        t += BEAT
    r = random.Random(s.get("seed", 11))
    t = a + BEAT * 2
    while t < b - 0.5:
        add(t, epiano(r.choice(PENTA), 1.2), 0.28, r.uniform(-0.5, 0.5))
        t += BEAT * r.choice([1, 1.5, 2, 2])
    add(b - 2.0, swell(2.0), 0.08)


def hit(s):
    t, ch = s["at"], s.get("chord", "Cadd9")
    add(t, kick(), 0.8)
    for m in (72, 76, 79, 84):
        add(t, bell(m), 0.12, (m - 78) / 12)
    add(t, noise_burst(1.6, 2.2, hp=0.97), 0.09)
    add(t, pad(CHORDS[ch], s.get("sustain", 4) + 0.2, att=0.3), 0.18)
    notes = [72, 76, 79, 83, 79, 76, 74, 79]
    for k in range(int(s.get("sustain", 4) / BEAT) - 1):
        add(t + BEAT + k * BEAT, epiano(notes[k % len(notes)]), 0.22, 0.3 if k % 2 else -0.3)


def groove(s):
    chords, bar = s["chords"], s.get("bar", 4 * BEAT)
    add(s["start"], pad(CHORDS[chords[0]], s["end"] - s["start"], att=0.6), 0.1)
    t, i = s["start"], 0
    while t < s["end"] - 1e-6:
        bars(t, min(s["end"], t + bar), chords[i % len(chords)], s.get("energy", 1.0))
        t += bar
        i += 1


def steps(s):
    """One chord per on-screen step (e.g. a machine per 4 s); accents on chosen steps."""
    accents = set(s.get("accent_steps", []))
    for i, ch in enumerate(s["chords"]):
        t0 = s["start"] + i * s["step"]
        bars(t0, t0 + s["step"], ch, 1.3)
        add(t0, pad(CHORDS[ch], s["step"] + 0.1, att=0.15, rel=0.4), 0.09)
        add(t0, paper_slap(), 0.45, rng.uniform(-0.4, 0.4))
        for j, m in enumerate(CHORDS[ch]):
            add(t0 + j * 0.03, epiano(m + 12, 1.0), 0.16, -0.5 + j * 0.5)
        if i in accents:
            add(t0, bell(CHORDS[ch][0] + 24), 0.1)
            add(t0, noise_burst(0.9, 4, hp=0.97), 0.06)
        mr = random.Random(100 + i)
        for k, beat in enumerate([0.5, 1.5, 2.5, 3.0, 4.5, 6.0]):
            if beat * BEAT < s["step"]:
                add(t0 + beat * BEAT, epiano(mr.choice(PENTA) + (12 if k == 3 else 0), 0.7), 0.17, mr.uniform(-0.6, 0.6))


def lift(s):
    a, b, h = s["start"], s["end"], s.get("hit")
    add(a, pad(CHORDS["Fadd9"], (h or b) - a + 0.2, att=0.4), 0.36)
    for k, m in enumerate([77, 81, 84, 81, 79, 83]):
        if a + 0.25 + k * 0.5 < (h or b):
            add(a + 0.25 + k * 0.5, epiano(m, 0.9), 0.14, 0.4 if k % 2 else -0.4)
    add(max(a, (h or b) - 2.0), swell(2.0), 0.14)
    if h:
        add(h, pad(CHORDS["Am"] + [71], b - h - 0.8, att=0.1), 0.22)
        add(h, kick(), 0.85)
        add(h, paper_slap(), 0.55)
        for m in (69, 76, 81, 88):
            add(h, bell(m, 3.0), 0.11, (m - 78) / 14)
    for k, m in enumerate([69, 72, 76, 79, 81, 84, 86, 88]):
        add(b - 1.0 + k * 0.125, epiano(m, 0.8), 0.16, -0.6 + k * 0.17)
    add(b - 1.0, pad(CHORDS["G"] + [74], 1.2, att=0.2), 0.2)


def outro(s):
    a, b = s["start"], s["end"]
    add(a, kick(), 0.7)
    for m in (72, 76, 79, 86):
        add(a, bell(m, 3.0), 0.11, (m - 78) / 12)
    add(a, pad(CHORDS["Cadd9"], b - a, att=0.2, rel=2.5), 0.22)
    for k, m in enumerate([79, 76, 74, 72, 74, 76, 72]):
        if a + 0.5 + k * 0.75 < b - 2.5:
            add(a + 0.5 + k * 0.75, epiano(m, 0.7), 0.2, 0.3 if k % 2 else -0.3)
    t = a
    while t < b - 4:
        add(t, kick(), 0.4)
        t += 2 * BEAT
    add(b - 2.5, bass(36, 2.5), 0.4)
    for j, m in enumerate([60, 64, 67, 71, 74]):
        add(b - 2.5 + j * 0.05, epiano(m + 12, 2.4), 0.15, -0.6 + j * 0.3)


SECTIONS = {"intro": intro, "hit": hit, "groove": groove, "steps": steps, "lift": lift, "outro": outro}
for s in CUES["sections"]:
    SECTIONS[s["type"]](s)
for x in CUES.get("sfx", []):
    if x["kind"] == "tear":
        add(x["t"], paper_tear(), 0.22, rng.uniform(-0.6, 0.6))
    elif x["kind"] == "slap":
        add(x["t"], paper_slap(), 0.5, rng.uniform(-0.3, 0.3))
        add(x["t"], epiano(84, 0.6), 0.14, 0.4)
for f in CUES.get("fills", []):
    for k in range(4):
        add(f + k * 0.125, clap(), 0.12 + 0.05 * k)

# ---------- reverb send (two combs + allpass), master fade, soft clip, normalise ----------
def reverb(x, dl=(1557, 1617, 1491), g=0.78):
    y = array.array("f", bytes(4 * N))
    for d in dl:
        buf = [0.0] * d
        for i in range(N):
            o = buf[i % d]
            buf[i % d] = x[i] + o * g
            y[i] += o / len(dl)
    ap, d = [0.0] * 556, 556
    for i in range(N):
        o = ap[i % d]
        v = y[i] + 0.5 * o
        ap[i % d] = v
        y[i] = o - 0.5 * v
    return y


wetL, wetR = reverb(L), reverb(R, (1617, 1557, 1422))
peak = 0.0
for i in range(N):
    t = i / SR
    fade = min(1.0, t / 0.3) * min(1.0, (DUR - t) / 1.5)
    l = math.tanh((L[i] + 0.28 * wetL[i]) * 1.1) * fade
    r = math.tanh((R[i] + 0.28 * wetR[i]) * 1.1) * fade
    L[i], R[i] = l, r
    peak = max(peak, abs(l), abs(r))
gain = 0.89 / peak if peak else 1.0

out = OUT
out.parent.mkdir(parents=True, exist_ok=True)
frames = array.array("h", [0]) * (2 * N)
for i in range(N):
    frames[2 * i] = int(L[i] * gain * 32767)
    frames[2 * i + 1] = int(R[i] * gain * 32767)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(frames.tobytes())
print(f"wrote {out} peak-gain {gain:.2f}")
