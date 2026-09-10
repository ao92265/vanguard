import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Proposal } from "@/lib/orchestrator";
import { ORCHESTRATOR_SESSION_NAME, useOrchestratorStore } from "@/stores/useOrchestratorStore";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore, type WorkspaceTab } from "@/stores/useWorkspaceStore";
import { OrchestratorView } from "../OrchestratorView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get() {
      return null;
    }
    async set() {}
    async save() {}
    async delete() {}
  },
}));

/** True when `first` comes before `second` in document order. */
function precedes(first: Element, second: Element): boolean {
  // 4 is Node.DOCUMENT_POSITION_FOLLOWING.
  return (first.compareDocumentPosition(second) & 4) !== 0;
}

const proposal: Proposal = {
  id: 41,
  targetSessionId: 9,
  text: "Open a PR for feat/work-ledger",
  key: null,
  note: "tests green, 3 commits ahead",
  status: "pending",
  at: new Date().toISOString(),
  error: null,
};

let decide: ReturnType<typeof vi.fn>;

beforeEach(() => {
  decide = vi.fn().mockResolvedValue(undefined);
  useOrchestratorStore.setState({
    proposals: [proposal],
    safeMode: true,
    scope: [{ sessionId: 9, label: "ledger feat/work-ledger" }],
    sessionId: 3,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    setSafeMode: vi.fn().mockResolvedValue(undefined),
    setScope: vi.fn().mockResolvedValue(undefined),
    setSessionId: vi.fn(),
    decide,
  });
  useWorkspaceStore.setState({
    tabs: [{ id: "t1", name: "API", projectPath: "/tmp/api", active: true }] as WorkspaceTab[],
  });
  useSessionStore.setState({
    sessions: [
      { id: 3, project_path: "/tmp/api", name: ORCHESTRATOR_SESSION_NAME, status: "Working" },
      {
        id: 9,
        project_path: "/tmp/api",
        name: "ledger",
        branch: "feat/work-ledger",
        status: "Working",
      },
    ] as SessionConfig[],
  });
});

it("titles the screen as a real heading, not a styled span", () => {
  render(<OrchestratorView onClose={() => {}} />);
  expect(screen.getByRole("heading", { level: 1, name: "Orchestrator" })).toBeVisible();
});

it("puts the goal and scope card above the proposal rows", () => {
  render(<OrchestratorView onClose={() => {}} />);
  const goal = screen.getByRole("region", { name: "Goal and scope" });
  const proposals = screen.getByRole("region", { name: "Proposals" });
  expect(precedes(goal, proposals)).toBe(true);
  expect(within(goal).getByRole("textbox", { name: "Goal" })).toBeVisible();
  expect(within(goal).getByRole("button", { name: /ledger/ })).toBeVisible();
});

it("decides a proposal through the store instead of a shortcut", () => {
  render(<OrchestratorView onClose={() => {}} />);
  const row = screen.getByRole("listitem", { name: "Open a PR for feat/work-ledger" });
  fireEvent.click(within(row).getByRole("button", { name: "Approve" }));
  expect(decide).toHaveBeenCalledWith(41, true);
});

it("labels a proposal with its real status and no risk level", () => {
  render(<OrchestratorView onClose={() => {}} />);
  const row = screen.getByRole("listitem", { name: "Open a PR for feat/work-ledger" });
  expect(within(row).getByText("pending")).toBeVisible();
  expect(within(row).queryByText(/^(low|medium|high)$/i)).toBeNull();
  expect(within(row).getByText("tests green, 3 commits ahead")).toBeVisible();
});
