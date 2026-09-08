import { act, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The persisted zustand stores hydrate through the Tauri store plugin at
// import time; happy-dom has no Tauri backend, so stub it out.
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get() {
      return undefined;
    }
    async set() {}
    async save() {}
  },
}));

// useTerminalDragDrop subscribes to the real Tauri window on mount.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: async () => () => {},
  }),
}));

// xterm.js cannot mount in happy-dom. The placeholder carries its session id
// so a rail click can be checked against the very same DOM node afterwards.
vi.mock("../TerminalView", () => ({
  TerminalView: ({ sessionId }: { sessionId: number }) => (
    <div data-testid="terminal-view" data-session-id={sessionId} />
  ),
}));

vi.mock("@/lib/terminal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/terminal")>();
  return {
    ...actual,
    spawnShell: vi.fn(async () => 1),
    createSession: vi.fn(async (id: number) => ({
      id,
      mode: "Claude",
      branch: null,
      status: "Working",
      worktree_path: null,
      project_path: "C:/proj",
      name: null,
    })),
    checkCliAvailable: vi.fn(async () => false),
    killSession: vi.fn(async () => {}),
    assignSessionBranch: vi.fn(async () => ({ branch: null, worktree_path: null })),
    waitForTerminalReady: vi.fn(async () => {}),
    writeStdin: vi.fn(async () => {}),
    writeSessionHooksConfig: vi.fn(async () => {}),
    removeSessionHooksConfig: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/mcp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp")>();
  return {
    ...actual,
    getProjectMcpServers: vi.fn(async () => []),
    loadProjectMcpDefaults: vi.fn(async () => null),
    setSessionMcpServers: vi.fn(async () => {}),
    writeSessionMcpConfig: vi.fn(async () => {}),
    writeOpenCodeMcpConfig: vi.fn(async () => {}),
    removeSessionMcpConfig: vi.fn(async () => {}),
    removeOpenCodeMcpConfig: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/plugins", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plugins")>();
  return {
    ...actual,
    getProjectPlugins: vi.fn(async () => ({ plugins: [], skills: [] })),
    loadProjectSkillDefaults: vi.fn(async () => null),
    loadProjectPluginDefaults: vi.fn(async () => null),
    loadBranchConfig: vi.fn(async () => null),
    saveBranchConfig: vi.fn(async () => {}),
    setSessionSkills: vi.fn(async () => {}),
    setSessionPlugins: vi.fn(async () => {}),
    writeSessionPluginConfig: vi.fn(async () => {}),
    removeSessionPluginConfig: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/git")>();
  return {
    ...actual,
    getBranchesWithWorktreeStatus: vi.fn(async () => []),
    invalidateCurrentBranchCache: vi.fn(),
  };
});

vi.mock("@/lib/worktreeManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worktreeManager")>();
  return {
    ...actual,
    prepareSessionWorktree: vi.fn(),
    cleanupSessionWorktree: vi.fn(async () => {}),
  };
});

import { invoke } from "@tauri-apps/api/core";
import { killSession, spawnShell } from "@/lib/terminal";
import { useSessionStore } from "@/stores/useSessionStore";
import { TerminalGrid, type TerminalGridHandle } from "../TerminalGrid";

const invokeMock = vi.mocked(invoke);
const killSessionMock = vi.mocked(killSession);
const spawnShellMock = vi.mocked(spawnShell);

/** Renders the grid with `count` launched slots, returning its handle and ids. */
async function renderLaunchedGridWith(count: number) {
  const ref = createRef<TerminalGridHandle>();
  const view = render(<TerminalGrid ref={ref} projectPath="C:/proj" tabId="tab-1" isActive />);
  const handle = ref.current;
  if (!handle) throw new Error("expected TerminalGrid ref to be attached");
  await act(async () => {
    for (let i = 1; i < count; i++) handle.addSession();
  });
  await act(async () => {
    await handle.launchAll();
  });
  await waitFor(() => expect(useSessionStore.getState().sessions).toHaveLength(count));
  // `ref.current` is replaced whenever the handle's deps change, so hand back
  // the ref itself for anything that reads live state through it.
  return { view, handle, ref, ids: useSessionStore.getState().sessions.map((s) => s.id) };
}

function panes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-testid='terminal-view']"));
}

describe("TerminalGrid session rail", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "generate_project_hash") return "hash";
      if (cmd === "list_claude_sessions") {
        return { sessions: [], total_found: 0, truncated: false, unreadable: 0 };
      }
      return [];
    });
    killSessionMock.mockClear();
    spawnShellMock.mockReset();
    let next = 0;
    spawnShellMock.mockImplementation(async () => {
      next += 1;
      return next;
    });
    useSessionStore.setState({ sessions: [], samuraiBySessionId: {}, parkedSessionIds: [] });
  });

  it("shows the rail only once a terminal is zoomed", async () => {
    const { view, handle, ids } = await renderLaunchedGridWith(2);
    expect(view.queryByRole("navigation", { name: "Sessions" })).not.toBeInTheDocument();
    await act(async () => {
      handle.zoomSession(ids[0]);
    });
    const rail = await view.findByRole("navigation", { name: "Sessions" });
    expect(rail).toHaveTextContent("2");
    expect(view.getByRole("button", { name: "Switch to Terminal 2" })).toBeInTheDocument();
  });

  it("selects a session without tearing any terminal down", async () => {
    const { view, handle, ids } = await renderLaunchedGridWith(2);
    await act(async () => {
      handle.zoomSession(ids[0]);
    });
    const before = panes(view.container);
    expect(before).toHaveLength(2);

    await act(async () => {
      view.getByRole("button", { name: "Switch to Terminal 2" }).click();
    });

    const after = panes(view.container);
    expect(after).toHaveLength(2);
    // Identity, not just count: a remounted pane is a new node and a lost
    // xterm scrollback, which is exactly what selecting a session must not do.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(killSessionMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sessions).toHaveLength(2);
  });

  it("keeps the split grid reachable from the rail", async () => {
    const { view, handle, ref, ids } = await renderLaunchedGridWith(2);
    await act(async () => {
      handle.zoomSession(ids[0]);
    });
    expect(ref.current?.isZoomed()).toBe(true);
    const before = panes(view.container);
    await act(async () => {
      view.getByRole("button", { name: "Exit zoom" }).click();
    });
    expect(ref.current?.isZoomed()).toBe(false);
    expect(view.queryByRole("navigation", { name: "Sessions" })).not.toBeInTheDocument();
    expect(panes(view.container)[0]).toBe(before[0]);
  });
});
