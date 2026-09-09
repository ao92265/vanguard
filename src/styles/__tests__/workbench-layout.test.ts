import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shell invariants that live in CSS or in class names, and that no rendered
 * test can reach: happy-dom applies no stylesheet, so a stacking-context, a
 * flow-width or a contrast regression here is invisible to every component
 * test in the suite. These assert the rules other layers depend on, and name
 * the dependency.
 */

// Vitest's root is the repo root (see vite.config.ts `test.include`).
const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

/** Every TypeScript source under `dir`, so a sweep cannot miss a new file. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const item of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) found.push(...sourceFiles(path));
    else if (item.name.endsWith(".ts") || item.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}
const css = read("src/styles/globals.css");
const boardView = read("src/components/board/BoardView.tsx");
const bottomBar = read("src/components/shared/BottomBar.tsx");
const tailwind = read("tailwind.config.ts");

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

/**
 * The design 1b surfaces whose accent fills are clean today, so this guard can
 * hold them at zero. An accent-filled control added to one of these is the
 * port's to get right; the thirty-odd accent buttons elsewhere in the app
 * predate it and are not in scope here.
 *
 * Deliberately NOT every file the port touched. `PreLaunchCard.tsx` is the
 * exception, and the reason is narrower than it first looks. Four accent fills
 * in that file carried hardcoded `text-white` at the merge base. Three are
 * untouched by this branch and belong to the out-of-scope bucket. The fourth is
 * the Launch/Resume Session button, which the port itself rewrote, so it was
 * the port's to get right: it is now `text-maestro-on-accent` like every other
 * ported control.
 *
 * So the file is held out only by the three it inherited, not by anything this
 * branch wrote. It joins this list the moment that bucket gets its own sweep.
 * Until then a NEW accent control added to this file goes unguarded, which is
 * the real cost of leaving it off.
 */
const PORTED_SURFACES = [
  "src/App.tsx",
  "src/components/board/BoardCard.tsx",
  "src/components/board/BoardColumn.tsx",
  "src/components/board/BoardView.tsx",
  "src/components/board/WorkLedger.tsx",
  "src/components/factory/FactoryView.tsx",
  "src/components/home/HomeView.tsx",
  "src/components/orchestrator/OrchestratorView.tsx",
  "src/components/pulse/MetricsPulse.tsx",
  "src/components/pulse/PulseView.tsx",
  "src/components/pulse/pulsePresentation.ts",
  "src/components/shared/BottomBar.tsx",
  "src/components/shared/ProjectTabs.tsx",
  "src/components/shared/TopBar.tsx",
  "src/components/shared/WorkbenchDock.tsx",
  "src/components/shared/WorkbenchRail.tsx",
  "src/components/shared/WorkbenchTitleBar.tsx",
  "src/components/terminal/ImageDeliverySheet.tsx",
  "src/components/terminal/ImageDestination.tsx",
  "src/components/terminal/SessionRail.tsx",
  "src/components/terminal/TerminalGrid.tsx",
];

// A solid accent fill. `bg-maestro-accent/15` is a tint, not a fill. Built
// fresh at each use: a `/g` regex carries `lastIndex` between calls.
const SOLID_ACCENT_FILL = "bg-maestro-accent(?![/\\w-])";
const solidFill = (flags = "") => new RegExp(SOLID_ACCENT_FILL, flags);

/**
 * The quoted literal a match sits inside. Class names cannot contain a quote,
 * so the nearest opener before the match and the next one of the same kind
 * after it bound the whole class list, however many lines it is wrapped over.
 */
function enclosingLiteral(source: string, index: number): string {
  let start = -1;
  let quote = '"';
  for (const candidate of ['"', "`"]) {
    const at = source.lastIndexOf(candidate, index);
    if (at > start) {
      start = at;
      quote = candidate;
    }
  }
  const end = source.indexOf(quote, index);
  return source.slice(start + 1, end === -1 ? source.length : end);
}

describe("workbench accent ink", () => {
  it("paints the footer's accent-filled action with the design system's onAccent", () => {
    // White on the dark accent (#828fff) is about 2.87:1 and fails WCAG AA for
    // normal text. `--onAccent` (#0d0d10 dark, #ffffff light) is about 6.77:1.
    expect(tailwind).toMatch(/"on-accent":\s*rgb\("on-accent"\)/);
    const launch = /className="([^"]*bg-maestro-accent [^"]*)"/.exec(bottomBar)?.[1] ?? "";
    expect(launch).toContain("text-maestro-on-accent");
    expect(launch).not.toContain("text-white");
  });

  it.each(PORTED_SURFACES)("gives every accent-filled control in %s its onAccent ink", (file) => {
    // BottomBar was the only file this rule covered while a camelCased
    // spelling of the token shipped on two other primary actions. An unknown
    // utility class raises no error in Tailwind, in tsc, in Biome or in
    // happy-dom, so a misspelling is invisible everywhere except a rendered
    // pixel. This is the only layer that can see it, so it reads every one.
    const source = read(file);
    const fills: string[] = [];
    for (const match of source.matchAll(solidFill("g"))) {
      fills.push(enclosingLiteral(source, match.index ?? -1));
    }

    for (const classes of fills) {
      // Sanity check on the extraction: a literal that lost its fill means the
      // quote walk went wrong and every assertion below it would be vacuous.
      expect(classes, `extraction failed in ${file}`).toMatch(solidFill());
      // A bare fill is a dot, a bar or a swatch: it carries no type, so it has
      // no ink to get wrong. Anything that styles type renders text on the
      // accent and must name the token, spelled the one way that exists.
      if (!/\b(text|font)-/.test(classes)) continue;
      expect(classes, `accent fill without onAccent ink in ${file}`).toContain(
        "text-maestro-on-accent",
      );
    }
  });

  it("uses no maestro colour token that Tailwind does not define", () => {
    // A camelCased spelling of the on-accent token generated no rule at all,
    // so the button inherited body ink onto the accent. Nothing downstream of
    // Tailwind can tell a misspelled utility from a deliberately unstyled
    // element, so every spelling is checked against the palette itself.
    const palette = new Set(
      [...tailwind.matchAll(/^\s+"?([a-z-]+)"?:\s*rgb\(/gm)].map((match) => match[1]),
    );
    expect(palette.has("on-accent")).toBe(true);

    const prefixes = "text|bg|border|ring|shadow|from|via|to|fill|stroke|divide|caret|placeholder";
    const used = new Map<string, string[]>();
    for (const file of sourceFiles("src")) {
      for (const match of read(file).matchAll(
        new RegExp(`\\b(?:${prefixes})-maestro-([A-Za-z][A-Za-z0-9-]*)`, "g"),
      )) {
        const token = match[1].replace(/\/.*$/, "");
        if (palette.has(token)) continue;
        used.set(token, [...(used.get(token) ?? []), file]);
      }
    }
    expect(Object.fromEntries(used)).toEqual({});
  });
});

describe("one shell, one implementation", () => {
  it("closes the window from exactly one place", () => {
    // The rail replaced the toolbar and the horizontal project strip, but both
    // were left behind carrying their own traffic lights. Three implementations
    // of minimize/maximize/close, two of them unreachable, is how the next
    // reader fixes the wrong one.
    const owners = sourceFiles("src")
      .filter((file) => !file.includes("__tests__"))
      .filter((file) => /appWindow\.(minimize|toggleMaximize|close)\(\)/.test(read(file)));
    expect(owners).toEqual(["src/components/shared/WorkbenchTitleBar.tsx"]);
  });

  it("renders one shell per shell component, with no dead alternative behind a flag", () => {
    // `<TopBar` and `<ProjectTabs` each occur exactly once in src/, and both
    // call sites take the rail. A second layout behind a prop is unreachable
    // code that still typechecks, still lints and still passes every test.
    const topBar = read("src/components/shared/TopBar.tsx");
    expect(topBar).not.toMatch(/layout\?:/);
    expect(topBar).not.toMatch(/workspace-toolbar/);
    const projectTabs = read("src/components/shared/ProjectTabs.tsx");
    expect(projectTabs).not.toMatch(/vertical\?:/);
    expect(projectTabs).not.toMatch(/project-strip/);
    const app = read("src/App.tsx");
    expect(app).not.toMatch(/layout=/);
    expect([...app.matchAll(/<(TopBar|ProjectTabs)\b/g)].map((m) => m[1])).toEqual([
      "TopBar",
      "ProjectTabs",
    ]);
  });
});
