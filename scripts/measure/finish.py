# Light and material of a reference frame, as numbers a recipe can use (video-direction references/look-extraction.md):
# a glow's or a shadow's softness, reach and strength along a line you draw across it, and the frame's grain, vignette and
# levels. No outside tool reverses these from a picture (docs/research/reference-look-extraction-2026-11-04.md), so this
# fits the one model CSS and most renderers draw with: a hard edge blurred by a Gaussian.
#
#   .venv/bin/python scripts/measure/finish.py <image|video> [--at 2.5] glow   --line x0,y0,x1,y1 [--width 9] [--mark out.png]
#   .venv/bin/python scripts/measure/finish.py <image|video> [--at 2.5] shadow --line x0,y0,x1,y1 [--width 9] [--mark out.png]
#   .venv/bin/python scripts/measure/finish.py <image|video> [--at 2.5] frame  [--roi x,y,w,h]
#
# glow and shadow: the line starts on the object's edge (just outside the lit core or the casting object) and runs out across
# the halo or the shadow into plain background; --width averages that many pixels across the line. The tail is fitted as
# A·½erfc((d − off)/(σ√2)): sigma is the softness (CSS blur = 2σ), off is how far the edge sits past the line's start (offset
# plus spread along the line), A the strength (shadow: alpha ≈ A / background luma). fit_error over 0.08 means the profile is
# not one blurred edge (two lights, a gradient backdrop, texture): move the line; ok is false then, or when the strength is out of
# range or the tail does not fade out inside the line. Accuracy on known CSS: blur within ±15 %, offset and alpha within a few
# px and 0.02 (tests/finish.test.mjs). vignette only means something on a fairly even backdrop. Output is JSON on stdout.
import json, math, os, subprocess, sys
import numpy as np

TOOL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FF = next((p for p in [os.path.join(TOOL, "node_modules/ffmpeg-static/ffmpeg")] if os.path.exists(p)), "ffmpeg")
LUMA = np.array([0.2126, 0.7152, 0.0722])


def load(src, at=None):
    """RGB float array (H, W, 3), 0–255: an image, or a video's frame at `at` seconds (via ffmpeg, as PPM)."""
    cmd = [FF, "-v", "error", *(["-ss", str(at)] if at is not None else []), "-i", src, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "ppm", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    parts, i = [], 0
    while len(parts) < 4:   # P6, width, height, maxval, separated by whitespace
        while raw[i:i + 1].isspace(): i += 1
        j = i
        while not raw[j:j + 1].isspace(): j += 1
        parts.append(raw[i:j]); i = j
    w, h = int(parts[1]), int(parts[2])
    return np.frombuffer(raw[i + 1:i + 1 + w * h * 3], np.uint8).reshape(h, w, 3).astype(float)


def sample(img, line, width):
    """Mean RGB at 1 px steps along the line, averaged over `width` px across it (bilinear)."""
    x0, y0, x1, y1 = line
    n = max(2, int(round(math.hypot(x1 - x0, y1 - y0))) + 1)
    t = np.linspace(0, 1, n)
    nx, ny = (y0 - y1) / max(n - 1, 1), (x1 - x0) / max(n - 1, 1)   # unit normal
    offs = np.arange(width) - (width - 1) / 2
    xs = (x0 + t[:, None] * (x1 - x0) + offs[None, :] * nx).clip(0, img.shape[1] - 1.001)
    ys = (y0 + t[:, None] * (y1 - y0) + offs[None, :] * ny).clip(0, img.shape[0] - 1.001)
    xi, yi = xs.astype(int), ys.astype(int); fx, fy = (xs - xi)[..., None], (ys - yi)[..., None]
    v = (img[yi, xi] * (1 - fx) * (1 - fy) + img[yi, xi + 1] * fx * (1 - fy) + img[yi + 1, xi] * (1 - fx) * fy + img[yi + 1, xi + 1] * fx * fy)
    return v.mean(axis=1)


def hexc(rgb):
    return "#" + "".join(f"{int(round(min(255, max(0, c)))):02x}" for c in rgb)


def erfc(x):
    """Vectorised erfc (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7)."""
    z = np.abs(x); t = 1 / (1 + 0.3275911 * z)
    y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * np.exp(-z * z)
    return np.where(x >= 0, y, 2 - y)


def fit(d, h):
    """Least-squares A·½erfc((d − off)/(σ√2)) over a σ × off grid, A solved per cell. Returns sigma, off, A, error (RMS / A)."""
    sig = np.unique(np.round(np.geomspace(0.5, max(2.0, d[-1] / 2), 120), 2))
    off = np.arange(-d[-1] / 2, d[-1] / 2 + 1, 1.0)
    S, O = np.meshgrid(sig, off, indexing="ij")
    u = (d[None, None, :] - O[..., None]) / (S[..., None] * math.sqrt(2))
    M = 0.5 * erfc(u)
    A = (M * h).sum(-1) / np.maximum((M * M).sum(-1), 1e-9)
    err = ((A[..., None] * M - h) ** 2).mean(-1)
    err[A <= 0] = np.inf
    k = np.unravel_index(np.argmin(err), err.shape)
    a = float(A[k])
    return float(S[k]), float(O[k]), a, float(math.sqrt(err[k]) / a) if a > 0 else 1.0


def edge(img, line, width, kind):
    rgb = sample(img, line, width)
    lum = rgb @ LUMA
    d = np.arange(len(lum), dtype=float)
    tail = max(5, len(lum) // 7)
    bg_rgb = np.median(rgb[-tail:], axis=0); bg = float(bg_rgb @ LUMA)
    h = (lum - bg) if kind == "glow" else (bg - lum)   # brighter than the background for a glow, darker for a shadow
    sigma, off, A, e = fit(d, np.clip(h, 0, None))
    near = rgb[: max(2, int(off + sigma) + 1)] if off + sigma > 0 else rgb[:2]
    out = {"kind": kind, "line": line, "width": width, "samples": len(lum), "background": hexc(bg_rgb), "background_luma": round(bg, 1),
           "sigma_px": round(sigma, 1), "css_blur_px": round(2 * sigma, 1), "edge_offset_px": round(off, 1), "strength": round(A, 1),
           "reach_px": round(off + 1.645 * sigma, 1),   # where the tail is down to 10 % of its edge value (erfc(1.645/√2) ≈ 0.1 at u = 1.645)
           "fit_error": round(e, 3),
           # one blurred edge that fades out inside the line: a small error, a strength a frame can hold, a tail that ends in background
           "ok": e <= 0.08 and 2 < A <= 1.5 * 255 and off + 1.645 * sigma > 0 and off + 2.5 * sigma < len(lum)}
    if kind == "glow":
        out["halo"] = hexc(near.mean(axis=0))
    else:
        out["alpha"] = round(min(1.0, A / max(bg, 1)), 2)
        dark = rgb[int(np.argmax(h))]
        ratio = dark / np.maximum(bg_rgb, 1)
        out["darkest"] = hexc(dark)
        out["tint"] = "neutral" if ratio.max() - ratio.min() < 0.04 else ["red", "green", "blue"][int(np.argmax(ratio))] + "-leaning"
    out["profile"] = [round(float(x), 1) for x in lum[:: max(1, len(lum) // 40)]]
    return out


def blur(a, s):
    k = np.exp(-0.5 * (np.arange(-3 * s, 3 * s + 1) / s) ** 2); k /= k.sum()
    a = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, a)
    return np.apply_along_axis(lambda c: np.convolve(c, k, "same"), 0, a)


def frame(img, roi):
    if roi:
        x, y, w, h = roi; img = img[y:y + h, x:x + w]
    L = img @ LUMA
    small = L[::2, ::2]
    smooth = blur(small, 2)
    grad = np.hypot(*np.gradient(smooth))
    flat = grad <= np.percentile(grad, 40)
    hp = (small - smooth)[flat]
    H, W = small.shape
    big = blur(small[::4, ::4], 3)
    h4, w4 = big.shape
    c = big[h4 // 3: 2 * h4 // 3, w4 // 3: 2 * w4 // 3].mean()
    corners = np.mean([big[: h4 // 6, : w4 // 6].mean(), big[: h4 // 6, -w4 // 6:].mean(), big[-h4 // 6:, : w4 // 6].mean(), big[-h4 // 6:, -w4 // 6:].mean()])
    return {"kind": "frame", "size": [img.shape[1], img.shape[0]], "grain_std": round(float(hp.std()), 2), "flat_share": round(float(flat.mean()), 2),
            "vignette": round(float(corners / max(c, 1)), 2), "black_p1": round(float(np.percentile(L, 1)), 1), "white_p99": round(float(np.percentile(L, 99)), 1),
            "clipped_share": round(float((L > 245).mean()), 4), "mean_luma": round(float(L.mean()), 1)}


def mark(img, line, width, path):
    m = img.copy()
    rgb = np.array([255, 40, 160])
    x0, y0, x1, y1 = line
    for t in np.linspace(0, 1, int(math.hypot(x1 - x0, y1 - y0)) * 2 + 2):
        x, y = int(x0 + t * (x1 - x0)), int(y0 + t * (y1 - y0))
        r = max(1, width // 2)
        m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1] = m[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1] * 0.4 + rgb * 0.6
    h, w = m.shape[:2]
    ppm = b"P6\n%d %d\n255\n" % (w, h) + m.clip(0, 255).astype(np.uint8).tobytes()
    subprocess.run([FF, "-v", "error", "-y", "-f", "image2pipe", "-vcodec", "ppm", "-i", "-", path], input=ppm, check=True)


def main(argv):
    args = list(argv)
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    nums = lambda s: [float(x) for x in s.split(",")]
    src = args[0]
    mode = next((a for a in args[1:] if a in ("glow", "shadow", "frame")), None)
    if not mode:
        sys.exit("usage: finish.py <image|video> [--at t] glow|shadow --line x0,y0,x1,y1 [--width 9] [--mark out.png] | frame [--roi x,y,w,h]")
    at = opt("--at"); img = load(src, float(at) if at else None)
    if mode == "frame":
        roi = [int(v) for v in nums(opt("--roi"))] if opt("--roi") else None
        res = frame(img, roi)
    else:
        if not opt("--line"): sys.exit(f"finish.py {mode}: --line x0,y0,x1,y1 is required (start on the edge, run out into background)")
        line, width = nums(opt("--line")), int(opt("--width", 9))
        res = edge(img, line, width, mode)
        if opt("--mark"): mark(img, line, width, opt("--mark")); res["mark"] = opt("--mark")
    res["source"] = src + (f" @ {at}s" if at else "")
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
