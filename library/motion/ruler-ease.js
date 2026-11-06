// Eases measured from the transition ruler (.claude/skills/video-motion-craft/references/transition-ruler.md, 2026-10-24):
// eight Prompt Motion works, 60 fps, frame by frame. Copy this file into a film's assets/js and load it before the film's
// own script; every function maps 0..1 to progress, so it drops in wherever an ease is used.
(function (g) {
  const clamp = (x) => Math.min(1, Math.max(0, x));
  // the UI spring: 90% by frame 14, settled at frame 20 (two authors measured almost the same curve)
  const SPRING = [0, 0.07, 0.14, 0.23, 0.32, 0.4, 0.49, 0.57, 0.64, 0.71, 0.77, 0.82, 0.86, 0.89, 0.91, 0.93, 0.95, 0.96, 0.97, 0.985, 1];
  function spring(x) {
    const f = clamp(x) * (SPRING.length - 1), i = Math.min(SPRING.length - 2, Math.floor(f));
    return SPRING[i] + (SPRING[i + 1] - SPRING[i]) * (f - i);
  }
  // the one pop a film gets: overshoots by amt (about 6%) once, then settles
  function pop(x, amt = 0.06) {
    x = clamp(x);
    return spring(Math.min(1, x / 0.7)) + amt * Math.sin(Math.PI * clamp((x - 0.5) / 0.5));
  }
  // exits and shrinks: S-curve; zoom-through or shrink to a point: accelerate
  const sCurve = (x) => ((x = clamp(x)) < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const accel = (x) => Math.pow(clamp(x), 3);
  // a CSS cubic-bezier from frame.md as a function: GSAP does not read "cubic-bezier(…)" strings, it silently uses its default ease
  function bez(x1, y1, x2, y2) {
    const at = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; if (at(t, x1, x2) < x) lo = t; else hi = t; }
      return at((lo + hi) / 2, y1, y2);
    };
  }
  // durations in seconds (60 fps frames / 60)
  const T = {
    ui: 0.33,       // a UI element springs to a new state (90% at ~0.2 s)
    uiLong: 0.45,   // the same over ~200 px or more
    shape: 0.17,    // an abstract shape morph (8–12 frames)
    exit: 0.25,     // shrink or leave (11–17 frames)
    flood: 0.17,    // a fill takes the frame (8–11 frames)
    hidden: 0.22,   // the solid frame or iris that hides a seam (7–16 frames)
    blurOut: 0.08,  // old content blurs out once the shape starts (4–6 frames)
    stagger: 0.08,  // new content rows, blurred in from 80% of the shape
    passing: 0.13,  // a passing state holds (6–10 frames)
    seen: 0.3,      // a state meant to be seen holds (16–20 frames)
  };
  g.RulerEase = { spring, pop, sCurve, accel, bez, T };
})(typeof window !== "undefined" ? window : globalThis);
