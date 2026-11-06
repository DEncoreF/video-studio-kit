# Global camera motion of a reference clip: per frame, block matches fitted to one similarity transform (pan, tilt, zoom, roll),
# so a camera move can be read as numbers before rebuilding it on .world. Built for library/motion/camera-presets.json.
#   .venv/bin/python scripts/measure/globalmotion.py <video>
# Prints JSON: totals (pan_pct/tilt_pct camera right/down positive, zoom ratio, roll°), parallax (fit residual px: high = depth
# the 2D fit can't see — orbits, dolly zoom), speed_profile in tenths, peak_at, and per_frame [dx%, dy%, log-scale, roll°, residual].
import sys, json, subprocess
import numpy as np

W = 192

def frames(path):
    info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                           "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip().split(",")
    w, h = int(info[0]), int(info[1]); num, den = info[2].split("/"); fps = float(num) / float(den)
    H = int(round(h * W / w / 2) * 2)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True).stdout
    return fps, np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)

def phase_shift(a, b):
    A, B = np.fft.fft2(a - a.mean()), np.fft.fft2(b - b.mean())
    R = A.conj() * B; R /= np.abs(R) + 1e-6
    r = np.fft.ifft2(R).real; y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > a.shape[0] // 2: y -= a.shape[0]
    if x > a.shape[1] // 2: x -= a.shape[1]
    return x, y

def blocks(a, b, g):
    H, Wd = a.shape; B, S = 16, 6; pts, mv = [], []
    for cy in range(B + S + 2, H - B - S - 2, 12):
        for cx in range(B + S + 2, Wd - B - S - 2, 12):
            ref = a[cy - B // 2:cy + B // 2, cx - B // 2:cx + B // 2]
            if ref.std() < 4: continue
            best, bd = None, 1e18
            for dy in range(-S, S + 1):
                for dx in range(-S, S + 1):
                    y0, x0 = cy - B // 2 + dy + g[1], cx - B // 2 + dx + g[0]
                    if y0 < 0 or x0 < 0 or y0 + B > H or x0 + B > Wd: continue
                    d = np.abs(b[y0:y0 + B, x0:x0 + B] - ref).sum()
                    if d < bd: bd, best = d, (dx + g[0], dy + g[1])
            if best: pts.append((cx - Wd / 2, cy - H / 2)); mv.append(best)
    return np.array(pts, float), np.array(mv, float)

def fit(p, m):
    # x' = (1+a)x - b y + tx ; y' = b x + (1+a) y + ty
    for _ in range(3):
        A = np.zeros((2 * len(p), 4)); r = np.zeros(2 * len(p))
        A[0::2] = np.c_[p[:, 0], -p[:, 1], np.ones(len(p)), np.zeros(len(p))]
        A[1::2] = np.c_[p[:, 1], p[:, 0], np.zeros(len(p)), np.ones(len(p))]
        r[0::2], r[1::2] = m[:, 0], m[:, 1]
        sol = np.linalg.lstsq(A, r, rcond=None)[0]; res = np.abs(A @ sol - r).reshape(-1, 2).max(1)
        keep = res < max(1.5, np.percentile(res, 75))
        if keep.all() or keep.sum() < 8: break
        p, m = p[keep], m[keep]
    a, b, tx, ty = sol
    return tx, ty, np.log(np.hypot(1 + a, b)), np.degrees(np.arctan2(b, 1 + a)), float(np.median(res))

fps, F = frames(sys.argv[1]); H = F.shape[1]; per = []
for i in range(1, len(F)):
    g = phase_shift(F[i - 1], F[i]); g = (int(np.clip(g[0], -40, 40)), int(np.clip(g[1], -40, 40)))
    p, m = blocks(F[i - 1], F[i], g)
    if len(p) < 8: per.append([0, 0, 0, 0, 0, 1]); continue
    tx, ty, ls, rot, par = fit(p, m)
    # camera motion = opposite of image motion; percent of frame width / height
    per.append([-tx / W * 100, -ty / H * 100, ls, rot, par, 0])
P = np.array(per)
cut = P[:, 4] > 3  # failed fits (cuts, flashes) — treat as unknown
spd = np.hypot(P[:, 0], P[:, 1]) + np.abs(P[:, 2]) * 100 + np.abs(P[:, 3]) * 2
bins = np.array_split(spd, 10)
print(json.dumps({
    "fps": fps, "frames": len(F), "seconds": round(len(F) / fps, 2),
    "pan_pct": round(float(P[~cut, 0].sum()), 1), "tilt_pct": round(float(P[~cut, 1].sum()), 1),
    "zoom": round(float(np.exp(P[~cut, 2].sum())), 3), "roll_deg": round(float(P[~cut, 3].sum()), 1),
    "parallax_px": round(float(np.median(P[:, 4])), 2), "bad_frames": int(cut.sum() + P[:, 5].sum()),
    "speed_profile": [round(float(b.mean()), 2) for b in bins],
    "peak_at": round(float(np.argmax(np.convolve(spd, np.ones(5) / 5, "same")) / len(spd)), 2),
    "per_frame": [[round(float(x), 3) for x in r[:5]] for r in P],
}))
