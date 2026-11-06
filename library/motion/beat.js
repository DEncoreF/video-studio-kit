// One shared pulse for a film (video-motion-craft references/reads-and-beat.md §9): hits on beats, big changes on bar lines.
// Pure functions of time; nothing is stored between frames. Copy this file into a film's assets/js and load it before the
// film's own script (or import it in node: it sets globalThis.Beat and module.exports).
//   const B = Beat.make(120, 0.03);          // bpm, the first downbeat (s), beats per bar (default 4) — build/sections.json
//   B.beat, B.barLen                          // seconds per beat and per bar
//   B.pos(t)                                  // beat position (float): 0 at the first downbeat, 1 a beat later
//   B.n(t)                                    // beat number (integer)
//   B.bar(t)                                  // bar number (integer); B.barPos(t) the float
//   B.pulse(t, k = 8)                         // 1 on each beat, decays as exp(-k · seconds since the beat); 0 before the first downbeat
//   B.snap(t, "beat" | "bar" | "half")        // the nearest grid time ("half" = an eighth note)
//   B.off(t, unit)                            // signed seconds from the nearest grid time (+ = late)
//   B.at(n, unit)                             // the time of beat / bar / half number n
// Beat itself is Beat.make(120, 0) for quick tests.
(function (g) {
  const STEP = { beat: 1, half: 0.5, bar: null };
  function make(bpm = 120, offset = 0, beatsPerBar = 4) {
    const beat = 60 / bpm, barLen = beat * beatsPerBar;
    const len = (unit = "beat") => { if (!(unit in STEP)) throw new Error(`Beat: unknown unit "${unit}" (beat, bar, half)`); return unit === "bar" ? barLen : beat * STEP[unit]; };
    const pos = (t) => (t - offset) / beat;
    const n = (t) => Math.floor(pos(t) + 1e-9);
    const barPos = (t) => pos(t) / beatsPerBar;
    const bar = (t) => Math.floor(barPos(t) + 1e-9);
    const at = (k, unit = "beat") => offset + k * len(unit);
    const snap = (t, unit = "beat") => { const L = len(unit); return offset + Math.round((t - offset) / L) * L; };
    const off = (t, unit = "beat") => t - snap(t, unit);
    const pulse = (t, k = 8) => { if (t < offset) return 0; const since = (((t - offset) % beat) + beat) % beat; return Math.exp(-k * since); };
    return { bpm, offset, beatsPerBar, beat, barLen, pos, n, bar, barPos, at, snap, off, pulse, make };
  }
  const Beat = make(120, 0);
  g.Beat = Beat;
  if (typeof module !== "undefined" && module.exports) module.exports = Beat;
})(typeof window !== "undefined" ? window : globalThis);
