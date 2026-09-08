import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useActStore } from "@/stores/useActStore";
import { useBandStore } from "@/stores/useBandStore";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore, type WorkspaceTab } from "@/stores/useWorkspaceStore";
import { HomeView } from "../HomeView";

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

beforeEach(() => {
  useBandStore.setState({
    handoffs: [],
    repoPrs: [],
    handoffsError: null,
    prsError: null,
    externallyActiveDirs: new Set(),
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  useActStore.setState({ gatedRuns: [], refresh: vi.fn().mockResolvedValue(undefined) });
  useWorkspaceStore.setState({
    tabs: [{ id: "t1", name: "API", projectPath: "/tmp/api", active: true }] as WorkspaceTab[],
  });
  useSessionStore.setState({
    sessions: [
      {
        id: 7,
        project_path: "/tmp/api",
        name: "Migration",
        status: "NeedsInput",
        needsInputPrompt: "Review migration before applying changes",
      },
    ] as SessionConfig[],
  });
});

it("inspects a blocked item without navigating and returns focus on close", () => {
  const navigate = vi.fn();
  render(<HomeView onClose={() => {}} onNavigate={navigate} />);
  const item = screen.getByRole("button", { name: /Inspect.*Migration/ });
  fireEvent.click(item);
  expect(screen.getByRole("region", { name: "Work detail" })).toHaveFocus();
  const detail = within(screen.getByRole("region", { name: "Work detail" }));
  expect(detail.getByText("Review migration before applying changes")).toBeVisible();
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(detail.getByTitle("Jump to this terminal"));
  expect(navigate).toHaveBeenCalledWith("t1", 7);
  fireEvent.click(detail.getByRole("button", { name: "Close work detail" }));
  expect(item).toHaveFocus();
});

it("does not carry a rename editor over to another inspected session", () => {
  useSessionStore.setState({
    sessions: [
      ...useSessionStore.getState().sessions,
      {
        id: 8,
        project_path: "/tmp/api",
        name: "Checks",
        status: "Working",
        statusMessage: "Run tests",
      } as SessionConfig,
    ],
  });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Inspect.*Migration/ }));
  fireEvent.click(screen.getByTitle("Rename this session"));
  fireEvent.change(screen.getByRole("textbox", { name: "Rename session" }), {
    target: { value: "Old draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Inspect.*Checks/ }));
  expect(screen.queryByRole("textbox", { name: "Rename session" })).not.toBeInTheDocument();
});
