import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("apps/web/app/globals.css", "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`selector not found in globals.css: ${selector}`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function tokens(...blocks: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) {
    for (const m of b.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  }
  return out;
}

const dark = tokens(block(":root"));
const light = { ...dark, ...tokens(block(':root[data-theme="light"]')) };
const THEMES = { light, dark } as const;

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TINTS = ["lavender", "sky", "mint", "butter", "rose"].map((t) => `tint-${t}`);
const SURFACES = ["bg", "card", ...TINTS];

type Pair = [fg: string, bg: string, min: number];
const pairs: Pair[] = [];
for (const fg of ["text", "text-secondary"]) for (const bg of SURFACES) pairs.push([fg, bg, 4.5]);
// text-tertiary is metadata on the panel and cards only (DESIGN.md Colors).
for (const bg of ["bg", "card"]) pairs.push(["text-tertiary", bg, 4.5]);
pairs.push(["on-accent", "accent", 4.5], ["on-frame", "frame", 4.5], ["on-frame-muted", "frame", 4.5]);
pairs.push(["on-frame", "frame-raised", 4.5], ["on-frame-muted", "frame-raised", 4.5]);
for (const fg of ["success", "warning", "error", "info"]) {
  for (const bg of ["bg", "card"]) pairs.push([fg, bg, 4.5]);
}
for (const bg of ["bg", "card"]) pairs.push(["border", bg, 3]);
for (const bg of TINTS) pairs.push(["error", bg, 3]);
// The focus ring is a 2px accent outline: a non-text UI component (WCAG 1.4.11).
for (const bg of SURFACES) pairs.push(["accent", bg, 3]);

describe.each(Object.entries(THEMES))("contrast, %s theme", (_name, t) => {
  it.each(pairs)("%s on %s meets %s:1", (fg, bg, min) => {
    expect(t[fg], `token ${fg}`).toBeDefined();
    expect(t[bg], `token ${bg}`).toBeDefined();
    const r = ratio(t[fg], t[bg]);
    expect(r, `${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });
});
