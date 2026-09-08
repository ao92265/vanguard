import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useActStore } from "@/stores/useActStore";
import { useBandStore } from "@/stores/useBandStore";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";
import { useTourStore } from "@/stores/useTourStore";
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

/** True when `first` comes before `second` in document order. */
function precedes(first: Element, second: Element): boolean {
  // 4 is Node.DOCUMENT_POSITION_FOLLOWING.
  return (first.compareDocumentPosition(second) & 4) !== 0;
}

function focusCard(): HTMLElement {
  return screen.getByRole("region", { name: "Work detail" });
}

const migration: SessionConfig = {
  id: 7,
  project_path: "/tmp/api",
  name: "Migration",
  status: "NeedsInput",
  needsInputPrompt: "Review migration before applying changes",
} as SessionConfig;

const rollout: SessionConfig = {
  id: 9,
  project_path: "/tmp/api",
  name: "Rollout",
  status: "NeedsInput",
  needsInputPrompt: "Second task waiting on a decision",
} as SessionConfig;

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
  useSessionStore.setState({ sessions: [migration, rollout] });
  // The tour auto-opens on a fresh profile and owns the keyboard while it is
  // up, so every queue-keyboard assertion below would pass vacuously with it.
  useTourStore.setState({ isOpen: false });
});

afterEach(() => {
  for (const node of document.querySelectorAll(".terminal-cell")) node.remove();
});

it("focuses the first queued item and leaves the rest below it", () => {
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  const card = focusCard();
  expect(within(card).getByText("Review migration before applying changes")).toBeVisible();
  expect(within(card).getByText(/1 of 2/i)).toBeVisible();

  const rest = screen.getByRole("list", { name: "Then" });
  expect(within(rest).getByRole("button", { name: /Inspect.*Rollout/ })).toBeVisible();
  expect(within(rest).queryByRole("button", { name: /Inspect.*Migration/ })).toBeNull();
  expect(precedes(card, rest)).toBe(true);
});

it("inspects a queued item without navigating, then jumps from the card", () => {
  const navigate = vi.fn();
  render(<HomeView onClose={() => {}} onNavigate={navigate} />);
  fireEvent.click(screen.getByRole("button", { name: /Inspect.*Rollout/ }));

  expect(focusCard()).toHaveFocus();
  const card = within(focusCard());
  expect(card.getByText("Second task waiting on a decision")).toBeVisible();
  expect(navigate).not.toHaveBeenCalled();

  fireEvent.click(card.getByTitle("Jump to this terminal"));
  expect(navigate).toHaveBeenCalledWith("t1", 9);
});

it("moves the focused item with j and k", () => {
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  fireEvent.keyDown(focusCard(), { key: "j" });
  expect(focusCard()).toHaveTextContent("Second task waiting on a decision");

  fireEvent.keyDown(focusCard(), { key: "k" });
  expect(focusCard()).toHaveTextContent("Review migration before applying changes");
});

it("ignores j and k typed into a form field", () => {
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  fireEvent.click(within(focusCard()).getByTitle("Rename this session"));
  const field = screen.getByRole("textbox", { name: "Rename session" });

  fireEvent.keyDown(field, { key: "j" });
  expect(focusCard()).toHaveTextContent("Review migration before applying changes");
  expect(screen.getByRole("textbox", { name: "Rename session" })).toBeVisible();
});

it("ignores j and k coming from a terminal", () => {
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  const terminal = document.createElement("div");
  terminal.className = "terminal-cell";
  const surface = document.createElement("div");
  terminal.appendChild(surface);
  document.body.appendChild(terminal);

  fireEvent.keyDown(surface, { key: "j" });
  expect(focusCard()).toHaveTextContent("Review migration before applying changes");
});

it("does not carry a rename editor over to another inspected session", () => {
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  fireEvent.click(within(focusCard()).getByTitle("Rename this session"));
  fireEvent.change(screen.getByRole("textbox", { name: "Rename session" }), {
    target: { value: "Old draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Inspect.*Rollout/ }));
  expect(screen.queryByRole("textbox", { name: "Rename session" })).not.toBeInTheDocument();
});

it("leaves j and k to the tour while the tour is open", () => {
  useTourStore.setState({ isOpen: true });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  fireEvent.keyDown(focusCard(), { key: "j" });
  expect(focusCard()).toHaveTextContent("Review migration before applying changes");
});

it("keeps the landed and running bands reachable below the blocked queue", () => {
  useSessionStore.setState({
    sessions: [
      migration,
      { id: 11, project_path: "/tmp/api", name: "Checks", status: "Working" } as SessionConfig,
    ],
  });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  const running = screen.getByRole("list", { name: "Running" });
  expect(within(running).getByRole("button", { name: /Inspect.*Checks/ })).toBeVisible();
});
