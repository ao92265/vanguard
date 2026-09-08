import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Layout invariants that only exist in CSS, and that no rendered test can
 * reach: happy-dom applies no stylesheet, so a stacking-context or flow-width
 * regression here is invisible to every component test in the suite. These
 * assert the rules that other layers depend on, and name the dependency.
 */

// Vitest's root is the repo root (see vite.config.ts `test.include`).
const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");
const css = read("src/styles/globals.css");
const boardView = read("src/components/board/BoardView.tsx");

/** The declaration text of one flat rule, matched on its exact selector. */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `no CSS rule for ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function numeric(body: string, property: string): number {
  const match = new RegExp(`${property}:\\s*(-?\\d+)`).exec(body);
  return match ? Number(match[1]) : Number.NaN;
}

describe("workbench footer stacking", () => {
  it("lifts the whole footer above the board layer", () => {
    // `container-type: inline-size` computes to `contain: layout style
    // inline-size`, and layout containment establishes a stacking context.
    // TerminalNavigator's drop-up (z-50) is inside it, so its z-index is
    // clamped to the footer's, and the footer sits inside App's
    // `relative isolate z-0` next to a board that paints at z-45.
    const footer = ruleBody(".workbench-footer");
    expect(footer).toMatch(/container:\s*footer\s*\/\s*inline-size/);
    expect(footer).toMatch(/position:\s*relative/);

    const boardZ = Number(/absolute inset-0 z-\[(\d+)\]/.exec(boardView)?.[1]);
    expect(boardZ).toBeGreaterThan(0);
    expect(numeric(footer, "z-index")).toBeGreaterThan(boardZ);
  });
});

describe("workbench rail flow", () => {
  it("reserves content width from a slot, not from the rail itself", () => {
    // The rail overlays while transiently expanded. Only the slot's width
    // reaches the content column, so hover cannot resize a live terminal.
    expect(numeric(ruleBody(".workbench-rail-slot"), "width")).toBe(58);
    expect(numeric(ruleBody('.workbench-rail-slot[data-pinned="true"]'), "width")).toBe(232);

    const rail = ruleBody(".workbench-rail");
    expect(rail).toMatch(/position:\s*absolute/);
    expect(numeric(rail, "width")).toBe(58);
    expect(numeric(ruleBody('.workbench-rail[data-expanded="true"]'), "width")).toBe(232);
  });

  it("offsets the tools surface by the pinned width, not the hovered width", () => {
    expect(
      numeric(ruleBody('.workbench-rail[data-pinned="true"] + .workbench-tools-surface'), "left"),
    ).toBe(232);
  });

  it("floats the More popup out of the rail instead of stacking it in flow", () => {
    const popup = ruleBody(".workbench-more");
    expect(popup).toMatch(/position:\s*absolute/);
    // The rail clips horizontally to hide label overflow mid-transition, so
    // the popup only escapes while More is open.
    expect(ruleBody('.workbench-rail[data-more-open="true"]')).toMatch(/overflow:\s*visible/);
  });
});
