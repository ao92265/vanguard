import { invoke } from "@tauri-apps/api/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomBar } from "../BottomBar";

// Stand-ins so the assertions are about mounting, not about whether either
// component's own poll happened to resolve. Both render null until their
// first reading arrives, which is exactly what made the CSS-hidden version
// look harmless while it went on fetching.
vi.mock("@/components/shared/EcosystemStrip", () => ({
  EcosystemStrip: () => <div data-testid="ecosystem-strip" />,
}));
vi.mock("../SystemMetrics", () => ({
  SystemMetrics: () => <div data-testid="system-metrics" />,
}));

// happy-dom ships a no-op ResizeObserver, so the footer never measures
// itself unless the test drives the callback.
let resize: ResizeObserverCallback | undefined;
class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resize = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reportFooterWidth(width: number) {
  act(() => {
    resize?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
  });
}

// The bar's neighbours (system metrics, usage, account) all poll on mount.
// The shared mock returns undefined, and useSystemMetrics chains `.then` on
// the result unguarded, which would poison the React root for every case here.
beforeEach(() => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  resize = undefined;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBottomBar(overrides: Partial<ComponentProps<typeof BottomBar>> = {}) {
  const handlers = {
    onLaunchAll: vi.fn(),
    onNavigateToSession: vi.fn(),
  };
  render(<BottomBar slotCount={0} launchedCount={0} {...handlers} {...overrides} />);
  return handlers;
}

describe("BottomBar launch button", () => {
  it("exposes quick-open and footer actions beside the live launch control", () => {
    const search = vi.fn();
    renderBottomBar({
      slotCount: 1,
      onSearch: search,
      actions: <button type="button">Reviews</button>,
    });
    fireEvent.click(screen.getByRole("button", { name: "Find project or terminal" }));
    expect(search).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reviews" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Launch Session" })).toBeEnabled();
  });
  it("renders no button when there is nothing left to launch", () => {
    // The pivot's trigger case: a permanently disabled "Launch Sessions" was
    // the only state wearing that label. Hide until launchable.
    renderBottomBar({ slotCount: 0, launchedCount: 0 });
    expect(screen.queryByRole("button", { name: /launch/i })).not.toBeInTheDocument();
  });

  it("renders no button when every slot is already running", () => {
    renderBottomBar({ slotCount: 3, launchedCount: 3 });
    expect(screen.queryByRole("button", { name: /launch/i })).not.toBeInTheDocument();
  });

  it("labels a single unlaunched slot in the singular", () => {
    renderBottomBar({ slotCount: 1, launchedCount: 0 });
    expect(screen.getByRole("button", { name: "Launch Session" })).toBeEnabled();
  });

  it("counts the unlaunched slots when there is more than one", () => {
    renderBottomBar({ slotCount: 4, launchedCount: 1 });
    expect(screen.getByRole("button", { name: "Launch All (3)" })).toBeEnabled();
  });

  it("fires onLaunchAll on click", () => {
    const { onLaunchAll } = renderBottomBar({ slotCount: 2, launchedCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Launch All (2)" }));

    expect(onLaunchAll).toHaveBeenCalledTimes(1);
  });
});

describe("BottomBar ancillary readouts", () => {
  it("leaves the ecosystem and system readouts unmounted in a normal-width footer", () => {
    renderBottomBar();
    reportFooterWidth(1314); // 1440px window, less the 58px rail and 68px dock
    expect(screen.queryByTestId("ecosystem-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-metrics")).not.toBeInTheDocument();
  });

  it("mounts them once the footer is wide enough to show them", () => {
    renderBottomBar();
    reportFooterWidth(1400);
    expect(screen.getByTestId("ecosystem-strip")).toBeInTheDocument();
    expect(screen.getByTestId("system-metrics")).toBeInTheDocument();
  });

  it("unmounts them again when the footer narrows, so their polling stops", () => {
    renderBottomBar();
    reportFooterWidth(1600);
    expect(screen.getByTestId("ecosystem-strip")).toBeInTheDocument();
    reportFooterWidth(900);
    expect(screen.queryByTestId("ecosystem-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-metrics")).not.toBeInTheDocument();
  });
});
