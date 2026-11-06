"""Warm lo-fi score from a cue sheet: dusty swung drums, nylon-guitar plucks, soft synth pad,
round sub bass, vinyl crackle and tape wobble. No piano or electric-piano voices.

Pure standard library, like compose.py. The cue sheet (keys: duration, bpm, swing, seed, progression, sections, sfx; an example lives with the film that uses it) lists sections
that restart the bar grid on each picture cut, so downbeats land on the scene changes:
  intro   — pad and plucks fade in, hats and kick join for the last bar
  groove  — the main loop (energy > 1 adds a pluck melody and busier hats)
  break   — drums drop out under a chapter card: a strum and a held chord
  lift    — fullest loop for the line-up
  outro   — one last strum, drums stop, the chord rings out with the crackle

  python3 pipelines/music/lofi.py <cues.json> <out.wav>
"""
import array, json, math, pathlib, random, sys, wave

CUES = json.loads(pathlib.Path(sys.argv[1]).read_text())
OUT = pathlib.Path(sys.argv[2])
SR = 44100
DUR = float(CUES["duration"])
N = int(SR * DUR)
BEAT = 60.0 / CUES.get("bpm", 70)
SWING = CUES.get("swing", 0.6)  # where the off-beat 8th lands inside the beat (0.5 = straight)
rng = random.Random(CUES.get("seed", 7))

# Two buses: drums stay dry; music (pad, plucks, bass) gets reverb and ducks under the kick.
BUS = {b: (array.array("f", bytes(4 * N)), array.array("f", bytes(4 * N))) for b in ("drums", "music")}
KICKS = []


def f(m):  # MIDI -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)


def add(t, sig, gain=1.0, pan=0.0, bus="music"):
    """Mix a mono signal at time t seconds with constant-power pan."""
    L, R = BUS[bus]
    i0 = int(t * SR)
    gl = gain * math.cos((pan + 1) * math.pi / 4)
    gr = gain * math.sin((pan + 1) * math.pi / 4)
    for k in range(max(0, -i0), min(len(sig), N - i0)):
        v = sig[k]
        L[i0 + k] += v * gl
        R[i0 + k] += v * gr


def lowpass(sig, a):
    """One-pole low-pass in place; a in (0, 1], smaller is darker."""
    y = 0.0
    for k in range(len(sig)):
        y += a * (sig[k] - y)
        sig[k] = y
    return sig


# ---------- voices ----------
def pluck(m, dur=1.6, soft=0.35, damp=0.996):
    """Nylon-string pluck (Karplus-Strong with fractional-delay allpass so chords stay in tune)."""
    period = SR / f(m) - 0.5
    P = int(period)
    frac = period - P
    c = (1 - frac) / (1 + frac)
    buf = lowpass([rng.uniform(-1, 1) for _ in range(P)], soft)
    mean = sum(buf) / P
    buf = [v - mean for v in buf]
    n, idx, last, ax, ay = int(dur * SR), 0, 0.0, 0.0, 0.0
    out = [0.0] * n
    for k in range(n):
        x = buf[idx]
        avg = 0.5 * (x + last)
        last = x
        y = c * avg + ax - c * ay
        ax, ay = avg, y
        buf[idx] = y * damp
        out[k] = 2.6 * x * min(1.0, (n - k) / 800)  # KS output is quiet; bring it level with the pad
        idx = idx + 1 if idx + 1 < P else 0
    return lowpass(out, 0.45)


def strum(t, notes, gain, spread=0.022, dur=2.4, pan=0.0):
    for j, m in enumerate(notes):
        add(t + j * spread, pluck(m, dur, soft=0.3), gain * (0.8 + 0.2 * j / len(notes)), pan + (j - len(notes) / 2) * 0.06)


TABLE = 2048
SAW = [sum(math.sin(2 * math.pi * h * i / TABLE) / h for h in range(1, 7)) * 0.55 for i in range(TABLE)]


def pad(ms, dur, att=0.8, rel=1.0, cut=0.06):
    """Soft synth pad: detuned band-limited saws through a dark low-pass, slow swell."""
    n = int(dur * SR)
    incs = [f(m) * d * TABLE / SR for m in ms for d in (0.996, 1.004)]
    phs = [rng.random() * TABLE for _ in incs]
    out = [0.0] * n
    for k in range(n):
        v = 0.0
        for j, inc in enumerate(incs):
            p = phs[j] + inc
            if p >= TABLE:
                p -= TABLE
            phs[j] = p
            v += SAW[int(p)]
        t = k / SR
        out[k] = v / len(incs) * min(1.0, t / att) * min(1.0, (dur - t) / rel)
    return [v * 2.0 for v in lowpass(lowpass(out, cut), cut * 2)]


def sub(m, dur):
    """Round sub bass: sine plus a little second harmonic, soft attack."""
    fr, n = f(m), int(dur * SR)
    return [(math.sin(2 * math.pi * fr * k / SR) + 0.18 * math.sin(4 * math.pi * fr * k / SR))
            * 0.7 * min(1.0, k / 300) * math.exp(-k / SR * 1.2) * min(1.0, (n - k) / 900) for k in range(n)]


def kalimba(m, dur=1.2):
    """Thumb-piano tine: sine with a quick inharmonic click; sits above the pad."""
    fr, n = f(m), int(dur * SR)
    return [(math.sin(2 * math.pi * fr * k / SR) + 0.25 * math.sin(2 * math.pi * fr * 5.4 * k / SR) * math.exp(-k / SR * 40))
            * math.exp(-k / SR * 3.2) * min(1.0, k / 40) for k in range(n)]


def kick():
    out, ph = [], 0.0
    for k in range(int(0.45 * SR)):
        t = k / SR
        ph += 2 * math.pi * (48 + 70 * math.exp(-t * 30)) / SR
        out.append(0.75 * math.tanh(1.6 * math.sin(ph)) * math.exp(-t * 7))
    return lowpass(out, 0.25)


def noise(dur, decay, a=0.3, hp=0.0):
    out, y, prev = [], 0.0, 0.0
    for k in range(int(dur * SR)):
        x = rng.uniform(-1, 1)
        if hp:
            x, prev = x - prev * hp, x
        y += a * (x - y)
        out.append(y * math.exp(-k / SR * decay))
    return out


def snare():
    """Dusty snare: dark noise with a short body tone, a little longer than a clap."""
    nz = noise(0.32, 13, a=0.35, hp=0.6)
    return [nz[k] * 1.3 + 0.45 * math.sin(2 * math.pi * 185 * k / SR) * math.exp(-k / SR * 28) for k in range(len(nz))]


def hat(open_=False):
    return noise(0.16 if open_ else 0.05, 14 if open_ else 70, a=0.55, hp=0.97)


def paper_slap():
    s = noise(0.09, 45, a=0.45, hp=0.85)
    th = [math.sin(2 * math.pi * 110 * k / SR) * math.exp(-k / SR * 30) for k in range(int(0.12 * SR))]
    return [s[k] * 0.9 + th[k] * 0.6 if k < len(s) else th[k] * 0.6 for k in range(len(th))]


def paper_tear(dur=0.4):
    out, prev = [], 0.0
    for k in range(int(dur * SR)):
        x = rng.uniform(-1, 1)
        v = x - prev * 0.97
        prev = x
        out.append(v * (1.0 if rng.random() < 0.35 else 0.25) * math.sin(math.pi * k / SR / dur) * 0.6)
    return out


# ---------- harmony ----------
CHORDS = {  # voicings around middle C, root for the bass
    "Fmaj9": ([53, 57, 60, 64, 67], 41), "Em7": ([52, 55, 59, 62], 40), "Dm9": ([50, 53, 57, 60, 64], 38),
    "Cmaj7": ([48, 52, 55, 59], 36), "G13": ([53, 57, 59, 64], 43), "Gsus": ([55, 60, 62, 67], 43),
    "Cmaj9": ([48, 52, 55, 59, 62], 36), "Am9": ([48, 52, 55, 59, 60], 45),
}
PROG = CUES.get("progression", ["Fmaj9", "Em7", "Dm9", "Cmaj7"])
BAR = 4 * BEAT
bar_no = 0  # global bar counter so the progression keeps walking across cuts
MEL = [72, 74, 76, 79, 81, 84]


def sw(beat):
    """Swing an 8th-note position given in beats (x.5 moves to x.SWING)."""
    whole = math.floor(beat + 1e-9)
    return whole + (SWING if abs(beat - whole - 0.5) < 1e-6 else beat - whole)


def drum_bar(t0, beats, energy):
    for b in (0, 2.5):
        if b < beats:
            add(t0 + sw(b) * BEAT, kick(), 0.85, 0, "drums")
            KICKS.append(t0 + sw(b) * BEAT)
    if energy > 1 and beats > 3.5 and rng.random() < 0.5:
        add(t0 + 3.75 * BEAT, kick(), 0.4, 0, "drums")
        KICKS.append(t0 + 3.75 * BEAT)
    for b in (1, 3):
        if b < beats:
            add(t0 + b * BEAT + 0.018, snare(), 0.42, 0.05, "drums")  # laid back a hair
    step = 0.25 if energy > 1.1 else 0.5
    b = 0.0
    while b < beats - 1e-6:
        pos = sw(b) if step == 0.5 else b + (0.08 if (b * 4) % 2 == 1 else 0)
        accent = 1.0 if b == int(b) else 0.6
        add(t0 + pos * BEAT, hat(), 0.11 * accent * rng.uniform(0.8, 1.1), 0.35, "drums")
        b += step
    if beats > 3.5 and bar_no % 2 == 1:
        add(t0 + sw(3.5) * BEAT, hat(True), 0.07, 0.35, "drums")


def music_bar(t0, beats, chord, energy, melody):
    notes, root = CHORDS[chord]
    dur = beats * BEAT
    add(t0, pad(notes, dur + 0.15, att=0.25, rel=0.3), 0.30)
    add(t0, sub(root, 1.6 * BEAT), 0.5)
    if beats > 2.5:
        add(t0 + sw(2.5) * BEAT, sub(root + (7 if bar_no % 2 else 12), 1.0 * BEAT), 0.4)
    if beats > 3.5 and bar_no % 4 == 3:
        add(t0 + sw(3.5) * BEAT, sub(root - 2, 0.5 * BEAT), 0.3)
    r = random.Random(1000 + bar_no)
    pattern = [0, 0.5, 1.5, 2, 2.5, 3.5] if energy >= 1 else [0, 1.5, 2.5]
    for k, b in enumerate(pattern):
        if b < beats:
            m = notes[(k * 2 + bar_no) % len(notes)] + 12
            add(t0 + sw(b) * BEAT, pluck(m, 1.4), 0.26, -0.35 if k % 2 else 0.3)
    if melody:
        for b in r.sample([0.5, 1, 1.5, 2.5, 3, 3.5], 3):
            if b < beats:
                add(t0 + sw(b) * BEAT, pluck(r.choice(MEL), 1.8, soft=0.5), 0.2, r.uniform(-0.5, 0.5))


def loop(a, b, energy=1.0, melody=False, drums=True):
    global bar_no
    t = a
    while t < b - 1e-3:
        beats = min(4, round((b - t) / BEAT * 2) / 2)  # last bar may be a half-beat-trimmed bar
        if beats <= 0:
            break
        chord = PROG[bar_no % len(PROG)]
        if drums:
            drum_bar(t, beats, energy)
        music_bar(t, beats, chord, energy, melody)
        t += beats * BEAT
        bar_no += 1


def intro(s):
    global bar_no
    a, b = s["start"], s["end"]
    notes, root = CHORDS[PROG[0]]
    add(a, pad(notes, BAR + 0.1, att=1.6, rel=0.3), 0.30)
    for k, beat in enumerate([0.5, 1.5, 2, 3, 3.5]):
        add(a + sw(beat) * BEAT, pluck(notes[k % len(notes)] + 12, 1.6), 0.24, -0.3 if k % 2 else 0.3)
    bar_no += 1
    t = a + BAR
    beats = min(4, round((b - t) / BEAT * 2) / 2)
    b2 = 0.0
    while b2 < beats - 1e-6:
        add(t + sw(b2) * BEAT, hat(), 0.08, 0.35, "drums")
        b2 += 0.5
    add(t, kick(), 0.6, 0, "drums")
    KICKS.append(t)
    music_bar(t, beats, PROG[bar_no % len(PROG)], 0.8, False)
    bar_no += 1


def brk(s):
    a, b = s["start"], s["end"]
    notes, root = CHORDS[s.get("chord", "Gsus")]
    strum(a, [n + 12 for n in notes], 0.2, dur=b - a + 0.6)
    add(a, pad(notes, b - a + 0.25, att=0.15, rel=0.35), 0.32)
    add(a, sub(root, b - a), 0.45)
    add(a + 0.05, kalimba(notes[-1] + 12, 1.4), 0.12, 0.4)


def groove(s):
    loop(s["start"], s["end"], s.get("energy", 1.0), s.get("melody", False))


def lift(s):
    loop(s["start"], s["end"], s.get("energy", 1.2), True)
    for k, m in enumerate([76, 79, 81, 84]):
        add(s["start"] + k * BEAT, kalimba(m), 0.12, -0.4 + k * 0.25)


def outro(s):
    a, b = s["start"], s["end"]
    notes, root = CHORDS[s.get("chord", "Cmaj9")]
    add(a, kick(), 0.8, 0, "drums")
    KICKS.append(a)
    add(a + BEAT + 0.018, snare(), 0.3, 0.05, "drums")
    strum(a, [n + 12 for n in notes], 0.24, spread=0.035, dur=b - a)
    add(a, pad(notes, b - a, att=0.2, rel=2.8), 0.34)
    add(a, sub(root, 2.5), 0.5)
    for k, m in enumerate([79, 76, 74, 72]):
        add(a + 0.9 + k * sw(0.5) * BEAT * 1.4, kalimba(m, 1.6), 0.11, 0.3 if k % 2 else -0.3)


SECTIONS = {"intro": intro, "groove": groove, "break": brk, "lift": lift, "outro": outro}
for s in CUES["sections"]:
    SECTIONS[s["type"]](s)
for x in CUES.get("sfx", []):
    if x["kind"] == "tear":
        add(x["t"], paper_tear(), 0.2, rng.uniform(-0.6, 0.6), "drums")
    elif x["kind"] == "slap":
        add(x["t"], paper_slap(), 0.45, rng.uniform(-0.3, 0.3), "drums")


# ---------- master: reverb on music, kick ducking, vinyl, tape wobble, warmth ----------
def reverb(x, dl, g=0.8):
    y = array.array("f", bytes(4 * N))
    for d in dl:
        buf = [0.0] * d
        for i in range(N):
            o = buf[i % d]
            buf[i % d] = x[i] + o * g
            y[i] += o / len(dl)
    return lowpass(y, 0.2)


ML, MR = BUS["music"]
DL, DR = BUS["drums"]
wetL, wetR = reverb(ML, (1557, 1617, 1491, 1777)), reverb(MR, (1617, 1557, 1422, 1733))

duck = array.array("f", [1.0]) * N
for kt in KICKS:
    i0 = int(kt * SR)
    for k in range(int(0.32 * SR)):
        if 0 <= i0 + k < N:
            duck[i0 + k] = min(duck[i0 + k], 1 - 0.28 * math.exp(-k / SR * 9))

crackle = [0.0] * N
hiss = 0.0
for i in range(N):
    hiss += 0.08 * (rng.uniform(-1, 1) - hiss)
    crackle[i] = hiss * 0.012
    if rng.random() < 6 / SR:  # ~6 pops a second
        amp = rng.uniform(0.04, 0.16) * (1 if rng.random() < 0.5 else -1)
        for k in range(int(rng.uniform(8, 40))):
            if i + k < N:
                crackle[i + k] += amp * math.exp(-k / 6)

mixL = array.array("f", bytes(4 * N))
mixR = array.array("f", bytes(4 * N))
for i in range(N):
    m = duck[i]
    mixL[i] = DL[i] + (ML[i] + 0.35 * wetL[i]) * m + crackle[i]
    mixR[i] = DR[i] + (MR[i] + 0.35 * wetR[i]) * m + crackle[i] * 0.9


def wobble(x, phase):
    """Tape wow and flutter: read through a slowly wandering delay (linear interpolation)."""
    y = array.array("f", bytes(4 * N))
    base = 0.004 * SR
    for i in range(N):
        t = i / SR
        d = base + 0.0016 * SR * math.sin(2 * math.pi * 0.45 * t + phase) + 0.00015 * SR * math.sin(2 * math.pi * 6.3 * t)
        p = i - d
        j = int(p)
        if j >= 0:
            fr = p - j
            y[i] = x[j] * (1 - fr) + x[min(j + 1, N - 1)] * fr
    return y


mixL, mixR = wobble(mixL, 0.0), wobble(mixR, 0.3)
lowpass(mixL, 0.55)
lowpass(mixR, 0.55)

peak = 0.0
dcL = dcR = 0.0
for i in range(N):
    t = i / SR
    fade = min(1.0, t / 0.4) * min(1.0, (DUR - t) / 1.8)
    dcL += 0.0005 * (mixL[i] - dcL)
    dcR += 0.0005 * (mixR[i] - dcR)
    l = math.tanh((mixL[i] - dcL) * 1.2) * fade
    r = math.tanh((mixR[i] - dcR) * 1.2) * fade
    mixL[i], mixR[i] = l, r
    peak = max(peak, abs(l), abs(r))
gain = 0.89 / peak if peak else 1.0

OUT.parent.mkdir(parents=True, exist_ok=True)
frames = array.array("h", [0]) * (2 * N)
for i in range(N):
    frames[2 * i] = int(mixL[i] * gain * 32767)
    frames[2 * i + 1] = int(mixR[i] * gain * 32767)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(frames.tobytes())
print(f"wrote {OUT} peak-gain {gain:.2f} kicks {len(KICKS)}")
