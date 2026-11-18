import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(p) ? [p] : [];
  });
}

describe("global cursor base style", () => {
  const css = readFileSync("apps/web/app/globals.css", "utf8");
  it("sets pointer on clickable elements and not-allowed on disabled ones", () => {
    expect(css).toMatch(/@layer base\s*{[^]*button,\s*\[role="button"\],\s*a\[href\],\s*summary\s*{\s*cursor:\s*pointer/);
    expect(css).toMatch(/button:disabled,\s*\[aria-disabled="true"\]\s*{\s*cursor:\s*not-allowed/);
  });
});

describe("user-facing copy", () => {
  const emoji = /\p{Extended_Pictographic}/u;
  const texts: [string, string][] = [];
  for (const f of files("apps/web/app")) {
    const src = readFileSync(f, "utf8");
    // JSX text nodes and string literals in attributes such as aria-label / placeholder.
    for (const m of src.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) texts.push([f, m[1]]);
    for (const m of src.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)) texts.push([f, m[1]]);
  }
  it("has no exclamation marks", () => {
    const bad = texts.filter(
      ([, t]) => /[A-Za-z.]!(\s|$|[.,?)])/.test(t) && !/&&|\|\||=/.test(t),
    );
    expect(bad).toEqual([]);
  });
  it("has no emoji", () => {
    const bad = texts.filter(([, t]) => emoji.test(t));
    expect(bad).toEqual([]);
  });
});
