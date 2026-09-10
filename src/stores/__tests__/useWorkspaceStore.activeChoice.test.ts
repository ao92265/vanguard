import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Tauri dependencies before importing the store
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/terminal", () => ({
  killSession: vi.fn().mockResolvedValue(undefined),
}));

import { useWorkspaceStore } from "../useWorkspaceStore";

function setTabs(tabs: Array<{ id: string; name: string; active: boolean }>) {
  useWorkspaceStore.setState({
    tabs: tabs.map((t) => ({
      ...t,
      projectPath: `/path/${t.name}`,
      sessionIds: [],
      sessionsLaunched: false,
      workspaceType: "single-repo" as const,
      repositories: [],
      selectedRepoPath: null,
      worktreeBasePath: null,
    })),
  });
}

describe("which project the app may spawn a terminal into", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      tabs: [],
      zoomTabOrders: {},
      activeChosenThisSession: false,
    });
  });

  it("treats a tab restored from disk as not chosen", () => {
    // Rehydration writes tabs and nothing else, so the active flag on them is
    // last week's answer to a question nobody has asked yet this launch.
    setTabs([{ id: "a", name: "stale", active: true }]);
    expect(useWorkspaceStore.getState().activeChosenThisSession).toBe(false);
  });

  it("counts picking a tab as choosing it", () => {
    setTabs([
      { id: "a", name: "stale", active: true },
      { id: "b", name: "wanted", active: false },
    ]);
    useWorkspaceStore.getState().selectTab("b");
    expect(useWorkspaceStore.getState().activeChosenThisSession).toBe(true);
    expect(useWorkspaceStore.getState().tabs.find((t) => t.active)?.id).toBe("b");
  });

  it("counts the app moving you off a closed tab as choosing for you", async () => {
    setTabs([
      { id: "a", name: "closing", active: true },
      { id: "b", name: "next", active: false },
    ]);
    await useWorkspaceStore.getState().closeTab("a");
    expect(useWorkspaceStore.getState().activeChosenThisSession).toBe(true);
    expect(useWorkspaceStore.getState().tabs.find((t) => t.active)?.id).toBe("b");
  });
});
