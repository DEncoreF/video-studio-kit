# Per-frame motion profile of a clip: where it stutters (moves, stops for a few frames, moves again), where motion jumps,
# and a sparkline every 0.1 s. Use it on our renders and on the rulers (video-motion-craft references/transition-ruler.md §2; the review gate uses the same measure in scripts/lib/motion.mjs).
#   python3 scripts/measure/motion-profile.py <video> [more videos…]
# motion = mean absolute luma difference between frames at 480×270 (0–255); moving = above 0.15.
# stutter = a still run of ≤ 0.25 s between two real moves (motion > 1.0 within 0.2 s on both sides; a designed hold is
# longer, and a slow hold drift near the threshold does not count); spike = a frame-to-frame jump in
# motion above 3× the median moving value. Needs ffmpeg/ffprobe on PATH.
# snaps and pops = one-frame discontinuities in a subject, measured on edges, not luma, so a white subject on a near-white
# ground still counts (the review gate's scripts/lib/motion.mjs jumps(), same rules and numbers):
#   M_k = Sobel gradient magnitude of frame k at 480×270, blurred (σ 8 px: an edge creeping across a cell boundary is not a
#   jump) and area-averaged to 32×18 (16-bit); d(k) = mean |M_k − M_{k−1}|.
#   jump at k: d(k) ≥ 15% of the picture's structure (mean M) and ≥ 3× every other step within ±0.1 s (one frame), or a
#   one-frame outlier (k and k+1 both jump, k+1 is back). back = how far the picture comes back toward frame k−1 within
#   0.5 s, on a coarse 8×6 map (the subject's own drift does not count). snap = back ≥ 0.3, reached by moving (no step on
#   the way back over half the jump): it jumped for a frame and animated on from there, never designed. pop = it stays
#   (a hard cut, a swap, a thing appearing) or comes back with a second jump (a blink); fine at a seam, worth a look elsewhere.
import array, subprocess, sys

SNAP = dict(w=32, h=18, rel=0.15, iso=3, isoWin=0.1, back=0.3, backWin=0.5, glide=0.5)

def jumps(f, fps):
    N = SNAP["w"] * SNAP["h"]
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", f, "-vf", f"scale=480:270,format=gray,sobel,format=gray16le,gblur=sigma=8,scale={SNAP['w']}:{SNAP['h']}:flags=area", "-f", "rawvideo", "-pix_fmt", "gray16le", "-"], capture_output=True).stdout
    a = array.array("H"); a.frombytes(raw[: len(raw) // (2 * N) * 2 * N])
    if sys.byteorder == "big": a.byteswap()
    M = [a[i * N:(i + 1) * N] for i in range(len(a) // N)]; n = len(M)
    dist = lambda p, q: sum(abs(x - y) for x, y in zip(M[p], M[q])) / N
    E = [sum(m) / N for m in M]; d = [0.0] + [dist(k, k - 1) for k in range(1, n)]
    I = max(2, round(SNAP["isoWin"] * fps)); B = round(SNAP["backWin"] * fps)
    near = lambda k, skip=None: max([1.0] + [d[j] for j in range(max(1, k - I), min(n - 1, k + I) + 1) if j != k and j != skip])
    BW, BH = 4, 3; CW, CH = SNAP["w"] // BW, SNAP["h"] // BH
    C = []
    for m in M:
        o = [0] * (CW * CH)
        for c in range(N): o[(c // SNAP["w"] // BH) * CW + (c % SNAP["w"]) // BW] += m[c]
        C.append(o)
    far = lambda p, q: sum(abs(x - y) for x, y in zip(C[p], C[q]))
    def back(k):
        j0 = far(k, k - 1) or 1; best = (0.0, 0)
        for j in range(1, B + 1):
            if k + j >= n: break
            r = 1 - far(k + j, k - 1) / j0
            if r > best[0]: best = (r, j)
        return best
    snaps, pops = [], []
    for k in range(1, n):
        rel = d[k] / max(E[k], E[k - 1], 1)
        if rel < SNAP["rel"]: continue
        single = d[k] >= SNAP["iso"] * near(k)
        outlier = not single and k + 1 < n and min(d[k], d[k + 1]) >= SNAP["iso"] * near(k, k + 1) and dist(k + 1, k - 1) <= 0.5 * min(d[k], d[k + 1])
        if not single and not outlier: continue
        b, at = (1.0, 1) if outlier else back(k)
        glide = at > 0 and (outlier or all(d[j] <= SNAP["glide"] * d[k] for j in range(k + 1, k + at + 1)))
        (snaps if b >= SNAP["back"] and glide else pops).append((round(k / fps, 2), k))
    return snaps, pops

def profile(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip()
    a, b = (r.split("/") + ["1"])[:2]; fps = float(a) / float(b or 1)
    out = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", f, "-vf", "scale=480:270,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], capture_output=True, text=True).stdout
    v = [float(l.split("=")[1]) for l in out.splitlines() if "YAVG" in l]
    n = len(v); mov = [x > 0.15 for x in v]
    stutters, i = [], 0
    while i < n:
        if mov[i]: i += 1; continue
        j = i
        while j < n and not mov[j]: j += 1
        # only a stop between two real moves counts: a slow hold drift hovering around the threshold is not a stutter
        before = max(v[max(0, i - int(0.2 * fps)):i] or [0]); after = max(v[j:j + int(0.2 * fps)] or [0])
        if i > 0 and j < n and j - i <= int(0.25 * fps) and min(before, after) > 1.0: stutters.append((round(i / fps, 2), j - i))
        i = j
    mv = sorted(x for x in v if x > 0.15); med = mv[len(mv) // 2] if mv else 0; top = mv[-1] if mv else 1
    spikes = [round(k / fps, 2) for k in range(1, n) if v[k] - v[k - 1] > max(3 * med, 1.0)]
    still_tail = 0
    while still_tail < n and not mov[n - 1 - still_tail]: still_tail += 1
    step = max(1, round(fps / 10))
    spark = "".join(" ▁▂▃▄▅▆▇█"[min(8, int(max(v[k:k + step]) / top * 8))] for k in range(0, n, step))
    snaps, pops = jumps(f, fps)
    print(f"{f.split('/')[-1]}  fps {fps:.0f}  stutters {len(stutters)} {stutters[:12]}  spikes {spikes[:12]}  still at the end {still_tail / fps:.1f} s")
    print(f"  snaps {len(snaps)} {snaps[:12]}  pops {len(pops)} {pops[:12]}  (seconds, frame)")
    print("  " + spark)

for f in sys.argv[1:]: profile(f)
