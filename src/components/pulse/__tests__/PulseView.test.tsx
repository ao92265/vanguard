import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The pulse store persists its flow history through the Tauri plugin-store,
   which has no window internals under vitest: without this stub every
   setState below throws an unhandled rejection out of the persist middleware
   (BoardView.test.tsx sets the same trap the same way). */
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { PulseView } from "@/components/pulse/PulseView";
import type { ActivityEvent, FlowScore, PulseMetrics } from "@/lib/pulse";
import { usePulseStore } from "@/stores/usePulseStore";

function metrics(over: Partial<PulseMetrics> = {}): PulseMetrics {
  return {
    date: "Tue 8 Sep",
    headline: { commits: 6, prs: 2, repos: 3, waiting: 1 },
    shipped: { commits: 6, prsOpened: 2, prsMerged: 1 },
    touched: { files: 14, added: 210, removed: 48 },
    activity: { edits: 22, testRuns: 3, testsPass: 41, testsFail: 0, toolCalls: 180 },
    focus: { active: 2, repos: 3, switches: 4 },
    attention: { waiting: 1, dirtyTrees: 2 },
    spark: {
      hours: ["8a", "9a", "10a", "11a"],
      activity: [10, 40, 5, 20],
      commits: [0, 2, 0, 1],
    },
    empty: "Nothing has started yet today.",
    ...over,
  };
}

function flow(over: Partial<FlowScore> = {}): FlowScore {
  return {
    today: {
      score: 74,
      word: "In flow",
      tier: "flow",
      delta: "up 9 on yesterday",
      deltaDirection: "up",
      deltaAgainstBackfill: false,
      factors: [
        {
          label: "Shipping",
          weight: 0.4,
          raw: 80,
          pct: 80,
          detail: "6 commits, 1 merged",
          sign: "↑",
          tier: "flow",
        },
      ],
      insight: "Two long stretches with nothing waiting on you.",
    },
    streak: 3,
    trend: [],
    heat: [],
    wkActive: 4,
    wkAvg: 61,
    wkBest: 80,
    wkBackfilled: 0,
    explain: "Weighted from shipping, depth, switching and how long you were blocked.",
    ...over,
  };
}

const events: ActivityEvent[] = [{ kind: "commit", time: "9:15a", text: "Widen the importer" }];

function renderPulse(over: Record<string, unknown> = {}) {
  usePulseStore.setState({
    metrics: metrics(),
    flow: flow(),
    activity: events,
    fetchedAt: Date.now(),
    error: null,
    isRefreshing: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  });
  render(<PulseView onClose={vi.fn()} />);
}

describe("PulseView", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("titles the screen as a real heading, not a styled span", () => {
    renderPulse();
    expect(screen.getByRole("heading", { level: 1, name: "Pulse" })).toBeVisible();
  });

  it("leads with the day's own headline counts at display size", () => {
    renderPulse();

    const numbers = screen.getByRole("region", { name: "Today in numbers" });
    expect(numbers).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "6 commits" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "2 pull requests" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "3 repos touched" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "1 waiting on you" })).toBeInTheDocument();
  });

  it("draws the hour timeline and marks the hours something landed", () => {
    renderPulse();

    expect(screen.getByRole("img", { name: "Tool calls by hour" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hours something landed" })).toBeInTheDocument();
    /* First, middle and last hour, not one label per bar: the reference's
       axis, and still the real span the spark was built over. */
    expect(screen.getByText("8a")).toBeInTheDocument();
    expect(screen.getByText("11a")).toBeInTheDocument();
  });

  it("keeps every detail row the numbers are read off", () => {
    renderPulse();

    expect(screen.getByText("6 commits · 2 opened · 1 merged")).toBeInTheDocument();
    expect(screen.getByText("14 files · +210 / −48")).toBeInTheDocument();
    expect(screen.getByText("22 edits · 180 tool calls")).toBeInTheDocument();
    expect(screen.getByText("3 runs · 41 passed · 0 failed")).toBeInTheDocument();
    expect(screen.getByText("2 live · 3 repos · 4 switches")).toBeInTheDocument();
    expect(screen.getByText("1 waiting · 2 dirty trees")).toBeInTheDocument();
  });

  it("says an unscored day has no score instead of printing a flattering one", () => {
    renderPulse({ flow: flow({ today: null }) });

    const card = screen.getByRole("region", { name: "Flow score" });
    expect(card).toHaveTextContent("no score");
    expect(card).toHaveTextContent(/scoring an untouched day only measures the absence/);
  });

  it("shows the day's empty sentence rather than an empty chart", () => {
    renderPulse({
      metrics: metrics({
        headline: { commits: 0, prs: 0, repos: 0, waiting: 0 },
        shipped: { commits: 0, prsOpened: 0, prsMerged: 0 },
        activity: { edits: 0, testRuns: 0, testsPass: 0, testsFail: 0, toolCalls: 0 },
      }),
    });

    expect(screen.getByText("Nothing has started yet today.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Tool calls by hour" })).not.toBeInTheDocument();
  });

  it("claims no agent hours, wait time or host, because nothing measures them", () => {
    renderPulse();

    expect(screen.queryByText(/agents working/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/avg wait/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/busiest host/i)).not.toBeInTheDocument();
  });
});
