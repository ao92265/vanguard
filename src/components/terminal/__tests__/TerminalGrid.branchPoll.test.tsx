import { act, render, waitFor } from "@testing-library/react";
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

// xterm.js cannot mount in happy-dom.
vi.mock("../TerminalView", () => ({
  TerminalView: () => <div data-testid="terminal-view" />,
}));

vi.mock("@/lib/terminal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/terminal")>();
  return {
    ...actual,
    spawnShell: vi.fn(async () => 1),
    checkCliAvailable: vi.fn(async () => false),
    killSession: vi.fn(async () => {}),
    listClaudeSessions: vi.fn(async () => ({
      sessions: [],
      total_found: 0,
      truncated: false,
      unreadable: 0,
    })),
  };
});

vi.mock("@/lib/mcp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp")>();
  return {
    ...actual,
    getProjectMcpServers: vi.fn(async () => []),
    loadProjectMcpDefaults: vi.fn(async () => null),
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
  };
});

vi.mock("@/lib/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/git")>();
  return {
    ...actual,
    getBranchesWithWorktreeStatus: vi.fn(),
    invalidateCurrentBranchCache: vi.fn(),
  };
});

import { invoke } from "@tauri-apps/api/core";
import { getBranchesWithWorktreeStatus } from "@/lib/git";
import { useSessionStore } from "@/stores/useSessionStore";
import { TerminalGrid } from "../TerminalGrid";

const invokeMock = vi.mocked(invoke);
const getBranchesMock = vi.mocked(getBranchesWithWorktreeStatus);

/** One branch list, shaped the way `list_branches` really returns one. */
const branchList = (current: string) => [
  { name: current, isRemote: false, isCurrent: true, hasWorktree: false },
];

/**
 * A poll whose resolution this test controls, keyed by the repository path it
 * was asked about. The whole defect lives in the window between the call and
 * its answer, so the test has to own that window rather than await it away.
 */
function deferredPolls() {
  const pending = new Map<string, (branches: ReturnType<typeof branchList>) => void>();
  getBranchesMock.mockImplementation(
    (repoPath: string) =>
      new Promise((resolve) => {
        pending.set(repoPath, resolve);
      }),
  );
  return {
    async answer(repoPath: string, current: string) {
      const resolve = pending.get(repoPath);
      if (!resolve) throw new Error(`no branch poll is in flight for ${repoPath}`);
      pending.delete(repoPath);
      await act(async () => {
        resolve(branchList(current));
      });
    },
  };
}

/** The branch picker button in the pre-launch card. */
function branchPicker(container: HTMLElement): HTMLElement {
  const button = container.querySelector<HTMLElement>("#prelaunch-branch");
  if (!button) throw new Error("the pre-launch card has no branch picker");
  return button;
}

describe("TerminalGrid branch polling across a repository switch", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "generate_project_hash") return "hash";
      if (cmd === "has_managed_worktree") return false;
      if (cmd === "list_claude_sessions") {
        return { sessions: [], total_found: 0, truncated: false, unreadable: 0 };
      }
      return [];
    });
    getBranchesMock.mockReset();
    useSessionStore.setState({ sessions: [], samuraiBySessionId: {}, parkedSessionIds: [] });
  });

  it("drops the previous repository's branches the moment the selection changes", async () => {
    // Selecting a different repository in a multi-repo workspace changes
    // `repoPath`, which starts a fresh poll. Until that poll answers, every
    // reader of `branches` — the picker here, and the resolves-to row through
    // it — is being shown a branch that belongs to a repository this session
    // will not touch.
    const polls = deferredPolls();
    const view = render(
      <TerminalGrid projectPath="/repo/alpha" repoPath="/repo/alpha" tabId="tab-1" isActive />,
    );
    await polls.answer("/repo/alpha", "alpha-main");
    await waitFor(() => expect(branchPicker(view.container)).toHaveTextContent("alpha-main"));

    view.rerender(
      <TerminalGrid projectPath="/repo/alpha" repoPath="/repo/beta" tabId="tab-1" isActive />,
    );

    await waitFor(() => expect(branchPicker(view.container)).not.toHaveTextContent("alpha-main"));
    await polls.answer("/repo/beta", "beta-main");
    await waitFor(() => expect(branchPicker(view.container)).toHaveTextContent("beta-main"));
  });

  it("lets a slow answer from the abandoned repository lose to the current one", async () => {
    // Two polls are in flight at once whenever the switch is quicker than the
    // first answer. Without a guard the LAST promise to settle wins, so a slow
    // repository can repaint the picker after the one you actually chose has
    // already answered — and nothing further will correct it, because no new
    // poll is coming.
    const polls = deferredPolls();
    const view = render(
      <TerminalGrid projectPath="/repo/alpha" repoPath="/repo/alpha" tabId="tab-1" isActive />,
    );
    view.rerender(
      <TerminalGrid projectPath="/repo/alpha" repoPath="/repo/beta" tabId="tab-1" isActive />,
    );

    await polls.answer("/repo/beta", "beta-main");
    await polls.answer("/repo/alpha", "alpha-main");

    expect(branchPicker(view.container)).toHaveTextContent("beta-main");
    expect(branchPicker(view.container)).not.toHaveTextContent("alpha-main");
  });

  it("keeps the list through an ordinary refresh of the same repository", async () => {
    // The guard on the clear above. Creating a branch, preparing a worktree and
    // opening the picker all call `refreshBranches` for the repository already
    // selected. Clearing on every call would blank the picker each time and
    // make it flicker through "Current" on the way back, which is a worse lie
    // than the one being fixed, not a smaller one.
    const polls = deferredPolls();
    const view = render(
      <TerminalGrid projectPath="/repo/alpha" repoPath="/repo/alpha" tabId="tab-1" isActive />,
    );
    await polls.answer("/repo/alpha", "alpha-main");
    await waitFor(() => expect(branchPicker(view.container)).toHaveTextContent("alpha-main"));

    // Same repository, so this is a refresh and not a switch.
    await act(async () => {
      branchPicker(view.container).click();
    });

    expect(branchPicker(view.container)).toHaveTextContent("alpha-main");
  });
});
