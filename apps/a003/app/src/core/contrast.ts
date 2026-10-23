/**
 * WCAG colour-contrast maths — pure, no React, no RN. Used by the design tokens
 * (src/ui/theme.ts) and audited by scripts/validate.ts so every text/background
 * pair in both the light and dark palettes clears WCAG AA before we ship.
 */

/** Parse "#rrggbb" (or "#rgb") to [r,g,b] 0..255. Ignores alpha on rgba(). */
export function parseColor(input: string): [number, number, number] {
  const s = input.trim();
  const rgba = s.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const [r, g, b] = rgba[1].split(",").map((x) => Number(x.trim()));
    return [clampByte(r), clampByte(g), clampByte(b)];
  }
  let hex = s.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)));

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function relativeLuminance(color: string): number {
  const lin = parseColor(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Contrast ratio between two colours (1..21). Both must be opaque — for
 * translucent tints, pass the colour composited over its backdrop.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a possibly-translucent foreground (rgba) over an opaque backdrop → an opaque hex-equivalent. */
export function over(fg: string, bg: string): string {
  const m = fg.trim().match(/rgba?\(([^)]+)\)/i);
  if (!m) return fg;
  const parts = m[1].split(",").map((x) => Number(x.trim()));
  const alpha = parts.length > 3 ? parts[3] : 1;
  const [fr, fg2, fb] = [clampByte(parts[0]), clampByte(parts[1]), clampByte(parts[2])];
  const [br, bg2, bb] = parseColor(bg);
  const mix = (f: number, b: number) => clampByte(f * alpha + b * (1 - alpha));
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(fr, br))}${to2(mix(fg2, bg2))}${to2(mix(fb, bb))}`;
}

/** WCAG AA thresholds: 4.5 for normal text, 3.0 for large text and UI components. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0;

export function meetsAA(a: string, b: string, large = false): boolean {
  return contrastRatio(a, b) >= (large ? AA_LARGE : AA_NORMAL);
}
