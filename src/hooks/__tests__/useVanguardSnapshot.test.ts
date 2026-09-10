import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

/* The workspace store persists through the Tauri plugin-store, which has no
   window internals under vitest (same stub as BoardView.test.tsx). */
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { buildSnapshot } from "@/hooks/useVanguardSnapshot";
import type { HandoffInfo } from "@/lib/bands";
import { useBandStore } from "@/stores/useBandStore";
import { useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/* Fixtures are fully synthetic: this repo is public, so no real handoff
   slugs or project paths appear here. */

/* Parked now means recent AND carrying an open ask, so the fixture has to be
   both for this test to be about the live-directory rule rather than about
   the freshness filter. `lastActive` is relative to real time because
   buildSnapshot reads the clock itself; a fixed date would rot into a
   vacuous pass. */
function handoff(slug: string, path: string): HandoffInfo {
  return {
    slug,
    path,
    repo: path.split("/").pop() ?? path,
    branch: "main",
    uncommitted: 0,
    lastCommit: null,
    asks: ["do the thing"],
    lastAction: "did a step",
    waiting: false,
    lastActive: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    stale: false,
    orphan: false,
  };
}

describe("buildSnapshot", () => {
  beforeEach(() => {
    useSessionStore.setState({ sessions: [] });
    useWorkspaceStore.setState({ tabs: [] });
    useBandStore.setState({
      handoffs: [],
      repoPrs: [],
      watermarkMs: 0,
      externallyActiveDirs: new Set<string>(),
      tmuxSessions: [],
    });
  });

  it("publishes the same in-progress total the Building column shows", () => {
    /* The status line in the terminal reads this number rather than counting
       for itself: two tallies of "what is running" computed in two places is
       how the bar and the board came to disagree in the first place. */
    useBandStore.setState({
      tmuxSessions: [
        { name: "one", cwd: "/tmp/one", attached: true, created: 0, windows: 1 },
        { name: "two", cwd: "/tmp/two", attached: false, created: 0, windows: 1 },
      ],
      /* A tmux session only counts once a claude is actually live in its
         directory, which is the rule the Building column itself now uses.
         The third card is the live directory with no tmux session of its
         own. */
      externallyActiveDirs: new Set(["/tmp/one", "/tmp/two", "/tmp/elsewhere"]),
    });

    expect(buildSnapshot().buildingCount).toBe(3);
  });

  it("does not report a handoff as parked while a claude runs in its directory outside Maestro", () => {
    useBandStore.setState({
      handoffs: [handoff("live", "/tmp/proj-live"), handoff("idle", "/tmp/proj-idle")],
      externallyActiveDirs: new Set(["/tmp/proj-live"]),
    });

    const snapshot = buildSnapshot();
    const labels = (snapshot.parked as { label: string }[]).map((b) => b.label);

    expect(labels).toContain("Parked: proj-idle");
    expect(labels).not.toContain("Parked: proj-live");
  });
});
