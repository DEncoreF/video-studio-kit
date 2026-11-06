// Region comparison for the critic loop (scripts/measure/critic-loop.mjs): how far a render's region is from the reference's,
// in luminance (relative, on linear light) and hue (degrees). Inputs are mean sRGB colours 0..255.
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** Relative luminance (Rec. 709) of an sRGB colour, 0..1. */
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** Hue in degrees (0..360), or null when the colour is too grey or too dark for hue to mean anything. */
export function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 8 || d < 6) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
/**
 * ref, ours: mean sRGB. tol: allowed relative luminance error (0.1 = ±10%); hueTol in degrees.
 * Very dark regions (both under `floor` luminance) pass on absolute difference, since ±10% of almost black is noise.
 */
export function compareRegion(ref, ours, { tol = 0.1, hueTol = 15, floor = 0.004 } = {}) {
  const lr = luminance(ref), lo = luminance(ours);
  const dark = lr < floor && lo < floor, dL = dark ? 0 : (lo - lr) / Math.max(lr, 1e-6);
  const hr = hue(ref), ho = hue(ours), dHue = hr === null || ho === null ? null : Math.abs((((ho - hr) % 360) + 540) % 360 - 180);
  return { lumRef: lr, lum: lo, dL, dHue, dark, pass: Math.abs(dL) <= tol && (dHue === null || dHue <= hueTol) };
}
