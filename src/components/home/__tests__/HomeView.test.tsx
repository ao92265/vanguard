import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HandoffInfo } from "@/lib/bands";
import { useActStore } from "@/stores/useActStore";
import { useBandStore } from "@/stores/useBandStore";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";
import { useSnoozeStore } from "@/stores/useSnoozeStore";
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

/** A parked handoff that asked two questions and recorded what it last did. */
function handoff(overrides: Partial<HandoffInfo> = {}): HandoffInfo {
  return {
    slug: "nanoclaw-telegram",
    path: "/tmp/wt/telegram",
    repo: "nanoclaw",
    branch: "feat/vanguard-telegram",
    uncommitted: 3,
    lastCommit: { hash: "abc1234", msg: "Route photos through the bridge" },
    asks: ["Restrict the bridge to your own chat id?", "Should it accept any chat it is added to?"],
    lastAction: "edit router.ts +38 -4",
    waiting: true,
    lastActive: new Date().toISOString(),
    stale: false,
    orphan: false,
    ...overrides,
  };
}

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
  useSnoozeStore.setState({ entries: [] });
});

afterEach(() => {
  for (const node of document.querySelectorAll(".terminal-cell")) node.remove();
});

it("titles the screen with the name the rail navigates by, as a real heading", () => {
  // Rail label, screen title and close control were "Inbox", "Blocked on you"
  // and "Close home". Every other destination's title is its rail label, and
  // a screen reader landing here had no heading to jump to at all.
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close inbox" })).toBeVisible();
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

it("asks the handoff's questions in the card and keeps its last action as a fact", () => {
  useSessionStore.setState({ sessions: [] });
  useBandStore.setState({ handoffs: [handoff()] });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  const card = within(focusCard());

  expect(card.getByText("Restrict the bridge to your own chat id?")).toBeVisible();
  expect(card.getByText("Should it accept any chat it is added to?")).toBeVisible();
  expect(card.getByText("Last action")).toBeVisible();
  expect(card.getByText("edit router.ts +38 -4")).toBeVisible();
  expect(card.getByText("3 files")).toBeVisible();
});

it("names the handoff's repo and says when it asked you something", () => {
  useSessionStore.setState({ sessions: [] });
  useBandStore.setState({
    handoffs: [
      handoff(),
      handoff({ slug: "wraith", path: "/tmp/wt/wraith", repo: "wraith", waiting: false }),
    ],
  });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);

  const card = within(focusCard());
  expect(card.getByText("nanoclaw")).toBeVisible();
  expect(card.getByText("ASKED YOU")).toBeVisible();
  expect(card.queryByText("Handoff")).toBeNull();

  const parked = within(screen.getByRole("list", { name: "Parked, pick up when you want" }));
  expect(parked.getByText("wraith")).toBeVisible();
  expect(parked.getByText("HANDOFF")).toBeVisible();
});

it("names the oldest blocked row in the header", () => {
  useSessionStore.setState({
    sessions: [
      { ...migration, lastMcpUpdateTime: Date.now() - 45 * 60_000 },
      { ...rollout, lastMcpUpdateTime: Date.now() - 5 * 60_000 },
    ],
  });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  expect(screen.getByText(/oldest 45m/)).toBeVisible();
  expect(screen.queryByText(/avg/i)).toBeNull();
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

/** Hide the row the focus card is showing, via its own "Later" control. */
function snoozeFocused(): void {
  fireEvent.click(within(focusCard()).getByRole("button", { name: /Later/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "1h" }));
}

it("drops a row you put off out of the count, whichever band it sat in", () => {
  // Only the blocked band was ever filtered by the snoozes, so putting off a
  // parked handoff hid nothing and left the total where it was: the queue said
  // three whether you had dealt with them or not.
  useBandStore.setState({ handoffs: [handoff()] });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  expect(within(focusCard()).getByText(/1 of 3/i)).toBeVisible();

  fireEvent.keyDown(focusCard(), { key: "j" });
  fireEvent.keyDown(focusCard(), { key: "j" });
  expect(within(focusCard()).getByText(/3 of 3/i)).toBeVisible();

  snoozeFocused();
  expect(within(focusCard()).getByText(/1 of 2/i)).toBeVisible();
});

it("lets you put off a run and a pull request, not just a session", () => {
  // These two rows offered one button each, and it was never a way out: a
  // queue of them could not be reduced by anything short of doing the work.
  useActStore.setState({
    gatedRuns: [
      {
        id: "r8",
        title: "Telegram photo routing",
        status: "running",
        stage: null,
        stages: [],
        createdAt: null,
        updatedAt: null,
        repoUrl: null,
        error: null,
      },
    ],
  });
  useSessionStore.setState({ sessions: [migration] });
  render(<HomeView onClose={() => {}} onNavigate={() => {}} />);
  expect(within(focusCard()).getByText(/1 of 2/i)).toBeVisible();

  fireEvent.keyDown(focusCard(), { key: "j" });
  expect(within(focusCard()).getByText("Telegram photo routing")).toBeVisible();

  snoozeFocused();
  expect(within(focusCard()).getByText(/1 of 1/i)).toBeVisible();
});
