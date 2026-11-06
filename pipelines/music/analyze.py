"""Tempo, downbeat and section map of a music track, so edit.py cuts land on bar lines.

Pure standard library; the source must be a 16-bit stereo WAV (decode an MP3 first with the
project's ffmpeg-static). Prints the beat length, BPM, the first downbeat, and the bars where
loudness steps up or down by at least --step dB (the track's sections: lift, dip, ending).

  python3 pipelines/music/analyze.py <track.wav> [--step 1.8]
"""
import array, math, sys, wave

SRC = sys.argv[1]
STEP = float(sys.argv[sys.argv.index("--step") + 1]) if "--step" in sys.argv else 1.8
w = wave.open(SRC)
sr, n = w.getframerate(), w.getnframes()
a = array.array("h", w.readframes(n))
dur = n / sr

# onset envelope at 10 ms: positive change of log energy
hop = sr // 100
env, prev = [], 0.0
for k in range(n // hop):
    s = 0.0
    for i in range(k * hop, (k + 1) * hop, 3):
        x = a[2 * i] + a[2 * i + 1]
        s += x * x
    e = math.log(1 + s / 1e7)
    env.append(max(0.0, e - prev))
    prev = e


def comb(period, phase, start=300):
    s, t = 0.0, phase
    while t < len(env) - 1:
        if t >= start:
            s += env[int(round(t))]
        t += period
    return s


# coarse tempo by autocorrelation (60–180 BPM), then a fine comb search for period and phase
seg = env[300:min(len(env), 9000)]
_, lag = max((sum(seg[i] * seg[i + l] for i in range(len(seg) - l)), l) for l in range(33, 101))
_, P, ph = max((comb(p / 100, f / 10), p / 100, f / 10) for p in range(lag * 100 - 150, lag * 100 + 151, 2) for f in range(0, int(lag * 10), 5))
beat = P / 100
downbeat = max(((comb(4 * P, ph + b * P), ph / 100 + b * beat) for b in range(4)))[1]
bar = 4 * beat


def rms(t0, t1):
    s = a[2 * int(t0 * sr):2 * int(t1 * sr):2]
    return 20 * math.log10(math.sqrt(sum(x * x for x in s) / max(1, len(s))) / 32768 + 1e-9)


print(f"duration {dur:.2f} s · beat {beat:.4f} s · {60 / beat:.2f} BPM · bar {bar:.4f} s · first downbeat {downbeat:.3f} s")
print("bars: downbeat_k = first + k × bar")
levels, t, k = [], downbeat, 0
while t + bar <= dur:
    levels.append((k, t, rms(t, t + bar)))
    t += bar
    k += 1
print("section changes (bar, time, dB before → after):")
for (k0, t0, l0), (k1, t1, l1) in zip(levels, levels[1:]):
    if abs(l1 - l0) >= STEP:
        print(f"  bar {k1:3d}  {t1:7.3f} s  {l0:6.1f} → {l1:6.1f}  {'up' if l1 > l0 else 'down'}")
print("loudness per bar:", " ".join(f"{k}:{l:.0f}" for k, _, l in levels))
